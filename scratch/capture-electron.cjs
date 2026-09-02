const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 400,
    height: 500,
    transparent: true,
    frame: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const indexPath = path.join(__dirname, '../dist/index.html');
  await win.loadFile(indexPath);
  await new Promise(r => setTimeout(r, 600));

  await win.webContents.executeJavaScript(`
    const bear = document.getElementById('bear-character');
    const triv = document.getElementById('trivia-orb-container');
    const bubble = document.getElementById('speech-bubble');
    const speechText = document.getElementById('speech-text');

    if (bear) bear.classList.add('has-trivia');
    if (triv) triv.classList.add('active');
    if (bubble && speechText) {
      bubble.classList.remove('mail-mode', 'calendar-mode');
      bubble.classList.add('trivia-mode', 'show');
      speechText.innerHTML = \`
        <div class="triv-notify-header">
          <span>😄 今日冷笑話</span>
          <span class="triv-category-pill">💼 職場摸魚幽默</span>
        </div>
        <div class="triv-content">主管問我：「這份緊急報告今天下班前能給我嗎？」</div>
        <div class="triv-punchline">👉 我：「如果我今天不下班，是不是就不用給了？」</div>
      \`;
    }
  `);

  await new Promise(r => setTimeout(r, 600));

  const image = await win.webContents.capturePage();
  const screenshotDir = path.resolve(__dirname, '../../../../.gemini/antigravity-ide/brain/eca3c8af-bcb5-4622-bd05-637124ce494a');
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

  const petShotPath = path.join(screenshotDir, 'trivia_white_border_dark_theme.png');
  fs.writeFileSync(petShotPath, image.toPNG());
  console.log('📸 Electron captured screenshot:', petShotPath);

  app.quit();
});
