// Electron UI: refresh removes deleted entries; an entry whose location is
// unavailable stays dimmed, can be dragged within the window and removed.
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const electron = require('electron');
const { app } = electron;
const { DesktopOrganizer } = require('../electron/desktop-organizer.cjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'organizer-missing-ui-'));
app.setPath('userData', dir);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, label) {
  for (let i = 0; i < 60; i++) { const value = await check(); if (value) return value; await delay(100); }
  throw new Error('Timed out: ' + label);
}
app.whenReady().then(async () => {
  let code = 1;
  try {
    const service = new DesktopOrganizer({ ...electron, organizerDesktopIcons: false, organizerDrag: {} }, dir);
    service.register(); service.create();
    const board = service.boards[0], win = service.windows.get(board.id);
    await new Promise(resolve => win.webContents.once('did-finish-load', resolve));
    win.setBounds({ ...win.getBounds(), width: 420, height: 320 });
    const js = code => win.webContents.executeJavaScript(code);
    const offline = path.join(dir, 'offline-drive');
    fs.mkdirSync(offline);
    const deleted = path.join(dir, 'METech小助手.lnk'), unavailable = path.join(offline, 'report.txt'), kept = path.join(dir, 'kept.txt');
    for (const file of [deleted, unavailable, kept]) fs.writeFileSync(file, 'x');
    await js(`window.electronAPI.invoke('organizer-add', ${JSON.stringify([deleted, unavailable, kept])})`);
    fs.rmSync(deleted); fs.rmSync(offline, { recursive: true });

    // Refresh (F5): the deleted shortcut is removed, the unavailable entry stays dimmed.
    await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F5', bubbles: true }))`);
    const state = await until(async () => {
      const items = await js(`[...document.querySelectorAll('.item')].map(node => ({ name: node.querySelector('span').textContent, missing: node.classList.contains('missing') }))`);
      return items.length === 2 && items.some(item => item.missing) ? items : null;
    }, 'refresh result');
    assert.deepEqual(state.map(item => [item.name, item.missing]), [['report.txt', true], ['kept.txt', false]]);
    assert.match(await js(`document.getElementById('status').textContent`), /已移除 1 個/);

    // Drag the unavailable entry with the mouse: it moves within the window.
    const before = board.items.find(item => item.path === unavailable).position;
    const rect = await js(`(() => { const r = document.querySelector('.item.missing').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
    win.focus();
    win.webContents.sendInputEvent({ type: 'mouseDown', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
    for (let step = 1; step <= 8; step++) { win.webContents.sendInputEvent({ type: 'mouseMove', x: rect.x + step * 15, y: rect.y + step * 10, button: 'left', modifiers: ['leftButtonDown'] }); await delay(30); }
    win.webContents.sendInputEvent({ type: 'mouseUp', x: rect.x + 120, y: rect.y + 80, button: 'left', clickCount: 1 });
    const after = await until(() => { const p = board.items.find(item => item.path === unavailable).position; return p.x !== before.x || p.y !== before.y ? p : null; }, 'missing entry moved');
    assert.ok(after.x > before.x, `moved right: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);

    // Right-click offers removal only, and removal works.
    await js(`document.querySelector('.item.missing').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 30, clientY: 60 }))`);
    const menu = await until(() => js(`(() => { const m = document.getElementById('item-menu'); return m.hidden ? null : { open: !document.getElementById('open').hidden, reveal: !document.getElementById('reveal').hidden, remove: document.getElementById('remove').textContent }; })()`), 'missing-item menu');
    assert.deepEqual(menu, { open: false, reveal: false, remove: '從整理視窗移除' });
    await js(`document.getElementById('remove').click()`);
    await until(() => board.items.length === 1, 'missing entry removed');
    assert.deepEqual(board.items.map(item => item.path), [kept]);

    // F5 refreshes without error.
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'F5' });
    await delay(400);
    assert.equal(await js(`document.querySelectorAll('.item').length`), 1);
    console.log('Organizer missing items: refresh removes deleted entries, unavailable entries stay dimmed, drag within the window, removal-only menu and F5 passed.');
    code = 0;
  } catch (error) {
    console.error(error);
  }
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* Temporary profile only. */ }
  app.exit(code);
});
