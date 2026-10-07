// Native layering: clicking (activating) an unlocked organizer brings it in
// front of an application; a locked organizer returns below it.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');
const execFile = promisify(require('node:child_process').execFile);
const { app, BrowserWindow, screen } = require('electron');
const { WindowLayerController } = require('../electron/window-layer-controller.cjs');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'organizer-lock-layer-'));
app.setPath('userData', root);
const handle = win => win.getNativeWindowHandle().readBigUInt64LE().toString();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const page = (color, text) => `data:text/html,<body style="margin:0;background:${color};font:14px sans-serif;display:grid;place-items:center;height:100vh">${text}</body>`;
const probe = `
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class TopAt {
  [StructLayout(LayoutKind.Sequential)] struct POINT { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(POINT p);
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h, uint f);
  public static long Of(long h) { RECT r; GetWindowRect(new IntPtr(h), out r); var p = new POINT { X = (r.L + r.R) / 2, Y = (r.T + r.B) / 2 }; return GetAncestor(WindowFromPoint(p), 2).ToInt64(); }
}
'@
[TopAt]::Of([long]$env:TARGET)`;
// Asynchronous on purpose: the layer helpers need this thread to answer SetWindowPos.
const topAt = async win => (await execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', probe], { env: { ...process.env, TARGET: handle(win) } })).stdout.trim();

app.whenReady().then(async () => {
  let code = 1;
  try {
    const area = screen.getPrimaryDisplay().workArea;
    const organizer = (name, x, locked) => {
      const win = new BrowserWindow({ x: area.x + x, y: area.y + 80, width: 180, height: 120, frame: false, skipTaskbar: true, show: false, backgroundColor: locked ? '#34d399' : '#38bdf8' });
      win.loadURL(page(locked ? '#34d399' : '#38bdf8', name));
      win.showInactive();
      const layer = new WindowLayerController(win, locked ? 'bottom' : 'normal', { desktopOrganizer: true });
      return { win, layer };
    };
    const unlocked = organizer('unlocked', 60, false), locked = organizer('locked', 280, true);
    const application = new BrowserWindow({ x: area.x + 20, y: area.y + 40, width: 480, height: 220, frame: false, skipTaskbar: true, show: false, backgroundColor: '#475569' });
    application.loadURL(page('#475569', 'application window'));
    application.show();
    await delay(4000);   // helpers compile; the locked organizer settles below
    assert.equal(await topAt(locked.win), handle(application), 'locked organizer starts below the application');

    unlocked.win.focus(); await delay(1500);
    assert.equal(await topAt(unlocked.win), handle(unlocked.win), 'clicking an unlocked organizer brings it forward and it stays there');

    application.focus(); await delay(500);
    locked.win.focus(); await delay(1500);
    assert.equal(await topAt(locked.win), handle(application), 'a locked organizer returns below the application after a click');

    // Locking the unlocked organizer sends it below; unlocking keeps ordinary stacking.
    unlocked.layer.setMode('bottom'); await delay(1500);
    assert.equal(await topAt(unlocked.win), handle(application), 'locking sends the organizer below');
    console.log('Organizer lock layering: unlocked comes forward on click, locked stays below, locking switches immediately passed.');
    code = 0;
  } catch (error) {
    console.error(error);
  }
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* Temporary profile only. */ }
  app.exit(code);
});
