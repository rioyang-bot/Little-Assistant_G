const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

app.whenReady().then(async () => {
  console.log('🧪 Starting Headless Electron Settings 3-Tab Click & Input Simulation...');

  // Mock IPC handlers
  ipcMain.handle('email-get-config', () => ({
    language: 'zh-TW',
    enabled: true,
    accounts: [
      {
        id: 'acc-1',
        name: '工作 Gmail',
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
    language: 'zh-TW',
    enabled: true,
    calendars: [
      {
        id: 'cal-1',
        name: '主要 Google 日曆',
        color: '#38bdf8',
        enabled: true,
        url: 'https://calendar.google.com/calendar/ical/example/basic.ics'
      }
    ],
    rules: { remindAdvanceMinutes: 15, tomorrowPreviewHour: 18, checkIntervalMinutes: 15, soundEnabled: true },
    systemTimezone: 'Asia/Taipei'
  }));

  ipcMain.handle('email-test-connection', () => ({ success: true, message: '連線正常' }));
  ipcMain.handle('calendar-test-connection', () => ({ success: true, message: '日曆連線正常' }));
  ipcMain.handle('calendar-check-now', () => ({ success: true, todayCount: 2, tomorrowCount: 1, timezone: 'Asia/Taipei' }));
  ipcMain.handle('email-save-config', () => ({ success: true }));
  ipcMain.handle('calendar-save-config', () => ({ success: true }));
  ipcMain.handle('set-language', (e, lang) => lang);

  const win = new BrowserWindow({
    width: 600,
    height: 700,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../electron/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, '../email-settings.html'));

  win.webContents.on('did-finish-load', async () => {
    try {
      const result = await win.webContents.executeJavaScript(`
        (async () => {
          const logs = [];
          
          // Test 1: Check tabs count & switch to Calendar Tab
          const tabs = document.querySelectorAll('.tab-btn');
          logs.push('Found ' + tabs.length + ' tab buttons');
          
          const calTabBtn = document.getElementById('tab-btn-calendar');
          if (!calTabBtn) throw new Error('Missing tab-btn-calendar');
          calTabBtn.click();
          
          const calPanel = document.getElementById('panel-calendar');
          if (!calPanel.classList.contains('active')) throw new Error('panel-calendar not activated');
          logs.push('Switched to Calendar Tab successfully');
          
          // Test 2: Click Add Calendar button
          const btnAddCal = document.getElementById('btn-add-calendar');
          if (!btnAddCal) throw new Error('Missing btn-add-calendar');
          btnAddCal.click();
          
          const calCards = document.querySelectorAll('#calendars-container .account-card');
          logs.push('Calendar cards after add: ' + calCards.length);
          if (calCards.length < 2) throw new Error('Failed to add calendar card');
          
          // Test 3: Type into new calendar URL
          const lastCard = calCards[calCards.length - 1];
          const urlInput = lastCard.querySelector('.cal-url-input');
          urlInput.value = 'https://calendar.google.com/calendar/ical/test2/basic.ics';
          urlInput.dispatchEvent(new Event('input', { bubbles: true }));
          logs.push('Typed into URL input');
          
          // Test 4: Select Tomorrow preview hour dropdown
          const tomHourSel = document.getElementById('rule-cal-tomorrow-hour');
          tomHourSel.value = '19';
          tomHourSel.dispatchEvent(new Event('change', { bubbles: true }));
          logs.push('Changed tomorrow preview hour to 19');
          
          // Test 5: Switch back to Email Tab and Health Tab
          document.getElementById('tab-btn-email').click();
          document.getElementById('tab-btn-health').click();
          logs.push('Switched through Email and Health tabs');
          
          return { success: true, logs };
        })()
      `);

      console.log('✅ Simulation Result:', result);
      console.log('🎉 ALL 3-TAB CLICK & CALENDAR INTERACTION TESTS PASSED!');
      app.exit(0);
    } catch (err) {
      console.error('❌ Simulation Error:', err);
      app.exit(1);
    }
  });
});
