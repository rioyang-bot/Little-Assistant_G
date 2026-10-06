// Electron UI: right-clicking empty organizer space opens the background menu;
// sort re-renders in order and "New" collects a desktop item and starts rename.
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const electron = require('electron');
const { app, Menu } = electron;
const { DesktopOrganizer } = require('../electron/desktop-organizer.cjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'organizer-background-ui-'));
app.setPath('userData', dir);
const desktop = path.join(dir, 'Desktop'); fs.mkdirSync(desktop);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, label) {
  for (let i = 0; i < 60; i++) { const value = await check(); if (value) return value; await delay(100); }
  throw new Error('Timed out: ' + label);
}
app.whenReady().then(async () => {
  let code = 1;
  try {
    let next = [], lastReal = null;
    const scripted = { buildFromTemplate: template => {
      lastReal = Menu.buildFromTemplate(template);   // the real menu must accept the template
      return { popup: ({ callback }) => {
        let entries = template;
        for (const label of next.slice(0, -1)) entries = entries.find(entry => entry.label === label).submenu;
        entries.find(entry => entry.label === next.at(-1)).click();
        callback();
      } };
    } };
    const appStub = { ...app, getPath: name => name === 'desktop' ? desktop : app.getPath(name) };
    const service = new DesktopOrganizer({ ...electron, app: appStub, Menu: scripted, organizerDesktopIcons: false, organizerDrag: {} }, dir);
    service.register(); service.create();
    const board = service.boards[0], win = service.windows.get(board.id);
    await new Promise(resolve => win.webContents.once('did-finish-load', resolve));
    win.setBounds({ ...win.getBounds(), width: 420, height: 320 });
    const js = code => win.webContents.executeJavaScript(code);
    for (const name of ['c.txt', 'a.txt', 'b.txt']) fs.writeFileSync(path.join(desktop, name), name);
    await js(`window.electronAPI.invoke('organizer-add', ${JSON.stringify(['c.txt', 'a.txt', 'b.txt'].map(name => path.join(desktop, name)))})`);
    const reloaded = new Promise(resolve => win.webContents.once('did-finish-load', resolve)); win.reload(); await reloaded;
    const rightClickEmpty = () => js(`(() => { const r = document.getElementById('items').getBoundingClientRect(); document.getElementById('items').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.right - 20, clientY: r.bottom - 20 })); })()`);
    const names = () => js(`[...document.querySelectorAll('.item span')].map(node => node.textContent)`);

    next = ['排序方式', '名稱'];
    await rightClickEmpty();
    await until(async () => JSON.stringify(await names()) === JSON.stringify(['a.txt', 'b.txt', 'c.txt']), 'sorted render');
    const refreshItem = lastReal.items[0];
    assert.equal(refreshItem.label, '重新整理');
    assert.ok(refreshItem.icon && !refreshItem.icon.isEmpty(), 'refresh shows the ↻ icon');
    assert.deepEqual(refreshItem.icon.getSize(), { width: 16, height: 16 });
    assert.equal(await js(`!!document.getElementById('refresh')`), false, 'no title-bar refresh button');

    assert.deepEqual(lastReal.items.map(entry => entry.label).filter(Boolean), ['重新整理', '排序方式', '新增'], 'no view submenu');
    // Locking fixes the window only: the background menu stays fully usable.
    await js(`window.electronAPI.invoke('organizer-update', { locked: true })`);
    const relocked = new Promise(resolve => win.webContents.once('did-finish-load', resolve)); win.reload(); await relocked;
    assert.equal(await js(`document.getElementById('edit').hidden`), true);

    next = ['新增', '資料夾'];
    await rightClickEmpty();
    const renaming = await until(() => js(`document.querySelector('.rename-input')?.value || ''`), 'rename input for the new folder');
    assert.equal(renaming, '新增資料夾');
    assert.equal(fs.statSync(path.join(desktop, '新增資料夾')).isDirectory(), true);
    await js(`(() => { const input = document.querySelector('.rename-input'); input.value = '專案資料'; input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`);
    await until(() => fs.existsSync(path.join(desktop, '專案資料')), 'renamed on disk');
    assert.ok((await names()).includes('專案資料'));
    assert.equal(board.locked, true, 'created and renamed while locked');
    assert.ok(lastReal.items.every(entry => entry.enabled !== false), 'nothing is greyed out while locked');
    console.log('Organizer background menu: valid native template with the refresh icon, usable while locked, sort re-render, new folder with rename passed.');
    code = 0;
  } catch (error) {
    console.error(error);
  }
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* Temporary profile only. */ }
  app.exit(code);
});
