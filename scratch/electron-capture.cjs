const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(async () => {
  const screenshotDir = path.resolve(__dirname, '../../../../.gemini/antigravity-ide/brain/77d56edc-f9eb-496b-a471-3a75d18c4fc0/.tempmediaStorage');
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

  // 1. Pet Window Screenshot
  const petWin = new BrowserWindow({
    width: 390,
    height: 490,
    show: false,
    transparent: true,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, '../electron/preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const distIndex = path.join(__dirname, '../dist/index.html');
  await petWin.loadFile(distIndex);
  await new Promise(r => setTimeout(r, 1000));

  const jsRes = await petWin.webContents.executeJavaScript(`
    (() => {
      const bear = document.getElementById('bear-character');
      const triv = document.getElementById('trivia-orb-container');
      const ball = document.getElementById('ball-canvas-container');
      const bubble = document.getElementById('speech-bubble');
      const speechText = document.getElementById('speech-text');

      if (bear) bear.classList.add('has-trivia');
      if (ball) ball.style.opacity = '0';
      if (triv) {
        triv.classList.add('active');
        triv.style.opacity = '1';
        triv.style.transform = 'scale(1) rotate(0deg)';
        triv.style.pointerEvents = 'auto';
      }
      if (bubble && speechText) {
        bubble.classList.remove('mail-mode', 'calendar-mode');
        bubble.classList.add('trivia-mode', 'show');
        speechText.innerHTML = \`
          <div class="triv-notify-header">
            <span>💡</span>
            <span>生活冷知識</span>
            <span class="triv-category-pill">🔬 科普小百科</span>
          </div>
          <div class="triv-title">你知道「蜂蜜」永不過期嗎？</div>
          <div class="triv-content">古埃及法老金字塔中發現的 3000 多年前蜂蜜，至今依然完好可以食用！因為它的含水量極低且呈高酸性。</div>
        \`;
      }
      return {
        bearClass: bear ? bear.className : null,
        trivFound: !!triv,
        trivClass: triv ? triv.className : null,
        bubbleClass: bubble ? bubble.className : null
      };
    })()
  `);
  console.log('Execute JS result:', jsRes);

  petWin.show();
  await new Promise(r => setTimeout(r, 600));
  const petImage = await petWin.webContents.capturePage();
  const petShotPath = path.join(screenshotDir, 'trivia_orb_preview.png');
  fs.writeFileSync(petShotPath, petImage.toPNG());
  console.log('📸 Saved Pet Window screenshot:', petShotPath);
  petWin.close();

  // 2. Settings Window Screenshot
  const setWin = new BrowserWindow({
    width: 680,
    height: 740,
    show: false,
    backgroundColor: '#0b1120',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  const distSettings = path.join(__dirname, '../dist/email-settings.html');
  await setWin.loadFile(distSettings);
  await new Promise(r => setTimeout(r, 600));

  await setWin.webContents.executeJavaScript(`
    const tabBtn = document.getElementById('tab-btn-trivia');
    if (tabBtn) tabBtn.click();
    const box = document.getElementById('trivia-preview-box');
    const title = document.getElementById('triv-res-title');
    const content = document.getElementById('triv-res-content');
    if (box && title && content) {
      box.style.display = 'block';
      title.textContent = '💡 趣味生活小知識：打哈欠真的會傳染嗎？';
      content.textContent = '研究發現打哈欠具有高度共情傳染性，當看到別人或甚至小動物打哈欠時，大腦鏡像神經元會自然同步觸發！';
    }
  `);

  await new Promise(r => setTimeout(r, 600));
  const setImage = await setWin.webContents.capturePage();
  const setShotPath = path.join(screenshotDir, 'trivia_settings_tab4.png');
  fs.writeFileSync(setShotPath, setImage.toPNG());
  console.log('📸 Saved Settings Tab 4 screenshot:', setShotPath);
  setWin.close();

  console.log('✅ Electron capture complete!');
  app.quit();
});
