const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function capture() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 800, height: 750 }
  });

  const page = await context.newPage();

  // 1. Capture Assistant Window with Trivia Orb
  const indexPath = 'file://' + path.resolve(__dirname, '../dist/index.html').replace(/\\/g, '/');
  console.log('Loading assistant from:', indexPath);
  await page.goto(indexPath);
  await page.waitForTimeout(1000);

  // Trigger Trivia Orb & Bubble
  await page.evaluate(() => {
    const bear = document.getElementById('bear-character');
    const triv = document.getElementById('trivia-orb-container');
    const bubble = document.getElementById('speech-bubble');
    const speechText = document.getElementById('speech-text');

    if (bear) bear.classList.add('has-trivia');
    if (triv) triv.classList.add('active');
    if (bubble && speechText) {
      bubble.classList.remove('mail-mode', 'calendar-mode');
      bubble.classList.add('trivia-mode', 'show');
      speechText.innerHTML = `
        <div class="triv-notify-header">
          <span>💡 生活冷知識</span>
          <span class="triv-category-pill">🌱 生活奇妙冷知識</span>
        </div>
        <div class="triv-content">在植物學分類上，香蕉與番茄其實都屬於「漿果（Berry）」，而外表長滿小種子的草莓在植物學上反而不是真正的漿果喔！🍌🍓</div>
      `;
    }
  });

  await page.waitForTimeout(800);
  const screenshotDir = path.resolve(__dirname, '../../../../.gemini/antigravity-ide/brain/eca3c8af-bcb5-4622-bd05-637124ce494a');
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

  const petShotPath = path.join(screenshotDir, 'trivia_bubble_fixed.png');
  await page.screenshot({ path: petShotPath });
  console.log('📸 Captured Pet Window screenshot:', petShotPath);

  // 2. Capture Settings Window Tab 4
  const settingsPath = 'file://' + path.resolve(__dirname, '../dist/email-settings.html').replace(/\\/g, '/');
  console.log('Loading settings from:', settingsPath);
  await page.goto(settingsPath);
  await page.waitForTimeout(600);

  // Click Tab 4
  await page.evaluate(() => {
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
  });

  await page.waitForTimeout(600);
  const settingsShotPath = path.join(screenshotDir, 'trivia_settings_tab4.png');
  await page.screenshot({ path: settingsShotPath });
  console.log('📸 Captured Settings Tab 4 screenshot:', settingsShotPath);

  await browser.close();
  console.log('✅ UI verification capture completed!');
}

capture().catch(err => {
  console.error('Error during capture:', err);
  process.exit(1);
});
