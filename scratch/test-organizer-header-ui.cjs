// Electron UI: the organizer title bar can be shown never, on hover or always.
// Icons keep their positions; hidden title-bar buttons cannot be clicked; the
// settings radios preview live and save.
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const electron = require('electron');
const { app } = electron;
const { DesktopOrganizer } = require('../electron/desktop-organizer.cjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'organizer-header-ui-'));
app.setPath('userData', dir);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, label) {
  for (let i = 0; i < 60; i++) { const value = await check(); if (value) return value; await delay(100); }
  throw new Error('Timed out: ' + label);
}
app.whenReady().then(async () => {
  let code = 1, service;
  try {
    service = new DesktopOrganizer({ ...electron, organizerDesktopIcons: false, organizerDrag: {} }, dir);
    service.register(); service.create();
    const board = service.boards[0], win = service.windows.get(board.id);
    service.layers.get(board.id).dispose(); win.setAlwaysOnTop(true, 'screen-saver');
    await new Promise(resolve => win.webContents.once('did-finish-load', resolve));
    const file = path.join(dir, 'note.txt'); fs.writeFileSync(file, 'x');
    const js = code => win.webContents.executeJavaScript(code);
    await js(`window.electronAPI.invoke('organizer-add', ${JSON.stringify([file])})`);
    const state = () => js(`(() => { const style = node => getComputedStyle(node); const item = document.querySelector('.item').getBoundingClientRect();
      return { title: style(document.getElementById('title')).opacity, lock: style(document.getElementById('title')).pointerEvents, buttons: document.querySelectorAll('#header button').length, mode: document.getElementById('board').dataset.header,
        headerHeight: document.getElementById('header').offsetHeight, itemTop: Math.round(item.top) }; })()`);
    const setMode = async mode => {
      await js(`window.electronAPI.invoke('organizer-update', { headerMode: ${JSON.stringify(mode)} })`);
      await until(async () => (await state()).mode === mode, 'mode ' + mode);
      await delay(300);   // opacity transition
      return state();
    };
    const away = () => win.webContents.sendInputEvent({ type: 'mouseLeave', x: 5000, y: 5000 });
    const over = () => win.webContents.sendInputEvent({ type: 'mouseMove', x: 60, y: 60 });

    away(); await delay(100);
    const always = await setMode('always');
    assert.equal(always.title, '1'); assert.equal(always.lock, 'auto');
    assert.equal(always.buttons, 0, 'the title bar shows only the name');
    const never = await setMode('never');
    assert.equal(never.title, '0', 'never: the title bar is hidden');
    assert.equal(never.lock, 'none', 'never: the hidden title is not interactive');
    over(); await delay(300);
    assert.equal((await state()).title, '0', 'never: stays hidden under the mouse');
    away(); await delay(100);
    const hoverAway = await setMode('hover');
    assert.equal(hoverAway.title, '0', 'hover: hidden while the mouse is elsewhere');
    over(); await delay(300);
    const hoverOver = await state();
    assert.equal(hoverOver.title, '1', 'hover: shown when the mouse is over the window');
    assert.equal(hoverOver.lock, 'auto');
    away(); await delay(300);
    assert.equal((await state()).title, '0', 'hover: hidden again after the mouse leaves');
    for (const snapshot of [never, hoverAway, hoverOver]) {
      assert.equal(snapshot.headerHeight, always.headerHeight, 'the title bar keeps its space');
      assert.equal(snapshot.itemTop, always.itemTop, 'icons never shift');
    }

    // Settings: radios reflect the saved mode, preview live, and save.
    await setMode('always');
    await js(`window.electronAPI.invoke('organizer-settings-open')`);
    const settings = await until(() => service.settingsWindows.get(board.id)?.window, 'settings window');
    await until(() => settings.webContents.executeJavaScript(`!document.getElementById('settings').inert`), 'settings ready');
    assert.equal(await settings.webContents.executeJavaScript(`document.querySelector('input[name="header-mode"]:checked').value`), 'always');
    assert.deepEqual(await settings.webContents.executeJavaScript(`[...document.querySelectorAll('input[name="header-mode"]')].map(input => input.parentElement.textContent.trim())`), ['從不', '滑鼠停留時', '總是']);
    await settings.webContents.executeJavaScript(`(() => { const radio = document.querySelector('input[name="header-mode"][value="never"]'); radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await until(async () => (await state()).mode === 'never', 'live preview');
    assert.equal(board.headerMode, 'always', 'preview does not save');
    await settings.webContents.executeJavaScript(`document.getElementById('save').click()`);
    await until(() => board.headerMode === 'never', 'saved mode');
    assert.equal(new DesktopOrganizer({}, dir).boards[0].headerMode, 'never', 'survives restart');
    console.log('Organizer title bar: name only, never / hover / always visibility, fixed icon positions, live preview and saving passed.');
    code = 0;
  } catch (error) {
    console.error(error);
  }
  try { service?.dispose(); } catch { /* best effort */ }
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* Temporary profile only. */ }
  app.exit(code);
});
