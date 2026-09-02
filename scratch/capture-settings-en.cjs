const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 780,
    height: 780,
    minWidth: 640,
    minHeight: 620,
    backgroundColor: '#0b1120',
    webPreferences: {
      preload: path.join(__dirname, '../electron/preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const distSettings = path.join(__dirname, '../dist/email-settings.html');
  await win.loadFile(distSettings);

  // Switch to EN
  await win.webContents.executeJavaScript(`
    const btnEn = document.getElementById('btn-lang-en');
    if (btnEn) btnEn.click();
  `);

  await new Promise(r => setTimeout(r, 600));

  const image = await win.webContents.capturePage();
  const screenshotDir = path.resolve(__dirname, '../../../../.gemini/antigravity-ide/brain/eca3c8af-bcb5-4622-bd05-637124ce494a');
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

  const shotPath = path.join(screenshotDir, 'settings_en_tabs.png');
  fs.writeFileSync(shotPath, image.toPNG());
  console.log('📸 Settings EN screenshot saved:', shotPath);

  app.quit();
});
