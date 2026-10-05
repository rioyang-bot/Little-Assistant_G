const { spawn } = require('child_process');

const MODES = ['bottom', 'top', 'bottom-notify'];

function normalizeWindowLayerMode(value, legacyIsAlwaysOnTop) {
  return MODES.includes(value) ? value : (legacyIsAlwaysOnTop === false ? 'bottom' : 'top');
}

// Electron has no Windows always-on-bottom API. Keep the native window below
// ordinary application windows without activating it or changing its bounds.
// Embed the helper so this also works when this module lives inside app.asar.
function bottomHelperScript(handle, ownerPid, desktopOrganizer) {
  return `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Text;
public static class AssistantWindowLayer {
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int height, uint flags);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsWindowEnabled(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint command);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder name, int count);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr GetProp(IntPtr h, string name);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool SetProp(IntPtr h, string name, IntPtr value);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string className, string title);
  const string OrganizerProperty = "METechOrganizerWindow";
  // The shell window hosting the desktop icons. Windows "Show desktop" raises
  // it above every ordinary window instead of minimizing them.
  static bool IsDesktopHost(IntPtr window) {
    var name = new StringBuilder(256);
    GetClassName(window, name, name.Capacity);
    string type = name.ToString();
    return (type == "Progman" || type == "WorkerW") && IsWindowVisible(window)
      && FindWindowEx(window, IntPtr.Zero, "SHELLDLL_DefView", null) != IntPtr.Zero;
  }
  static IntPtr DesktopBelow(IntPtr window) {
    IntPtr current = window;
    for (int i = 0; i < 10000; i++) {
      current = GetWindow(current, 2); // GW_HWNDNEXT
      if (current == IntPtr.Zero || IsDesktopHost(current)) return current;
    }
    return IntPtr.Zero;
  }
  static bool CoveredByDesktop(IntPtr window) {
    IntPtr current = window;
    for (int i = 0; i < 10000; i++) {
      current = GetWindow(current, 3); // GW_HWNDPREV: windows above this one.
      if (current == IntPtr.Zero) return false;
      if (IsDesktopHost(current)) return true;
    }
    return false;
  }
  static bool OwnedBy(IntPtr window, IntPtr owner) {
    for (int i = 0; i < 64; i++) {
      window = GetWindow(window, 4); // GW_OWNER
      if (window == IntPtr.Zero) return false;
      if (window == owner) return true;
    }
    return false;
  }
  static bool NeedsLowering(IntPtr window) {
    IntPtr current = window;
    for (int i = 0; i < 10000; i++) {
      current = GetWindow(current, 2); // GW_HWNDNEXT: windows below this one.
      if (current == IntPtr.Zero) return false;
      // Anything below the desktop is hidden by it (for example during Show
      // desktop), so it must not push this window back underneath.
      if (IsDesktopHost(current)) return false;
      if (!IsWindowVisible(current) || IsIconic(current) || GetProp(current, OrganizerProperty) != IntPtr.Zero) continue;
      if (OwnedBy(current, window)) continue;
      var name = new StringBuilder(256);
      GetClassName(current, name, name.Capacity);
      string type = name.ToString();
      // Desktop and taskbars own their shell layers. Organizer siblings must
      // not keep pushing one another down, nor pull the assistant below them.
      if (type == "Progman" || type == "WorkerW" || type == "Shell_TrayWnd" || type == "Shell_SecondaryTrayWnd") continue;
      return true;
    }
    return false;
  }
  public static void Run(long handle, int ownerPid, bool desktopOrganizer) {
    IntPtr window = new IntPtr(handle);
    Process owner = Process.GetProcessById(ownerPid);
    Task<string> input = Task.Factory.StartNew(() => Console.ReadLine());
    bool marked = false;
    Console.WriteLine("ready");
    while (!input.IsCompleted && !owner.HasExited) {
      uint actualPid;
      if (GetWindowThreadProcessId(window, out actualPid) == 0 || actualPid != ownerPid) break;
      if (desktopOrganizer && !marked) {
        if (!SetProp(window, OrganizerProperty, new IntPtr(1)))
          throw new InvalidOperationException("Could not mark organizer window");
        marked = true;
      }
      // Windows keeps modal dialogs above their disabled owner. Reordering the
      // owner during that time repeatedly drags the whole modal group down.
      if (IsWindowVisible(window) && IsWindowEnabled(window) && !IsIconic(window)) {
        if (CoveredByDesktop(window)) {
          // Show desktop: stay visible on the desktop. The desktop is then the
          // foreground window and HWND_TOP is ignored for background callers;
          // TOPMOST followed by NOTOPMOST lands at the top of the normal band.
          // Restored applications return above it and lowering resumes.
          if (!SetWindowPos(window, new IntPtr(-1), 0, 0, 0, 0, 0x13) || !SetWindowPos(window, new IntPtr(-2), 0, 0, 0, 0, 0x13))
            throw new InvalidOperationException("Could not raise assistant window above the desktop");
        } else if (NeedsLowering(window)) {
          // Settle directly above the desktop rather than at HWND_BOTTOM: while
          // Show desktop is active the desktop is not at the bottom, and
          // HWND_BOTTOM would drop this window underneath it.
          IntPtr desktop = DesktopBelow(window);
          IntPtr above = desktop == IntPtr.Zero ? IntPtr.Zero : GetWindow(desktop, 3);
          IntPtr after = above != IntPtr.Zero && above != window ? above : new IntPtr(1); // else HWND_BOTTOM
          // SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE.
          if (!SetWindowPos(window, after, 0, 0, 0, 0, 0x13))
            throw new InvalidOperationException("Could not lower assistant window");
        }
      }
      Thread.Sleep(250);
    }
  }
}
'@
[AssistantWindowLayer]::Run(${handle}, ${ownerPid}, $${desktopOrganizer ? 'true' : 'false'})
`;
}

class WindowLayerController {
  constructor(window, mode, options = {}) {
    this.window = window;
    this.mode = normalizeWindowLayerMode(mode);
    this.notificationActive = false;
    this.menuActive = false;
    this.modalDepth = 0;
    this.desktopOrganizer = options.desktopOrganizer === true;
    this.disposed = false;
    this.helper = null;
    this.platform = options.platform || process.platform;
    this.spawn = options.spawn || spawn;
    this.logError = options.logError || (message => console.error(message));
    this.onShow = () => this.apply();
    this.onClosed = () => this.dispose();
    window.on('show', this.onShow);
    window.on('restore', this.onShow);
    window.on('closed', this.onClosed);
    this.apply();
  }

  wantsTop() {
    return this.menuActive || this.mode === 'top' || (this.mode === 'bottom-notify' && this.notificationActive);
  }

  setMode(mode) {
    this.mode = normalizeWindowLayerMode(mode);
    this.apply();
  }

  setNotificationActive(active) {
    if (this.notificationActive === (active === true)) return;
    this.notificationActive = active === true;
    this.apply();
  }

  resetNotifications() {
    this.setNotificationActive(false);
  }

  setMenuActive(active) {
    if (this.menuActive === (active === true)) return;
    this.menuActive = active === true;
    this.apply();
  }

  apply() {
    if (this.disposed || this.window.isDestroyed() || this.modalDepth) return;
    const top = this.wantsTop();
    if (top) this.stopHelper();
    this.window.setAlwaysOnTop(top, 'screen-saver');
    if (!top && this.platform === 'win32') this.startHelper();
  }

  async withModal(task) {
    this.modalDepth++;
    const child = this.helper;
    const stopped = child ? new Promise(resolve => {
      let timer;
      const done = () => {
        clearTimeout(timer);
        child.removeListener('exit', done); child.removeListener('error', done);
        resolve();
      };
      child.once('exit', done); child.once('error', done);
      timer = setTimeout(done, 2000);
    }) : Promise.resolve();
    this.stopHelper();
    try { await stopped; return await task(); }
    finally {
      this.modalDepth--;
      if (!this.modalDepth) this.apply();
    }
  }

  startHelper() {
    if (this.helper || this.disposed) return;
    const buffer = this.window.getNativeWindowHandle();
    const handle = buffer.length >= 8 ? buffer.readBigUInt64LE().toString() : String(buffer.readUInt32LE());
    const script = bottomHelperScript(handle, process.pid, this.desktopOrganizer);
    let child;
    try {
      child = this.spawn('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden',
        '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')
      ], { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
    } catch (error) {
      this.logError(`Window layer helper failed: ${error.message}`);
      return;
    }
    this.helper = child;
    let errors = '';
    child.stderr?.on('data', chunk => { errors = (errors + chunk).slice(-2000); });
    child.stdin?.on('error', () => {}); // The window may close before the helper starts.
    child.on('error', error => {
      if (this.helper === child) this.helper = null;
      this.logError(`Window layer helper failed: ${error.message}`);
    });
    child.once('exit', code => {
      const expected = this.helper !== child;
      if (!expected) this.helper = null;
      // A helper already inside SetWindowPos may finish after a mode switch.
      // Reassert the current top mode only after that old helper has exited.
      if (!this.disposed && !this.window.isDestroyed() && !this.modalDepth && this.wantsTop()) {
        this.window.setAlwaysOnTop(true, 'screen-saver');
      }
      if (!expected && code !== 0) this.logError(`Window layer helper exited (${code}): ${errors}`);
    });
  }

  stopHelper() {
    const child = this.helper;
    if (!child) return;
    this.helper = null;
    child.stdin?.end();
    child.kill();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stopHelper();
    this.window.removeListener('show', this.onShow);
    this.window.removeListener('restore', this.onShow);
    this.window.removeListener('closed', this.onClosed);
  }
}

module.exports = { WindowLayerController, normalizeWindowLayerMode };
