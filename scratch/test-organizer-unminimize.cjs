// Electron: Windows minimizes windows on a monitor that is switched off
// ("Second screen only"). An organizer comes back on its own at its layout,
// without taking focus; a hidden organizer stays hidden.
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const electron = require('electron');
const { app, BrowserWindow } = electron;
const { DesktopOrganizer } = require('../electron/desktop-organizer.cjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'organizer-unminimize-'));
app.setPath('userData', dir);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
app.whenReady().then(async () => {
  let code = 1;
  try {
    const service = new DesktopOrganizer({ ...electron, organizerDesktopIcons: false, organizerDrag: {} }, dir);
    service.register(); service.create();
    const board = service.boards[0], win = service.windows.get(board.id);
    await new Promise(resolve => win.once('ready-to-show', resolve));
    await delay(300);
    const layout = service.fitBounds(service.savedBounds(board));
    const focus = new BrowserWindow({ x: layout.x + 40, y: layout.y + 400, width: 240, height: 120, show: true });
    focus.focus(); await delay(300);

    win.minimize();
    await delay(150);
    assert.equal(win.isMinimized(), true);
    await delay(800);
    assert.equal(win.isMinimized(), false, 'the organizer comes back by itself');
    assert.equal(win.isVisible(), true);
    assert.equal(BrowserWindow.getFocusedWindow(), focus, 'without taking focus');
    for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(win.getBounds()[key] - layout[key]) <= 1, `${key}: ${JSON.stringify(win.getBounds())} vs ${JSON.stringify(layout)}`);

    win.hide(); await delay(100);
    service.restoreLayouts(); await delay(400);
    assert.equal(win.isVisible(), false, 'a hidden organizer stays hidden');
    console.log('Organizer unminimize: minimized organizers return at their layout without focus; hidden ones stay hidden passed.');
    code = 0;
  } catch (error) {
    console.error(error);
  }
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* Temporary profile only. */ }
  app.exit(code);
});
