const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');
const appRoot = process.env.ASSISTANT_TEST_APP_ROOT || path.join(__dirname, '..');
const { StickyNotesService } = require(path.join(appRoot, 'electron/sticky-notes-service.cjs'));
const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'assistant-sticky-restart-'));
app.setPath('userData', userDir);
app.on('window-all-closed', () => {});
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const channels = ['sticky-notes-list', 'sticky-notes-save-view', 'sticky-notes-create',
  'sticky-notes-update', 'sticky-notes-complete', 'sticky-notes-update-item'];

app.whenReady().then(async () => {
  let win;
  let service;
  let exitCode = 0;
  try {
    for (const [channel, value] of Object.entries({
      'get-language': 'zh-TW', 'get-bubble-font-size': 'std', 'get-sticky-notes-size': 'std',
      'laptop-get-shortcuts': { shortcuts: [], emailAccounts: [], calendars: [] }
    })) ipcMain.handle(channel, () => value);
    const restart = async ({ savedView, delayed = false } = {}) => {
      win?.destroy();
      for (const channel of channels) ipcMain.removeHandler(channel);
      service = new StickyNotesService();
      if (!service.notes.length) service.create({ title: '重啟測試便利貼', items: [{ text: '保留展開的事項' }] });
      if (savedView) service.saveViewState(savedView);
      let release;
      if (delayed) {
        const snapshot = service.getSnapshot();
        ipcMain.removeHandler('sticky-notes-list');
        ipcMain.handle('sticky-notes-list', () => new Promise(resolve => { release = () => resolve(snapshot); }));
      }
      win = new BrowserWindow({ show: false, width: 440, height: 760, webPreferences: {
        preload: path.join(appRoot, 'electron/preload.cjs'), backgroundThrottling: false
      } });
      win.webContents.setAudioMuted(true);
      win.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_, done) => done({ cancel: true }));
      await win.loadFile(path.join(appRoot, 'dist/index.html'));
      await delay(200);
      return () => release();
    };
    const click = async selector => {
      await win.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(selector)}).click()`);
      await delay(80);
    };
    const view = () => win.webContents.executeJavaScript(`({
      visible: document.getElementById('sticky-notes-board').classList.contains('visible'),
      reopen: document.getElementById('sticky-reopen-tab').classList.contains('visible'),
      expanded: document.querySelector('.sticky-note-card')?.classList.contains('expanded')
    })`);
    await restart();
    assert.equal((await view()).visible, true, 'existing notes default to visible');
    await click('[data-action="expand"]');
    await restart();
    assert.deepEqual(await view(), { visible: true, reopen: false, expanded: true });
    await click('#sticky-board-close');
    await restart();
    assert.deepEqual(await view(), { visible: false, reopen: true, expanded: true });
    await click('#sticky-reopen-tab');
    await restart();
    assert.deepEqual(await view(), { visible: true, reopen: false, expanded: true });
    await click('[data-action="expand"]');
    await restart();
    assert.deepEqual(await view(), { visible: true, reopen: false, expanded: false });

    const noteId = service.notes[0].id;
    const release = await restart({ savedView: { dismissed: true, expandedNoteIds: [noteId] }, delayed: true });
    await click('#sticky-add-button');
    release();
    await delay(100);
    assert.equal(service.getSnapshot().viewState.dismissed, false, 'opening while loading wins over the saved hidden state');
    await restart();
    assert.deepEqual(await view(), { visible: true, reopen: false, expanded: true });

    const file = path.join(userDir, 'sticky-notes-view.json');
    const before = fs.readFileSync(file, 'utf8');
    assert.equal(service.saveViewState({ dismissed: 'false', expandedNoteIds: [] }).success, false);
    assert.equal(fs.readFileSync(file, 'utf8'), before, 'invalid input cannot overwrite the saved state');
    const contents = fs.readFileSync(path.join(userDir, 'sticky-notes.json'), 'utf8');
    fs.writeFileSync(file, '{broken');
    await restart();
    assert.equal((await view()).visible, true, 'damaged view settings cannot hide notes');
    assert.equal(fs.readFileSync(path.join(userDir, 'sticky-notes.json'), 'utf8'), contents);
    console.log('Fresh service/window restart preserves visible, hidden, expanded and collapsed states; slow startup and corrupt settings passed.');
  } catch (error) {
    console.error(error);
    exitCode = 1;
  } finally {
    if (win && !win.isDestroyed()) win.destroy();
    app.exit(exitCode);
  }
}).catch(error => { console.error(error); app.exit(1); });
