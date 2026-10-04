const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const electron = require('electron');
const { app } = electron;
const appRoot = process.env.ASSISTANT_TEST_APP_ROOT || path.join(__dirname, '..');
const { DesktopOrganizer } = require(path.join(appRoot, 'electron/desktop-organizer.cjs'));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'organizer-ui-'));
app.setPath('userData', dir);
let service;
function assertSameVisibleIcon(actual, expected, message = 'Icon pixels must retain their appearance') {
  const { PNG } = require('pngjs');
  const a = PNG.sync.read(electron.nativeImage.createFromDataURL(actual).toPNG());
  const b = PNG.sync.read(electron.nativeImage.createFromDataURL(expected).toPNG());
  assert.deepEqual([a.width, a.height], [b.width, b.height]);
  // Native icon conversion can round premultiplied alpha by one value and
  // encode transparent RGB differently. Compare visible pixels, not PNG bytes.
  for (let i = 0; i < a.data.length; i += 4) {
    assert.ok(Math.abs(a.data[i + 3] - b.data[i + 3]) <= 3, message);
    for (let channel = 0; channel < 3; channel++) {
      assert.ok(Math.abs(a.data[i + channel] * a.data[i + 3] / 255 - b.data[i + channel] * b.data[i + 3] / 255) <= 3, message);
    }
  }
}
app.whenReady().then(async () => {
  try {
    const target = path.join(dir, '開發筆記.txt'); fs.writeFileSync(target, 'test');
    const folder = path.join(dir, '文件'); fs.mkdirSync(folder);
    fs.writeFileSync(path.join(folder, '內容.txt'), 'folder contents');
    const shortcut = path.join(dir, 'Webex.lnk');
    assert.equal(electron.shell.writeShortcutLink(shortcut, { target: process.execPath, icon: process.execPath, iconIndex: 0 }), true);
    const background = path.join(dir, 'background.png');
    fs.copyFileSync(path.join(__dirname, '../assets/icon.png'), background);
    let opened;
    let confirmDelete = false;
    let contextRequest;
    service = new DesktopOrganizer({ ...electron, organizerContextMenu: { async show(request) { contextRequest=request; return {action:'cancel'}; } }, dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [background] }), showMessageBox: async () => ({ response: confirmDelete ? 1 : 0 }) }, shell: { readShortcutLink: electron.shell.readShortcutLink, openPath: async file => { opened = file; return ''; }, showItemInFolder() {} } }, dir);
    service.register(); service.create();
    const board = service.boards[0];
    const win = service.windows.get(board.id);
    await new Promise(resolve => win.webContents.once('did-finish-load', resolve));
    const errors = [];
    win.webContents.on('console-message', (_event, level, message) => { if (level >= 3) errors.push(message); });
    const initial = await win.webContents.executeJavaScript(`window.electronAPI.invoke('organizer-get').then(board => ({ title: board.title, items: board.items.length }))`);
    assert.equal(initial.items, 0);
    await service.nativeDrag.prepare();
    const result = await win.webContents.executeJavaScript(`(async () => {
      const api = window.electronAPI;
      const added = await api.invoke('organizer-add', [${JSON.stringify(target)}, ${JSON.stringify(folder)}, ${JSON.stringify(shortcut)}]);
      await api.invoke('organizer-update', { title: '常用文件', color: '#6b2835', opacity: 55, pattern: 'grid', locked: true });
      await api.invoke('organizer-open', added.board.items[0].id);
      return { count: added.board.items.length, id: added.board.items[0].id };
    })()`);
    assert.equal(result.count, 3); assert.equal(opened, board.items[0].path);
    assert.equal(fs.existsSync(target), true);
    assert.equal(fs.existsSync(folder), true);
    assert.equal(fs.existsSync(shortcut), true);
    assert.deepEqual(board.items.map(item => item.path), [target, folder, shortcut]);
    assert.equal(fs.existsSync(service.filesRoot), false);
    assert.equal(electron.shell.readShortcutLink(board.items[2].path).target, process.execPath);
    const shortcutIcon = await service.getIcon(board.items[2]);
    const extracted = await require(path.join(appRoot, 'electron/organizer-files.cjs')).extractShortcutIcon(process.execPath, 0);
    assert.match(extracted, /^data:image\/png;base64,/);
    assertSameVisibleIcon(shortcutIcon, extracted);
    assert.match(shortcutIcon, /^data:image\/png;base64,/);
    assert.equal(electron.nativeImage.createFromDataURL(shortcutIcon).isEmpty(), false);
    // Folder paths need their real Shell icons, including custom desktop.ini
    // icons. Extensionless file associations must not replace folder icons.
    const { extractShellIcon } = require(path.join(appRoot, 'electron/organizer-files.cjs'));
    const folderIcon = await service.getIcon(board.items[1]);
    assert.match(folderIcon, /^data:image\/png;base64,/);
    assertSameVisibleIcon(folderIcon, await extractShellIcon(folder));
    const extensionless = path.join(dir, 'extensionless'); fs.writeFileSync(extensionless, 'document');
    assert.notEqual(folderIcon, (await electron.app.getFileIcon(extensionless, { size: 'normal' })).toDataURL());
    const customFolder = path.join(dir, 'custom-folder'); fs.mkdirSync(customFolder);
    const customIni = path.join(customFolder, 'desktop.ini');
    fs.writeFileSync(customIni, '\ufeff[.ShellClassInfo]\r\nIconResource=' + process.execPath + ',0\r\n', 'utf16le');
    require('child_process').execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '[IO.File]::SetAttributes($env:ORGANIZER_CUSTOM_FOLDER,[IO.FileAttributes]17);[IO.File]::SetAttributes($env:ORGANIZER_CUSTOM_INI,[IO.FileAttributes]6)'], { windowsHide: true, env: { ...process.env, ORGANIZER_CUSTOM_FOLDER: customFolder, ORGANIZER_CUSTOM_INI: customIni } });
    const customIcon = await service.getIcon({ path: customFolder });
    assert.notEqual(customIcon, folderIcon, 'custom folder icon must survive');
    require('child_process').execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '[IO.File]::SetAttributes($env:ORGANIZER_CUSTOM_FOLDER,[IO.FileAttributes]23)'], { windowsHide: true, env: { ...process.env, ORGANIZER_CUSTOM_FOLDER: customFolder } });
    service.icons.clear();
    assertSameVisibleIcon(await service.getIcon({ path: customFolder }), customIcon, 'hiding a collected folder must retain its custom icon');
    assert.equal(win.isResizable(), false);
    const image = await win.webContents.executeJavaScript(`window.electronAPI.invoke('organizer-background').then(board => board.image)`);
    assert.match(image, /^data:image\/png;base64,/);
    assert.equal(new DesktopOrganizer({}, dir).boards[0].image, image);
    await win.webContents.executeJavaScript(`window.electronAPI.invoke('organizer-update', { clearImage: true })`);
    // Reload verifies the board no longer embeds the settings form.
    const delay = ms => new Promise(resolve => setTimeout(resolve,ms));
    const loaded = new Promise(resolve => win.webContents.once('did-finish-load', resolve));
    win.reload(); await loaded;
    for(let attempt=0;attempt<100 && await win.webContents.executeJavaScript(`document.querySelectorAll('.item').length`) !== 3;attempt++)await delay(20);
    assert.deepEqual(await win.webContents.executeJavaScript(`({ title:document.getElementById('title').textContent,count:document.querySelectorAll('.item').length,locked:document.getElementById('board').classList.contains('locked'),editHidden:document.getElementById('edit').hidden,editDisabled:document.getElementById('edit').disabled,lockName:document.getElementById('lock').title,inlineSettings:!!document.getElementById('settings') })`), {title:'常用文件',count:3,locked:true,editHidden:true,editDisabled:true,lockName:'解鎖',inlineSettings:false});
    await assert.rejects(win.webContents.executeJavaScript(`window.electronAPI.invoke('organizer-settings-open')`),/已鎖定/);
    await win.webContents.executeJavaScript(`document.getElementById('edit').click()`);
    assert.equal(service.settingsWindows.size,0,'locked settings button cannot open a dialog');
    assert.equal(service.layers.get(board.id).mode,'bottom');
    await win.webContents.executeJavaScript(`document.getElementById('lock').click()`);
    for(let i=0;i<100 && board.locked;i++)await delay(20);
    assert.equal(board.locked,false);
    assert.equal(await win.webContents.executeJavaScript(`document.getElementById('lock').title`),'鎖定');
    async function openSettings() {
      await win.webContents.executeJavaScript(`document.getElementById('edit').click()`);
      for(let i=0;i<100 && !service.settingsWindows.get(board.id);i++)await delay(20);
      const entry=service.settingsWindows.get(board.id);
      assert.ok(entry);await entry.ready;
      const settings=entry.window;
      assert.notEqual(settings,win);assert.equal(settings.getParentWindow(),win);
      for(let i=0;i<100 && !(await settings.webContents.executeJavaScript(`!document.getElementById('settings').inert && document.getElementById('name').value===${JSON.stringify(board.title)}`));i++)await delay(20);
      assert.equal(service.layers.get(board.id).modalDepth,1);
      assert.equal(service.layers.get(board.id).helper,null,'bottom helper remains stopped for the popup lifetime');
      assert.equal(await win.webContents.executeJavaScript(`!!document.getElementById('settings')`),false);
      return settings;
    }
    async function closeSettings(settings, button='cancel') {
      await settings.webContents.executeJavaScript(`document.getElementById('${button}').click()`);
      for(let i=0;i<100 && service.settingsWindows.has(board.id);i++)await delay(20);
      assert.equal(service.settingsWindows.has(board.id),false);
      assert.equal(service.layers.get(board.id).modalDepth,0,'bottom control resumes when settings close');
      await delay(50);
    }
    const originalHeader=await win.webContents.executeJavaScript(`getComputedStyle(document.getElementById('header')).backgroundColor`);
    let settings=await openSettings();
    await assert.rejects(settings.webContents.executeJavaScript(`window.electronAPI.invoke('organizer-add',[])`),/無法存取/,'settings sender cannot use file operations');
    assert.deepEqual(await settings.webContents.executeJavaScript(`({transparency:document.getElementById('opacity').value,color:document.getElementById('color').value})`),{transparency:'45',color:'#6b2835'});
    await win.webContents.executeJavaScript(`window.previewNode=document.querySelector('.item')`);
    await settings.webContents.executeJavaScript(`(() => {
      for(const [id,value] of [['header-color-mode','custom'],['header-color','#234567'],['header-text-color','#80eeaa'],['text-color','#ffc878']]){
        const node=document.getElementById(id);node.value=value;node.dispatchEvent(new Event(id==='header-color-mode'?'change':'input',{bubbles:true}));
      }
      document.getElementById('arrangement').value='grid';document.getElementById('arrangement').dispatchEvent(new Event('change',{bubbles:true}));
    })()`);
    for(let i=0;i<100 && service.settingsWindows.get(board.id)?.preview?.textColor!=='#ffc878';i++)await delay(20);
    await delay(50);
    assert.deepEqual(await win.webContents.executeJavaScript(`({background:getComputedStyle(document.getElementById('header')).backgroundColor,title:getComputedStyle(document.getElementById('title')).color,files:[...document.querySelectorAll('.item span')].map(node=>getComputedStyle(node).color),sameNode:window.previewNode===document.querySelector('.item')})`),{background:'rgb(35, 69, 103)',title:'rgb(128, 238, 170)',files:Array(3).fill('rgb(255, 200, 120)'),sameNode:true});
    assert.equal(board.headerTextColor,'#f7f7fb');assert.equal(board.textColor,'#f7f7fb');
    await closeSettings(settings);
    assert.equal(board.arrangement,'free','cancelling settings also discards unsaved arrangement');
    assert.equal(await win.webContents.executeJavaScript(`getComputedStyle(document.getElementById('title')).color`),'rgb(247, 247, 251)');
    assert.equal(await win.webContents.executeJavaScript(`getComputedStyle(document.getElementById('header')).backgroundColor`),originalHeader);
    settings=await openSettings();
    const duplicate=service.settingsWindows.get(board.id);
    await win.webContents.executeJavaScript(`window.electronAPI.invoke('organizer-settings-open')`);
    assert.equal(service.settingsWindows.get(board.id),duplicate,'reopening focuses the existing popup');
    await settings.webContents.executeJavaScript(`(() => {
      document.getElementById('header-color-mode').value='custom';document.getElementById('header-color').value='#234567';
      document.getElementById('header-text-color').value='#80eeaa';document.getElementById('text-color').value='#ffc878';
      document.getElementById('header-text-color').dispatchEvent(new Event('input',{bubbles:true}));
    })()`);
    await closeSettings(settings,'save');
    const savedHeader=new DesktopOrganizer({},dir).boards[0];
    assert.equal(savedHeader.headerColorMode,'custom');assert.equal(savedHeader.headerColor,'#234567');
    assert.equal(savedHeader.headerTextColor,'#80eeaa');assert.equal(savedHeader.textColor,'#ffc878');
    assert.equal(savedHeader.color,'#6b2835');assert.equal(savedHeader.opacity,55);
    const colorLoaded=new Promise(resolve=>win.webContents.once('did-finish-load',resolve));win.reload();await colorLoaded;
    for(let i=0;i<100 && await win.webContents.executeJavaScript(`document.querySelectorAll('.item').length`)!==3;i++)await delay(20);
    assert.equal(await win.webContents.executeJavaScript(`getComputedStyle(document.getElementById('title')).color`),'rgb(128, 238, 170)');
    settings=await openSettings();
    await settings.webContents.executeJavaScript(`document.getElementById('header-color-mode').value='follow';document.getElementById('header-color-mode').dispatchEvent(new Event('change',{bubbles:true}))`);
    await closeSettings(settings,'save');
    assert.equal(await win.webContents.executeJavaScript(`getComputedStyle(document.getElementById('header')).backgroundColor`),originalHeader);
    assert.equal(board.headerTextColor,'#80eeaa');
    // Image selection is owned by the popup; cancelling it keeps the saved background.
    settings=await openSettings();
    await settings.webContents.executeJavaScript(`document.getElementById('background').click()`);
    for(let i=0;i<100 && !service.settingsWindows.get(board.id)?.preview?.image;i++)await delay(20);
    assert.match(service.settingsWindows.get(board.id).preview.image,/^data:image\/png;base64,/);
    assert.equal(board.image,'','selecting a picture previews it without saving');
    await closeSettings(settings);
    assert.equal(board.image,'');
    // Locking dismisses any pending settings and restores the saved appearance.
    settings=await openSettings();
    await win.webContents.executeJavaScript(`window.electronAPI.invoke('organizer-update',{locked:true})`);
    for(let i=0;i<100 && service.settingsWindows.has(board.id);i++)await delay(20);
    assert.equal(settings.isDestroyed(),true);assert.equal(service.settingsWindows.size,0);
    assert.equal(await win.webContents.executeJavaScript(`document.getElementById('edit').hidden && document.getElementById('edit').disabled`),true);
    const lockLoaded=new Promise(resolve=>win.webContents.once('did-finish-load',resolve));win.reload();await lockLoaded;
    for(let i=0;i<100 && !(await win.webContents.executeJavaScript(`document.getElementById('board').classList.contains('locked')`));i++)await delay(20);
    assert.equal(await win.webContents.executeJavaScript(`document.getElementById('edit').hidden`),true,'locked settings stay hidden after reload');
    await win.webContents.executeJavaScript(`window.electronAPI.invoke('organizer-update',{locked:false})`);
    // Window order has a separate native regression test. Focus this isolated
    // input fixture so synthetic mouse events can acquire pointer capture.
    service.layers.get(board.id).dispose();
    win.focus();
    const labels = await win.webContents.executeJavaScript(`({ names: [...document.querySelectorAll('.item span')].map(node => node.textContent), buttons: !!document.getElementById('files') || !!document.getElementById('folders') || !!document.getElementById('path-toggle') })`);
    assert.deepEqual(labels, { names: ['開發筆記.txt', '文件', 'Webex'], buttons: false });
    await win.webContents.executeJavaScript(`document.querySelector('.item').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX:40,clientY:80 }))`);
    for(let attempt=0;attempt<100 && !contextRequest;attempt++)await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(contextRequest.file,target);assert.equal(contextRequest.removeLabel,'從整理視窗移除');
    assert.equal(await win.webContents.executeJavaScript(`document.getElementById('item-menu').hidden`),true,'native context menu replaces the HTML menu');
    await win.webContents.executeJavaScript(`document.dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
    const imageDrag = await win.webContents.executeJavaScript(`(async () => {
      for (let attempt = 0; attempt < 100 && document.querySelectorAll('.item img').length < 3; attempt++) await new Promise(resolve => setTimeout(resolve, 20));
      return [...document.querySelectorAll('.item img')].map(image => image.draggable);
    })()`);
    assert.deepEqual(imageDrag, [false, false, false]);
    await win.webContents.executeJavaScript(`document.querySelector('.item').focus()`);
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Right' });
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Down' });
    for (let attempt = 0; attempt < 50 && board.items[0].position.y !== 20; attempt++) await new Promise(resolve => setTimeout(resolve, 20));
    assert.deepEqual(board.items[0].position, { x: 16, y: 20 });
    assert.deepEqual(new DesktopOrganizer({}, dir).boards[0].items[0].position, { x: 16, y: 20 });
    // No physical mouse button is held: the native helper must cancel safely.
    const canceled = await win.webContents.executeJavaScript(`window.electronAPI.invoke('organizer-drag-out', ${JSON.stringify(result.id)})`);
    assert.equal(canceled.items.length, 3);
    assert.equal(fs.existsSync(board.items[0].path), true);
    // OLE must start while the pointer is still INSIDE the source window.
    let handedOff = false;
    const nativeDrag = service.nativeDrag;
    service.nativeDrag = { async drag(file) { assert.equal(file, board.items[0].path); handedOff = true; return 'None'; } };
    win.focus();
    await new Promise(resolve => setTimeout(resolve, 100));
    const edgeStart = await win.webContents.executeJavaScript(`(() => { const rect = document.querySelector('.item').getBoundingClientRect(); return { x: Math.round(rect.left + 20), y: Math.round(rect.top + 20), width: innerWidth }; })()`);
    await win.webContents.executeJavaScript(`window.inputDebug = []; for (const type of ['pointerdown','pointermove','pointerup','lostpointercapture']) document.addEventListener(type, e => window.inputDebug.push({ type, target:e.target.id || e.target.className, button:e.button, buttons:e.buttons }), true)`);
    win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, x: edgeStart.x, y: edgeStart.y });
    await win.webContents.executeJavaScript(`window.canceledDragNode = document.querySelector('.item')`);
    win.webContents.sendInputEvent({ type: 'mouseMove', button: 'left', modifiers: ['leftbuttondown'], x: edgeStart.x + 20, y: edgeStart.y });
    for (let attempt = 0; attempt < 50 && !handedOff; attempt++) await new Promise(resolve => setTimeout(resolve, 20));
    win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, x: edgeStart.x + 20, y: edgeStart.y });
    assert.equal(handedOff, true, JSON.stringify(await win.webContents.executeJavaScript(`({ events:window.inputDebug, focused:document.hasFocus(), menuHidden:document.getElementById('item-menu').hidden, hit:document.elementFromPoint(${edgeStart.x},${edgeStart.y})?.outerHTML.slice(0,400) })`)));
    service.nativeDrag = nativeDrag;
    assert.equal(board.items.length, 3); assert.equal(fs.existsSync(board.items[0].path), true);
    assert.equal(await win.webContents.executeJavaScript(`window.canceledDragNode === document.querySelector('.item')`), true);
    await win.webContents.executeJavaScript(`window.electronAPI.invoke('organizer-update', { locked: false })`);
    assert.equal(win.isResizable(), false);
    assert.equal(win.isMovable(), true);
    await win.webContents.executeJavaScript(`window.electronAPI.invoke('organizer-resize', { width: 480, height: 350 })`);
    assert.equal(win.getBounds().width, 480);
    await win.webContents.executeJavaScript(`window.electronAPI.invoke('organizer-hide')`);
    assert.equal(win.isVisible(), false);
    service.show(board); assert.equal(win.isVisible(), true);
    await win.webContents.executeJavaScript(`window.electronAPI.invoke('organizer-remove', ${JSON.stringify(result.id)})`);
    assert.equal(fs.existsSync(target), true);
    assert.equal(new DesktopOrganizer({}, dir).boards[0].items.length, 2);
    // Verify previews contain the actual PNG/JPEG pixels and render at 48px.
    const { PNG } = require('pngjs');
    const fixture = new PNG({ width: 160, height: 80 });
    for (let y = 0; y < 80; y++) for (let x = 0; x < 160; x++) {
      const offset = (y * 160 + x) * 4;
      fixture.data[offset] = x < 80 ? 240 : 20;
      fixture.data[offset + 1] = 30;
      fixture.data[offset + 2] = x < 80 ? 20 : 240;
      fixture.data[offset + 3] = 255;
    }
    const png = path.join(dir, '照片.png'), jpg = path.join(dir, '照片.jpg');
    fs.writeFileSync(png, PNG.sync.write(fixture));
    fs.writeFileSync(jpg, electron.nativeImage.createFromPath(png).toJPEG(95));
    const addedImages = await win.webContents.executeJavaScript(`window.electronAPI.invoke('organizer-add', ${JSON.stringify([png, jpg])})`);
    for (const item of addedImages.board.items.slice(-2)) {
      const preview = PNG.sync.read(electron.nativeImage.createFromDataURL(await service.getIcon(item)).toPNG());
      const left = (Math.floor(preview.height / 2) * preview.width + Math.floor(preview.width / 4)) * 4;
      const right = (Math.floor(preview.height / 2) * preview.width + Math.floor(preview.width * 3 / 4)) * 4;
      assert.ok(preview.data[left] > 200 && preview.data[left + 2] < 60, 'red source pixels must appear in the preview');
      assert.ok(preview.data[right] < 60 && preview.data[right + 2] > 200, 'blue source pixels must appear in the preview');
    }
    const reloaded = new Promise(resolve => win.webContents.once('did-finish-load', resolve)); win.reload(); await reloaded;
    const previews = await win.webContents.executeJavaScript(`(async () => {
      for (let i = 0; i < 100; i++) {
        const images = [...document.querySelectorAll('.image-file img')];
        if (images.length === 2 && images.every(img => img.complete && img.naturalWidth > 0)) return images.map(img => ({ width: img.getBoundingClientRect().width, height: img.getBoundingClientRect().height, draggable: img.draggable }));
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      throw new Error('Image previews did not render');
    })()`);
    assert.deepEqual(previews, [{ width: 48, height: 48, draggable: false }, { width: 48, height: 48, draggable: false }]);
    assert.deepEqual(errors, []);
    const screenshot = await win.webContents.capturePage();
    fs.writeFileSync(path.join(os.tmpdir(), 'desktop-organizer-preview.png'), screenshot.toPNG());
    assert.equal(await win.webContents.executeJavaScript(`window.electronAPI.invoke('organizer-delete')`), false);
    assert.equal(service.boards.length, 1);
    confirmDelete = true;
    // Confirm through the real main-process handler; destruction interrupts its renderer reply.
    win.webContents.executeJavaScript(`window.electronAPI.invoke('organizer-delete')`).catch(() => {});
    for (let attempt = 0; attempt < 50 && service.boards.length; attempt++) await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(service.boards.length, 0);
    assert.equal(fs.existsSync(target), true);
    assert.equal(fs.readFileSync(path.join(folder, '內容.txt'), 'utf8'), 'folder contents');
    assert.equal(fs.existsSync(shortcut), true);
    console.log('Desktop organizer Electron UI assertions passed.');
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally { service?.dispose(); app.exit(process.exitCode || 0); }
}).catch(error => { console.error(error); process.exitCode = 1; app.quit(); });
// Chromium may still hold its userData files during will-quit on Windows.
// A locked temporary test folder must never interrupt application shutdown.
app.on('will-quit', () => {
  try { fs.rmSync(dir, { recursive: true, force: true }); }
  catch (error) { if (!['EPERM', 'EBUSY', 'EACCES', 'ENOTEMPTY'].includes(error.code)) console.warn('測試暫存資料夾清理失敗。'); }
});
