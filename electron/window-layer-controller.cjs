const { spawn } = require('child_process');

const MODES = ['bottom', 'top', 'bottom-notify'];

function normalizeWindowLayerMode(value, legacyIsAlwaysOnTop) {
  return MODES.includes(value) ? value : (legacyIsAlwaysOnTop === false ? 'bottom' : 'top');
}

// Electron has no Windows always-on-bottom API. Keep the native window below
// ordinary application windows without activating it or changing its bounds.
// Embed the helper so this also works when this module lives inside app.asar.
function bottomHelperScript(handle, ownerPid) {
  return `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
public static class AssistantWindowLayer {
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int height, uint flags);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  public static void Run(long handle, int ownerPid) {
    IntPtr window = new IntPtr(handle);
    Process owner = Process.GetProcessById(ownerPid);
    Task<string> input = Task.Factory.StartNew(() => Console.ReadLine());
    Console.WriteLine("ready");
    while (!input.IsCompleted && !owner.HasExited) {
      uint actualPid;
      if (GetWindowThreadProcessId(window, out actualPid) == 0 || actualPid != ownerPid) break;
      if (IsWindowVisible(window) && !IsIconic(window)) {
        // HWND_BOTTOM; SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE.
        if (!SetWindowPos(window, new IntPtr(1), 0, 0, 0, 0, 0x13))
          throw new InvalidOperationException("Could not lower assistant window");
      }
      Thread.Sleep(250);
    }
  }
}
'@
[AssistantWindowLayer]::Run(${handle}, ${ownerPid})
`;
}

class WindowLayerController {
  constructor(window, mode, options = {}) {
    this.window = window;
    this.mode = normalizeWindowLayerMode(mode);
    this.notificationActive = false;
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
    return this.mode === 'top' || (this.mode === 'bottom-notify' && this.notificationActive);
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

  apply() {
    if (this.disposed || this.window.isDestroyed()) return;
    const top = this.wantsTop();
    if (top) this.stopHelper();
    this.window.setAlwaysOnTop(top, 'screen-saver');
    if (!top && this.platform === 'win32') this.startHelper();
  }

  startHelper() {
    if (this.helper || this.disposed) return;
    const buffer = this.window.getNativeWindowHandle();
    const handle = buffer.length >= 8 ? buffer.readBigUInt64LE().toString() : String(buffer.readUInt32LE());
    const script = bottomHelperScript(handle, process.pid);
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
      if (!this.disposed && !this.window.isDestroyed() && this.wantsTop()) {
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
