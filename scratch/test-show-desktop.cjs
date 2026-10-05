// Native test: bottom-mode assistant and organizer windows stay visible while
// Windows "Show desktop" is active, and return below applications afterwards.
// It really toggles Show desktop twice, briefly hiding the user's windows.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');
const execFile = promisify(require('node:child_process').execFile);
const { app, BrowserWindow, screen } = require('electron');
const { WindowLayerController } = require('../electron/window-layer-controller.cjs');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'assistant-show-desktop-'));
app.setPath('userData', root);
const handle = win => win.getNativeWindowHandle().readBigUInt64LE().toString();
const page = (color, text) => `data:text/html,<body style="margin:0;background:${color};font:14px sans-serif;display:grid;place-items:center;height:100vh">${text}</body>`;

app.whenReady().then(async () => {
  let code = 1;
  try {
    const area = screen.getPrimaryDisplay().workArea;
    const create = (name, x, organizer) => {
      const win = new BrowserWindow({ x: area.x + x, y: area.y + 60, width: 160, height: 100, frame: false, skipTaskbar: true, show: false, transparent: true, backgroundColor: '#00000000' });
      win.loadURL(page(organizer ? '#34d399' : '#38bdf8', name));
      win.showInactive();
      new WindowLayerController(win, 'bottom', { desktopOrganizer: organizer });
      return { name, hwnd: handle(win) };
    };
    const assistant = create('assistant', 60, false);
    const organizer = create('organizer', 260, true);
    const normal = new BrowserWindow({ x: area.x + 20, y: area.y + 20, width: 460, height: 200, frame: false, skipTaskbar: true, show: false, backgroundColor: '#475569' });
    normal.loadURL(page('#475569', 'application window'));
    normal.showInactive();
    await new Promise(resolve => setTimeout(resolve, 4000));
    const list = [assistant, organizer, { name: 'application', hwnd: handle(normal) }];
    const file = path.join(root, 'windows.json');
    fs.writeFileSync(file, JSON.stringify(list));
    // Asynchronous on purpose: the layer helpers need this thread to answer SetWindowPos.
    const { stdout } = await execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'test-show-desktop.ps1'), '-WindowsJson', file], { timeout: 90000 });
    const { desktop, rows } = JSON.parse(stdout.trim());
    const tops = (phase, item) => rows.filter(row => row.phase === phase && row.name === item.name).map(row => row.top);
    for (const item of [assistant, organizer]) {
      assert.ok(tops('before', item).every(top => top === handle(normal)), `${item.name} starts below the application`);
      assert.ok(tops('show-desktop', item).every(top => top === item.hwnd), `${item.name} stays visible during Show desktop: ${tops('show-desktop', item)}`);
      assert.ok(tops('restored', item).every(top => top !== item.hwnd), `${item.name} returns below applications`);
    }
    assert.ok(tops('show-desktop', list[2]).every(top => top === desktop), 'the application is hidden by Show desktop');
    console.log('Show desktop: bottom assistant and organizer stay visible without flicker and return below applications afterwards.');
    code = 0;
  } catch (error) {
    console.error(error);
  }
  // Electron still holds files in its profile; cleanup is best effort.
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* Temporary folder only. */ }
  app.exit(code);
});
