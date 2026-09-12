const assert = require('node:assert/strict');
const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');

let savedBrowserAssignments = null;

function register(channel, handler) {
  ipcMain.handle(channel, typeof handler === 'function' ? handler : () => handler);
}

app.whenReady().then(async () => {
  register('email-get-config', {
    enabled: true,
    language: 'zh-TW',
    accounts: [
      { id: 'work', name: '工作信箱', enabled: true, provider: 'gmail', user: 'work@example.com' },
      { id: 'personal', name: '私人信箱', enabled: true, provider: 'outlook', user: 'personal@example.com' }
    ],
    rules: {}
  });
  register('calendar-get-config', {
    enabled: true,
    calendars: [
      { id: 'team', name: '團隊日曆', enabled: true, url: '' },
      { id: 'home', name: '家庭日曆', enabled: true, url: '' }
    ],
    rules: {}
  });
  register('trivia-get-config', { enabled: false });
  register('alarm-get-config', { soundType: 'preset', customPaths: [] });
  register('get-app-version', { displayVersion: 'Ver.1.4.0' });
  register('get-panel-opacity', {});
  register('get-focus-mode', { active: false, until: 0 });
  register('get-update-settings', { enabled: true });
  register('set-focus-mode', { success: true, active: true, until: Date.now() + 1800000 });
  register('set-update-settings', { success: true, enabled: true });
  register('check-for-updates', { success: true });
  register('install-update', { success: true });
  register('laptop-get-shortcut-settings', {
    shortcuts: [
      { id: 'portal', type: 'website', name: 'Portal', target: 'https://example.com', letter: 'P', color: '#2563eb', logoPath: 'C:\\mock-logo.png', logoUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XGZPFAAAAABJRU5ErkJggg==' },
      { id: 'editor', type: 'app', name: 'Editor', target: 'C:\\Editor.exe', letter: 'E', color: '#4f46e5' }
    ],
    browserAssignments: { 'email:work': 'C:\\Browsers\\WorkBrowser.exe' },
    installedBrowsers: [
      { name: 'Microsoft Edge', path: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' },
      { name: 'Google Chrome', path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' }
    ],
    maxShortcuts: 15,
    maxMenuActions: 20,
    fixedActionCount: 5
  });
  register('laptop-choose-browser', { canceled: false, path: 'C:\\Browsers\\PortalBrowser.exe' });
  register('laptop-save-browser-settings', (event, input) => {
    savedBrowserAssignments = input;
    return { ok: true, browserAssignments: input };
  });
  register('email-save-config', { success: true });
  register('calendar-save-config', { success: true });
  register('trivia-save-config', { success: true });
  register('alarm-save-config', { success: true });
  register('set-panel-opacity', { success: true });
  register('laptop-replace-shortcuts', { ok: true });

  const win = new BrowserWindow({
    show: false,
    width: 900,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, '../electron/preload.cjs'),
      contextIsolation: true
    }
  });

  await win.loadFile(path.join(__dirname, '../dist/email-settings.html'));
  await new Promise(resolve => setTimeout(resolve, 300));

  const initial = await win.webContents.executeJavaScript(`(() => {
    document.querySelector('[data-tab="panel-shortcuts"]').click();
    return {
      rows: document.querySelectorAll('.browser-setting-row').length,
      names: [...document.querySelectorAll('.browser-setting-name')].map(node => node.textContent),
      paths: [...document.querySelectorAll('.browser-setting-path')].map(node => node.textContent),
      browserOptions: [...document.querySelector('[data-browser-select-key="custom:portal"]').options].map(option => option.textContent),
      logoPickerExists: !!document.getElementById('shortcut-choose-logo'),
      logoPreviewExists: !!document.getElementById('shortcut-logo-preview'),
      logoDescription: document.getElementById('shortcut-logo-description')?.textContent || '',
      aiLogoPromptExists: !!document.getElementById('shortcut-ai-logo-prompt'),
      aiLogoCopyExists: !!document.getElementById('shortcut-copy-ai-logo-prompt'),
      aiLogoPrompt: document.getElementById('shortcut-ai-logo-prompt')?.value || '',
      featureIntroCount: document.querySelectorAll('.feature-intro').length,
      shortcutIntro: document.getElementById('intro-shortcuts')?.textContent || '',
      savedLogoRenders: !!document.querySelector('[data-shortcut-id="portal"] .shortcut-settings-icon img'),
      savedLogoCanChange: !!document.querySelector('[data-shortcut-logo-id="portal"]'),
      savedLogoCanClear: !!document.querySelector('[data-shortcut-clear-logo-id="portal"]'),
      shortcutLayout: (() => {
        const list = document.querySelector('.shortcut-list-section').getBoundingClientRect();
        const browser = document.querySelector('.shortcut-browser-section').getBoundingClientRect();
        const editor = document.querySelector('.shortcut-editor').getBoundingClientRect();
        return {
          panelDisplay: getComputedStyle(document.getElementById('panel-shortcuts')).display,
          sideBySide: Math.abs(list.top - browser.top) < 2 && list.right < browser.left,
          editorBelowColumns: editor.top > Math.max(list.bottom, browser.bottom),
          compactShortcutCards: [...document.querySelectorAll('.shortcut-settings-card')]
            .every(card => card.getBoundingClientRect().height <= 70),
          compactBrowserCards: [...document.querySelectorAll('.browser-setting-row')]
            .every(card => card.getBoundingClientRect().height <= 70),
          websiteFieldHiddenForApp: getComputedStyle(document.getElementById('shortcut-website-target')).display === 'none'
        };
      })()
    };
  })()`);
  assert.equal(initial.rows, 5);
  assert.deepEqual(initial.names, ['工作信箱', '私人信箱', '團隊日曆', '家庭日曆', 'Portal']);
  assert.equal(initial.paths[0], 'WorkBrowser.exe');
  assert.equal(initial.paths[4], 'Windows 預設瀏覽器');
  assert.deepEqual(initial.browserOptions, ['Windows 預設', 'Microsoft Edge', 'Google Chrome', '選擇其他瀏覽器…']);
  assert.equal(initial.logoPickerExists, true);
  assert.equal(initial.logoPreviewExists, true);
  assert.match(initial.logoDescription, /128×128px/);
  assert.match(initial.logoDescription, /10MB/);
  assert.equal(initial.aiLogoPromptExists, true);
  assert.equal(initial.aiLogoCopyExists, true);
  assert.match(initial.aiLogoPrompt, /125×125/);
  assert.match(initial.aiLogoPrompt, /32×32/);
  assert.equal(initial.featureIntroCount, 6);
  assert.match(initial.shortcutIntro, /Logo/);
  assert.equal(initial.savedLogoRenders, true);
  assert.equal(initial.savedLogoCanChange, true);
  assert.equal(initial.savedLogoCanClear, true);
  assert.equal(initial.shortcutLayout.panelDisplay, 'grid');
  assert.equal(initial.shortcutLayout.sideBySide, true, JSON.stringify(initial.shortcutLayout));
  assert.equal(initial.shortcutLayout.editorBelowColumns, true, JSON.stringify(initial.shortcutLayout));
  assert.equal(initial.shortcutLayout.compactShortcutCards, true, JSON.stringify(initial.shortcutLayout));
  assert.equal(initial.shortcutLayout.compactBrowserCards, true, JSON.stringify(initial.shortcutLayout));
  assert.equal(initial.shortcutLayout.websiteFieldHiddenForApp, true);

  const shortcutLimitState = await win.webContents.executeJavaScript(`(() => {
    const websiteType = document.querySelector('input[name="shortcut-type"][value="website"]');
    websiteType.checked = true;
    websiteType.dispatchEvent(new Event('change', { bubbles: true }));
    for (let index = 1; index <= 13; index += 1) {
      document.getElementById('shortcut-name').value = 'Extra ' + index;
      document.getElementById('shortcut-url').value = 'https://example.com/' + index;
      document.getElementById('shortcut-add').click();
    }
    return {
      count: document.querySelectorAll('.shortcut-settings-card').length,
      addDisabled: document.getElementById('shortcut-add').disabled,
      tip: document.getElementById('shortcut-section-tip').textContent
    };
  })()`);
  assert.equal(shortcutLimitState.count, 15);
  assert.equal(shortcutLimitState.addDisabled, true);
  assert.match(shortcutLimitState.tip, /20/);

  await win.webContents.executeJavaScript(`(() => {
    const select = document.querySelector('[data-browser-select-key="custom:portal"]');
    select.value = 'C:\\\\Program Files (x86)\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await new Promise(resolve => setTimeout(resolve, 100));
  const portalPath = await win.webContents.executeJavaScript(`document.querySelector('[data-browser-select-key="custom:portal"]').closest('.browser-setting-row').querySelector('.browser-setting-path').textContent`);
  assert.equal(portalPath, 'msedge.exe');

  await win.webContents.executeJavaScript(`document.getElementById('btn-save').click()`);
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.deepEqual(savedBrowserAssignments, {
    'email:work': 'C:\\Browsers\\WorkBrowser.exe',
    'custom:portal': 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  });

  console.log('Per-item browser settings UI assertions passed.');
  win.destroy();
  app.quit();
}).catch(error => {
  console.error(error);
  app.exit(1);
});
