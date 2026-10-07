// Electron: a snapshot restores real organizer windows (bounds, visibility)
// and the rendered icon positions.
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const electron = require('electron');
const { app } = electron;
const { DesktopOrganizer } = require('../electron/desktop-organizer.cjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'organizer-snapshot-ui-'));
app.setPath('userData', dir);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const near = (actual, expected, label) => { for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(actual[key] - expected[key]) <= 1, `${label} ${key}: ${JSON.stringify(actual)} vs ${JSON.stringify(expected)}`); };
app.whenReady().then(async () => {
  let code = 1;
  try {
    const service = new DesktopOrganizer({ ...electron, organizerDesktopIcons: false, organizerDrag: {} }, dir);
    service.register(); service.create(); service.create();
    const [first, second] = service.boards;
    const win1 = service.windows.get(first.id), win2 = service.windows.get(second.id);
    await Promise.all([win1, win2].map(win => new Promise(resolve => win.webContents.once('did-finish-load', resolve))));
    await delay(400);
    const file = path.join(dir, 'note.txt'); fs.writeFileSync(file, 'x');
    await win1.webContents.executeJavaScript(`window.electronAPI.invoke('organizer-add', ${JSON.stringify([file])})`);
    const itemId = first.items[0].id;
    await win1.webContents.executeJavaScript(`window.electronAPI.invoke('organizer-position', { id: ${JSON.stringify(itemId)}, x: 100, y: 120 })`);
    const before1 = win1.getBounds(), before2 = win2.getBounds();
    const snapshot = service.createSnapshot();

    win1.setBounds({ ...before1, x: before1.x + 150, y: before1.y + 60, width: before1.width + 80 });
    await win1.webContents.executeJavaScript(`window.electronAPI.invoke('organizer-position', { id: ${JSON.stringify(itemId)}, x: 300, y: 12 })`);
    win2.hide();
    await delay(200);

    service.restoreSnapshot(snapshot.id);
    await delay(500);
    near(win1.getBounds(), before1, 'first window');
    near(win2.getBounds(), before2, 'second window');
    assert.equal(win2.isVisible(), true, 'the hidden window is shown as in the snapshot');
    const rendered = await win1.webContents.executeJavaScript(`(() => { const button = document.querySelector('.item'); return { left: button.style.left, top: button.style.top }; })()`);
    assert.deepEqual(rendered, { left: '100px', top: '120px' }, 'the icon is drawn at its snapshot position');
    assert.deepEqual(JSON.parse(fs.readFileSync(service.file, 'utf8')).boards[0].items[0].position, { x: 100, y: 120 });
    console.log('Organizer snapshot UI: windows, visibility and icon positions restored passed.');
    code = 0;
  } catch (error) {
    console.error(error);
  }
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* Temporary profile only. */ }
  app.exit(code);
});
