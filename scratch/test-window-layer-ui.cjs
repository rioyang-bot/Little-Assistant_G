const assert = require('node:assert/strict');
const path = require('path');
const { promisify } = require('util');
const execFile = promisify(require('child_process').execFile);
const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const { WindowLayerController } = require('../electron/window-layer-controller.cjs');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(check, label, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(100);
  }
  throw new Error(`Timed out: ${label}`);
}

async function isBelow(window, other) {
  const hwnd = win => win.getNativeWindowHandle().readBigUInt64LE().toString();
  const script = `Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class OrderCheck {
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint command);
  public static bool Below(long target, long other) {
    IntPtr current = new IntPtr(target);
    for (int i = 0; i < 10000; i++) {
      current = GetWindow(current, 3);
      if (current == IntPtr.Zero) return false;
      if (current == new IntPtr(other)) return true;
    }
    return false;
  }
}
'@
[OrderCheck]::Below(${hwnd(window)}, ${hwnd(other)})`;
  const result = await execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, timeout: 15000 });
  return result.stdout.trim() === 'True';
}

app.whenReady().then(async () => {
  let window, other, controller, menu;
  const organizers = [], organizerLayers = [];
  try {
    for (const [channel, value] of Object.entries({
      'get-language': 'zh-TW', 'get-bubble-font-size': 'std', 'get-sticky-notes-size': 'std',
      'sticky-notes-list': { active: [] }, 'laptop-get-shortcuts': { shortcuts: [], emailAccounts: [], calendars: [] }
    })) ipcMain.handle(channel, () => value);
    const states = [];
    ipcMain.on('set-notification-active', (event, active) => {
      states.push(active);
      controller?.setNotificationActive(active);
    });
    window = new BrowserWindow({ show: false, width: 420, height: 760, opacity: 0,
      webPreferences: { preload: path.join(__dirname, '../electron/preload.cjs'), backgroundThrottling: false }
    });
    window.webContents.setAudioMuted(true);
    window.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, done) => done({ cancel: true }));
    await window.loadFile(path.join(__dirname, '../dist/index.html'));
    await waitFor(() => states.length > 0, 'renderer initialized');
    assert.equal(states.at(-1), false);

    const notifications = [
      ['new-email-received', { emails: [{ subject: 'Test', from: 'Test' }], soundEnabled: false }],
      ['calendar-reminder', { events: [], soundEnabled: false }],
      ['health-reminder', { soundEnabled: false }],
      ['trivia-reminder', { text: 'Test', soundEnabled: false }],
      ['alarm-triggered', { notes: [], config: { duration: 'continuous' } }]
    ];
    for (const [channel, payload] of notifications) {
      window.webContents.send(channel, payload);
      await waitFor(() => states.at(-1) === true, `${channel} active`);
      await window.webContents.executeJavaScript("document.getElementById('speech-bubble').click()");
      await waitFor(() => states.at(-1) === false, `${channel} dismissed`);
    }
    window.webContents.send('calendar-reminder', { events: [], soundEnabled: false });
    await waitFor(() => states.at(-1) === true, 'calendar active');
    const count = states.length;
    window.webContents.send('health-reminder', { soundEnabled: false });
    window.webContents.send('font-size-updated', 'std');
    await delay(500);
    assert.equal(states.length, count, 'replacement and settings feedback must not lower window');
    await waitFor(() => states.at(-1) === false, 'health reminder automatically expires');
    console.log('All five notification types, dismissal, replacement and automatic expiry passed.');

    if (process.platform === 'win32') {
      other = new BrowserWindow({ show: false, width: 100, height: 100, opacity: 0 });
      other.showInactive();
      window.showInactive();
      controller = new WindowLayerController(window, 'bottom-notify');
      await waitFor(() => isBelow(window, other), 'native bottom order');
      window.moveTop();
      await waitFor(() => isBelow(window, other), 'bottom order restored after raise');
      window.webContents.send('health-reminder', { soundEnabled: false });
      await waitFor(() => window.isAlwaysOnTop(), 'notification raises native window');
      assert.equal(await isBelow(window, other), false);
      await window.webContents.executeJavaScript("document.getElementById('speech-bubble').click()");
      await waitFor(() => !window.isAlwaysOnTop(), 'dismissal removes topmost');
      await waitFor(() => isBelow(window, other), 'dismissal returns native window to bottom');
      controller.setMode('top');
      await delay(500);
      assert.equal(window.isAlwaysOnTop(), true);
      assert.equal(await isBelow(window, other), false);
      controller.setMode('bottom');
      controller.setNotificationActive(true);
      await waitFor(() => isBelow(window, other), 'always bottom ignores notifications');
      console.log('Windows native bottom, persistent ordering, notification raise/return and always-top passed.');
      for (let index = 0; index < 2; index++) {
        const board = new BrowserWindow({ show: false, width: 260, height: 160, transparent: true, frame: false, resizable: false, thickFrame: false, hasShadow: false, opacity: 0 });
        organizers.push(board);
        organizerLayers.push(new WindowLayerController(board, 'bottom', { desktopOrganizer: true }));
        board.showInactive();
      }
      for (const board of organizers) {
        await waitFor(() => isBelow(board, window), 'organizer below assistant in bottom mode');
        assert.equal(await isBelow(board, other), true, 'ordinary application stays above organizer');
        board.moveTop();
        await waitFor(() => isBelow(board, window), 'raised organizer returns below assistant');
      }
      let layerChanges = 0, lastLayerChange = Date.now();
      for (const board of organizers) board.hookWindowMessage(0x0046, () => { layerChanges++; lastLayerChange = Date.now(); });
      await waitFor(() => Date.now() - lastLayerChange >= 750, 'organizer sibling ordering settles');
      layerChanges = 0;
      await delay(1200);
      assert.equal(layerChanges, 0, 'settled organizer siblings must not repeatedly reorder or flicker');
      for (const board of organizers) board.unhookWindowMessage(0x0046);

      controller.setMenuActive(true);
      let dismissed = false;
      menu = Menu.buildFromTemplate([{ label: 'Organizer layer regression test', enabled: false }]);
      menu.popup({ window, x: 20, y: 20, callback: () => { dismissed = true; controller.setMenuActive(false); } });
      assert.equal(window.isAlwaysOnTop(), true);
      for (const board of organizers) assert.equal(await isBelow(board, window), true, 'menu owner stays above organizer');
      menu.closePopup(window);
      await waitFor(() => dismissed, 'native menu dismissal callback');
      assert.equal(window.isAlwaysOnTop(), false, 'menu dismissal restores bottom preference');
      await waitFor(() => isBelow(window, other), 'native bottom restored after menu');
      for (const board of organizers) assert.equal(await isBelow(board, window), true);
      console.log('Two transparent organizers stay below applications and assistant; idle ordering is stable; native menu raises and restores its owner.');
    }
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    menu?.closePopup(window);
    for (const layer of organizerLayers) layer.dispose();
    for (const board of organizers) if (!board.isDestroyed()) board.destroy();
    controller?.dispose();
    if (window && !window.isDestroyed()) window.destroy();
    if (other && !other.isDestroyed()) other.destroy();
    app.exit(process.exitCode || 0);
  }
});
