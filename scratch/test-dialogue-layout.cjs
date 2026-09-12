const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { app, BrowserWindow, ipcMain } = require('electron');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'assistant-dialogue-ui-')));

app.whenReady().then(async () => {
  let win;
  try {
    const notes = Array.from({ length: 8 }, (_, i) => ({
      id: `test-${i}`, title: `測試待辦 ${i + 1}`, color: 'amber',
      items: [{ id: `item-${i}`, text: '確認工作進度', completed: false }], status: 'active'
    }));
    for (const [channel, value] of Object.entries({
      'get-language': 'zh-TW', 'get-bubble-font-size': 'std', 'get-sticky-notes-size': 'std',
      'sticky-notes-list': { active: notes },
      'sticky-notes-save-view': { success: true },
      'laptop-get-shortcuts': { shortcuts: [], emailAccounts: [], calendars: [] }
    })) ipcMain.handle(channel, () => value);
    win = new BrowserWindow({ show: false, width: 430, height: 760,
      webPreferences: { preload: path.join(__dirname, '../electron/preload.cjs'), backgroundThrottling: false }
    });
    win.webContents.setAudioMuted(true);
    win.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_, done) => done({ cancel: true }));
    await win.loadFile(path.join(__dirname, '../dist/index.html'));
    await delay(500);
    win.webContents.send('email-sticky-updated', { enabled: true, emails: [{ subject: '測試郵件', from: 'Test' }] });
    win.webContents.send('calendar-sticky-updated', { enabled: true, events: [{ summary: '測試會議', date: '2026-09-09', time: '14:00' }] });
    const geometry = () => win.webContents.executeJavaScript(`(() => {
      const bubble = document.getElementById('speech-bubble');
      const stack = document.getElementById('assistant-panels-stack');
      return { bubble: bubble.getBoundingClientRect().toJSON(), stack: stack.getBoundingClientRect().toJSON(),
        shown: bubble.classList.contains('show'), offset: parseFloat(stack.parentElement.style.getPropertyValue('--dialogue-space')),
        boards: [...stack.querySelectorAll('section.visible')].map(el => el.getBoundingClientRect().toJSON()),
        viewportHeight: innerHeight, scrollable: bubble.scrollHeight > bubble.clientHeight };
    })()`);
    const check = async label => {
      await delay(380);
      const g = await geometry();
      assert.ok(g.shown, label);
      assert.ok(g.stack.bottom + 8 <= g.bubble.top, `${label}: overlap ${JSON.stringify(g)}`);
      assert.ok(g.stack.top >= 0, `${label}: clipped top ${JSON.stringify(g)}`);
      assert.ok(g.boards.every(r => r.top >= -1 && r.bottom <= g.bubble.top - 8 && r.height > 0), `${label}: boards ${JSON.stringify(g)}`);
      return g;
    };
    const notifications = [
      ['new-email-received', { emails: [{ subject: '通知郵件', from: 'Test', text: '測試內容' }], soundEnabled: false }],
      ['calendar-reminder', { events: [], soundEnabled: false }],
      ['health-reminder', { soundEnabled: false }],
      ['trivia-reminder', { type: 'fact', content: '這是一則測試通知。'.repeat(100), soundEnabled: false }],
      ['alarm-triggered', { notes, config: { duration: 'continuous' } }]
    ];
    for (const [size, bearSize, width, height] of [['mini', 140, 330, 460], ['std', 190, 430, 760], ['lg', 250, 450, 560]]) {
      win.setContentSize(width, height);
      win.webContents.send('size-updated', { sizeKey: size, bearSize, isInit: true });
      win.webContents.send('font-size-updated', 'xl', true);
      for (const dock of ['left', 'right']) {
        win.webContents.send('dock-side-changed', dock);
        for (const [channel, payload] of notifications) {
          win.webContents.send(channel, payload);
          await check(`${size}/${dock}/${channel}`);
        }
      }
    }
    win.setContentSize(430, 760);
    win.webContents.send('size-updated', { sizeKey: 'std', bearSize: 190, isInit: true });
    win.webContents.send('health-reminder', { soundEnabled: false });
    const short = await check('short notification');
    await win.webContents.executeJavaScript("document.getElementById('speech-text').textContent = '長通知內容測試。'.repeat(150)");
    const long = await check('content grew without a class change');
    assert.ok(long.offset > short.offset);
    assert.ok(long.scrollable);
    fs.writeFileSync(path.join(__dirname, 'dialogue-layout-verified.png'), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript("document.getElementById('sticky-add-button').click()");
    await check('note editor stays inside viewport');
    win.webContents.send('assistant-visibility-changed', false);
    await check('hidden assistant still reserves dialogue space');
    win.webContents.send('alarm-triggered', { notes: [], config: { duration: 'continuous' } });
    await check('alarm before dismissal');
    win.webContents.send('alarm-stopped');
    await delay(80);
    assert.ok((await geometry()).offset > 0, 'panels stay above the bubble during fade-out');
    await delay(380);
    const dismissed = await geometry();
    assert.equal(dismissed.shown, false);
    assert.equal(dismissed.offset, 0);
    assert.ok(dismissed.stack.bottom > long.stack.bottom);
    console.log('All five notification types, three sizes, both docks, long content, editor, hidden assistant and restoration passed.');
  } finally {
    if (win && !win.isDestroyed()) win.destroy();
    app.quit();
  }
}).catch(error => { console.error(error); app.exit(1); });
