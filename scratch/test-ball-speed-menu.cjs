const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const { locales } = require('../electron/locales.cjs');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, webPreferences: {
    preload: path.join(__dirname, '../electron/preload.cjs'), backgroundThrottling: false
  } });
  try {
    window.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, done) => done({ cancel: true }));
    for (const [channel, value] of Object.entries({
      'get-language': 'zh-TW', 'get-bubble-font-size': 'std', 'get-sticky-notes-size': 'std',
      'sticky-notes-list': { active: [] }, 'laptop-get-shortcuts': { shortcuts: [], emailAccounts: [], calendars: [] }
    })) ipcMain.handle(channel, () => value);
    let savedSpeed;
    const state = vm.createContext({
      Menu, ipcMain, mainWindow: window, currentBallSpeed: 1.2,
      tray: { setContextMenu() {} }, trayContextMenu: null,
      isAssistantVisible: true, windowLayerMode: 'top', isMoveMode: false,
      currentSizeKey: 'std', currentStickyNotesSize: 'std', currentBubbleFontSize: 'std',
      isBubbleEnabled: true, currentLanguage: 'zh-TW',
      getAutoLaunch: () => false, getLocale: () => locales[state.currentLanguage],
      savePetPreferences: () => { savedSpeed = state.currentBallSpeed; }
    });
    const source = fs.readFileSync(path.join(__dirname, '../electron/main.cjs'), 'utf8');
    for (const [start, end] of [
      ['function setBallSpeed(', 'function setBubbleEnabled('],
      ['function updateTrayMenu(', 'function createTray('],
      ["  ipcMain.on('ball-speed-changed'", "  ipcMain.on('show-context-menu'"]
    ]) vm.runInContext(source.slice(source.indexOf(start), source.indexOf(end)), state);
    const speeds = () => state.trayContextMenu.items.find(item => item.label === locales[state.currentLanguage].tray.globeSpeed).submenu.items;
    const expectSelected = value => {
      const selected = speeds().filter(item => item.checked);
      assert.equal(selected.length, 1);
      assert.equal(selected[0].type, 'radio');
      assert.ok(selected[0].label.startsWith(`${value.toFixed(1)}x `));
    };
    state.updateTrayMenu();
    expectSelected(1.2);
    for (const [index, speed] of [0.5, 1, 1.2, 2.5, 5].entries()) {
      speeds()[index].click();
      expectSelected(speed);
      assert.equal(savedSpeed, speed);
    }
    let initialized = false;
    ipcMain.on('set-notification-active', () => { initialized = true; });
    await window.loadFile(path.join(__dirname, '../dist/index.html'));
    for (let attempt = 0; !initialized && attempt < 100; attempt++) await delay(50);
    assert.ok(initialized, 'renderer initialized');
    state.setBallSpeed(1.2, true);
    await delay(100);
    const wheel = async deltaY => {
      await window.webContents.executeJavaScript(`document.getElementById('ball-canvas').dispatchEvent(new WheelEvent('wheel', { deltaY: ${deltaY}, cancelable: true }))`);
      await delay(100);
    };
    await wheel(-100);
    expectSelected(1.4);
    assert.equal(savedSpeed, 1.4);
    assert.equal(speeds().length, 6);
    assert.equal(speeds()[5].enabled, false);
    state.currentLanguage = 'en';
    state.updateTrayMenu();
    assert.match(speeds()[5].label, /Custom Speed/);
    await wheel(100);
    expectSelected(1.2);
    assert.equal(speeds().length, 5);
    await window.webContents.executeJavaScript("document.getElementById('ball-canvas').click()");
    expectSelected(1.2);
    for (const invalid of [NaN, Infinity, -1, 6, '1.2']) {
      ipcMain.emit('ball-speed-changed', { sender: window.webContents }, invalid);
      expectSelected(1.2);
    }
    ipcMain.emit('ball-speed-changed', { sender: {} }, 5);
    expectSelected(1.2);
    console.log('Native radio selection, all presets, renderer scroll IPC, custom speed, localization, boost independence and IPC validation passed.');
  } finally {
    window.destroy();
  }
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
