const assert = require('node:assert/strict');
const { app, BrowserWindow } = require('electron');
const path = require('path');

app.whenReady().then(async () => {
  let win;
  try {
    win = new BrowserWindow({
      width: 400,
      height: 500,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    await win.loadFile(path.join(__dirname, '../dist/index.html'));

    const result = await win.webContents.executeJavaScript(`(() => {
      const pet = document.getElementById('pet-container');
      const bubble = document.getElementById('speech-bubble');
      const text = document.getElementById('speech-text');
      if (!pet || !bubble || !text) {
        return { requiredElementsExist: false };
      }

      pet.classList.remove('dock-left');
      pet.classList.add('dock-right');
      const rightState = pet.classList.contains('dock-right') && !pet.classList.contains('dock-left');

      pet.classList.remove('dock-right');
      pet.classList.add('dock-left');
      bubble.className = 'speech-bubble trivia-mode show';
      text.textContent = '測試提醒';

      return {
        requiredElementsExist: true,
        rightState,
        leftState: pet.classList.contains('dock-left') && !pet.classList.contains('dock-right'),
        triviaVisible: bubble.classList.contains('trivia-mode') && bubble.classList.contains('show'),
        text: text.textContent
      };
    })()`);

    assert.equal(result.requiredElementsExist, true);
    assert.equal(result.rightState, true);
    assert.equal(result.leftState, true);
    assert.equal(result.triviaVisible, true);
    assert.equal(result.text, '測試提醒');

    console.log('Electron renderer docking assertions passed.');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (win && !win.isDestroyed()) win.destroy();
    app.quit();
  }
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
  app.quit();
});
