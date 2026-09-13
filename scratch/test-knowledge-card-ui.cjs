const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');

let savedCard = null;

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 520,
    height: 590,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../electron/preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  try {
    ipcMain.handle('get-language', () => 'zh-TW');
    ipcMain.handle('knowledge-cards-add', (event, input) => {
      savedCard = input;
      return { success: true, card: { id: 'quick-card', ...input } };
    });
    await win.loadFile(path.join(__dirname, '../dist/knowledge-card.html'));
    const initial = await win.webContents.executeJavaScript(`({
      heading: document.getElementById('heading').textContent,
      titleMax: document.getElementById('knowledge-quick-title').maxLength,
      contentMax: document.getElementById('knowledge-quick-content').maxLength,
      logo: document.querySelector('.knowledge-logo img').getAttribute('src')
    })`);
    assert.equal(initial.heading, '新增知識卡');
    assert.equal(initial.titleMax, 60);
    assert.equal(initial.contentMax, 500);
    assert.equal(initial.logo, 'assets/knowledge-brain.png');

    await win.webContents.executeJavaScript(`(() => {
      document.getElementById('knowledge-quick-title').value = '資料庫索引原則';
      const content = document.getElementById('knowledge-quick-content');
      content.value = '先查看執行計畫，再決定是否建立索引。';
      content.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('knowledge-quick-form').requestSubmit();
    })()`);
    await new Promise(resolve => setTimeout(resolve, 80));
    assert.deepEqual(savedCard, {
      title: '資料庫索引原則',
      content: '先查看執行計畫，再決定是否建立索引。',
      enabled: true
    });
    assert.match(await win.webContents.executeJavaScript(`document.getElementById('knowledge-quick-feedback').textContent`), /已儲存/);
    console.log('Knowledge card quick-add UI assertions passed.');
  } finally {
    if (!win.isDestroyed()) win.destroy();
    app.quit();
  }
}).catch(error => {
  console.error(error);
  app.exit(1);
});
