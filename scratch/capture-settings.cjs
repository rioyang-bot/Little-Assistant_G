const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(async () => {
  ipcMain.handle('email-get-config', () => ({
    language: 'zh-TW',
    enabled: true,
    accounts: [
      {
        id: 'acc-1',
        name: 'Work Gmail',
        enabled: true,
        provider: 'gmail',
        host: 'imap.gmail.com',
        port: 993,
        user: 'test@gmail.com',
        pass: 'abcdefghijklmnop'
      }
    ],
    rules: { maxAgeHours: 2, checkIntervalMinutes: 5, soundEnabled: true },
    health: { enabled: true, intervalMinutes: 45, soundEnabled: true }
  }));

  ipcMain.handle('calendar-get-config', () => ({
    language: 'en',
    enabled: true,
    calendars: [
      {
        id: 'cal-1',
        name: 'Main Google Calendar',
        color: '#38bdf8',
        enabled: true,
        url: 'https://calendar.google.com/calendar/ical/example/basic.ics'
      }
    ],
    rules: { remindAdvanceMinutes: 15, tomorrowPreviewHour: 18, checkIntervalMinutes: 15, soundEnabled: true },
    systemTimezone: 'Asia/Taipei'
  }));

  ipcMain.handle('trivia-get-config', () => ({
    enabled: true,
    category: 'all',
    intervalMinutes: 60,
    soundEnabled: true
  }));
  ipcMain.handle('get-app-version', () => ({
    version: '1.2.0',
    displayVersion: 'Ver.1.2.0'
  }));

  ipcMain.handle('email-test-connection', () => ({ success: true, message: 'Connected' }));
  ipcMain.handle('calendar-test-connection', () => ({ success: true, message: 'Connected' }));
  ipcMain.handle('calendar-check-now', () => ({ success: true, todayCount: 2, tomorrowCount: 1, timezone: 'Asia/Taipei' }));
  ipcMain.handle('email-save-config', () => ({ success: true }));
  ipcMain.handle('calendar-save-config', () => ({ success: true }));
  ipcMain.handle('set-language', (e, lang) => lang);

  const win = new BrowserWindow({
    width: 680,
    height: 740,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../electron/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const distSettings = path.join(__dirname, '../dist/email-settings.html');
  await win.loadFile(distSettings);

  // Switch to Calendar tab to view the exact screen user had
  await win.webContents.executeJavaScript(`
    document.querySelector('.tab-btn[data-tab="panel-calendar"]').click();
  `);

  await new Promise(r => setTimeout(r, 600));

  const image = await win.webContents.capturePage();
  const outPath = path.join(__dirname, 'settings-preview.png');
  fs.writeFileSync(outPath, image.toPNG());
  console.log('Saved preview to', outPath);
  app.quit();
});
