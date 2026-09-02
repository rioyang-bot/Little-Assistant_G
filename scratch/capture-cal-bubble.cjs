const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(async () => {
  ipcMain.handle('get-language', () => 'zh-TW');

  const win = new BrowserWindow({
    width: 310,
    height: 390,
    show: false,
    transparent: true,
    frame: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '../electron/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.showInactive();

  const distPath = path.join(__dirname, '../dist/index.html');
  await win.loadFile(distPath);
  await new Promise(r => setTimeout(r, 600));

  await win.webContents.executeJavaScript(`
    const bear = document.getElementById('bear-character');
    const mail = document.getElementById('mail-opened-container');
    const bubble = document.getElementById('speech-bubble');
    const text = document.getElementById('speech-text');

    bear.classList.add('has-mail');
    if (mail) mail.classList.add('active');
    bubble.className = 'speech-bubble mail-mode show';
    text.innerHTML = \`
      <div class="mail-notify-header">
        <span>📬</span>
        <span>收到 1 封新郵件！</span>
      </div>
      <div class="mail-item single">
        <div class="mail-item-header">
          <span class="mail-item-badge">NEW</span>
          <span class="mail-account-badge">工作 Gmail</span>
          <span class="mail-notify-sender">Google 團隊</span>
        </div>
        <div class="mail-notify-subject">【安全性快訊】您的帳戶已成功登入</div>
      </div>
    \`;
  `);

  await new Promise(r => setTimeout(r, 400));

  const state = await win.webContents.executeJavaScript(`({
    bearClass: document.getElementById('bear-character').className,
    calClass: document.getElementById('calendar-orb-container').className,
    bubbleClass: document.getElementById('speech-bubble').className,
    textHtml: document.getElementById('speech-text').innerHTML
  })`);
  console.log('Current State:', state);

  const image = await win.webContents.capturePage();
  const outPath = path.join(__dirname, 'cal-bubble-preview.png');
  fs.writeFileSync(outPath, image.toPNG());
  console.log('Saved cal preview to', outPath);
  app.quit();
});
