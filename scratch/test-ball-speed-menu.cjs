const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const { locales } = require('../electron/locales.cjs');
const layout = require('../electron/layout-utils.cjs');
const { normalizeWindowLayerMode } = require('../electron/window-layer-controller.cjs');
const { formatDisplayVersion } = require('../electron/version-utils.cjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'assistant-settings-ui-'));
app.setPath('userData', root);
const appRoot = process.env.ASSISTANT_TEST_APP_ROOT || path.join(__dirname, '..');
const source = fs.readFileSync(path.join(appRoot, 'electron/main.cjs'), 'utf8');
const section = (start, end) => {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, 'Production section exists: ' + start);
  return source.slice(from, to);
};
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(check, label) {
  for (let attempt=0;attempt<100;attempt++) { if (await check()) return; await delay(50); }
  throw new Error('Timed out: ' + label);
}
let main, settings;
app.whenReady().then(async () => {
  main = new BrowserWindow({ show:false, webPreferences:{preload:path.join(appRoot,'electron/preload.cjs'),backgroundThrottling:false} });
  settings = new BrowserWindow({ width:1040,height:1000,show:false,webPreferences:{preload:path.join(appRoot,'electron/preload.cjs'),backgroundThrottling:false} });
  const state = vm.createContext({ fs,path,console,process,__dirname:path.join(appRoot,'electron'),Menu,ipcMain,app,...layout,normalizeWindowLayerMode,formatDisplayVersion,
    screen:{getPrimaryDisplay:()=>({id:1,workArea:{x:0,y:0,width:1200,height:900}}),getAllDisplays:()=>[{id:1,workArea:{x:0,y:0,width:1200,height:900}},{id:2,workArea:{x:1200,y:0,width:1200,height:900}}],getDisplayNearestPoint:()=>({id:1,workArea:{x:0,y:0,width:1200,height:900}})},
    normalizeBrowserAssignments:v=>v||{},normalizeLaptopShortcut:v=>v,readBroker:()=>null,
    isFocusModeActive:()=>false,positionSettingsWindowOnAssistantDisplay() {},
    getLocale:()=>locales[vm.runInContext('currentLanguage',state)],
    main,settings,trayFixture:{setContextMenu() {}},controller:{setMode(mode){this.mode=mode;}},
    setTimeout,clearTimeout
  });
  for (const [start,end] of [
    ['let mainWindow = null;','function getShortcutLogoDirectory('],
    ['function getPreferencesPath(','// Disable hardware acceleration'],
    ['function setBubbleFontSize(','function resizeMainWindowForCurrentSizes('],
    ['function resizeMainWindowForCurrentSizes(','// ==========================================================================' ],
    ['function getCurrentAssistantDisplay(','function setBubbleEnabled('],
    ['function setWindowLayerMode(','function isFocusModeActive('],
    ['function updateTrayMenu(','function createTray('],
    ["  ipcMain.on('ball-speed-changed'","  ipcMain.on('show-context-menu'"]
  ]) vm.runInContext(section(start,end),state);
  vm.runInContext('mainWindow=main;settingsWindow=settings;tray=trayFixture;windowLayerController=controller;',state);
  state.registerAssistantSettingsIpc();
  for (const [channel,value] of Object.entries({
    'get-language':'zh-TW','get-bubble-font-size':'std','get-sticky-notes-size':'std','sticky-notes-list':{active:[]},
    'laptop-get-shortcuts':{shortcuts:[],emailAccounts:[],calendars:[]},'email-get-config':{language:'zh-TW',accounts:[],rules:{}},
    'calendar-get-config':{calendars:[],rules:{}},'trivia-get-config':{enabled:false},'knowledge-cards-get-config':{enabled:false,cards:[],intervalMinutes:20},
    'alarm-get-config':{soundType:'preset',customPaths:[]},'get-app-version':{displayVersion:'Ver.1.7.0'},'get-panel-opacity':{},'get-focus-mode':{active:false},'get-update-settings':{enabled:false},
    'laptop-get-shortcut-settings':{shortcuts:[],fixedShortcuts:[],browserAssignments:{},installedBrowsers:[],maxShortcuts:20,maxMenuActions:20,fixedActionCount:0}
  })) ipcMain.handle(channel,()=>value);
  ipcMain.handle('set-language',(_event,lang)=>{
    state.nextLanguage=lang;vm.runInContext('currentLanguage=nextLanguage;',state);state.updateTrayMenu();
    settings.webContents.send('language-changed',lang); return {language:lang};
  });
  state.updateTrayMenu();
  const removed = ['alwaysOnBottom','alwaysOnTop','bottomUntilNotification','windowMenu','assistantSize','stickyNotesSize','bubbleFontSize','globeSpeed','languageMenu','exploreTrivia'];
  for (const key of removed) assert.ok(!vm.runInContext('trayContextMenu',state).items.some(item=>item.label===locales['zh-TW'].tray[key]),'Removed old menu entry: '+key);
  assert.ok(vm.runInContext('trayContextMenu',state).items.some(item=>item.label===locales['zh-TW'].tray.toggleQuotes));
  assert.equal(vm.runInContext('trayContextMenu',state).items[0].label, `${locales['zh-TW'].tray.title}  ${formatDisplayVersion(app.getVersion())}`, 'menu title shows the version');
  assert.match(vm.runInContext('trayContextMenu',state).items[0].label, /^METech小助手  Ver\.\d+\.\d+\.\d+$/);
  const errors=[];
  settings.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message);});
  await settings.loadFile(path.join(appRoot,'dist/email-settings.html'));
  await waitFor(()=>settings.webContents.executeJavaScript("document.getElementById('assistant-size').value==='std' && !document.getElementById('assistant-size').disabled"),'settings initialized');
  await settings.webContents.executeJavaScript("document.getElementById('tab-btn-assistant').click()");
  assert.equal(await settings.webContents.executeJavaScript("document.getElementById('panel-assistant').classList.contains('active')"),true);
  const change = async (id,value) => {
    await settings.webContents.executeJavaScript('(()=>{const control=document.getElementById('+JSON.stringify(id)+');if(control.type===\'checkbox\')control.checked='+JSON.stringify(value)+';else control.value='+JSON.stringify(String(value))+';control.dispatchEvent(new Event(\'change\',{bubbles:true}));})()');
    await settings.webContents.executeJavaScript('assistantSettingsQueue');
  };
  await settings.webContents.executeJavaScript("document.querySelector('input[name=assistant-layer][value=bottom-notify]').click()");
  await settings.webContents.executeJavaScript('assistantSettingsQueue');
  for(const [id,value] of [['assistant-size','mini'],['assistant-sticky-size','lg'],['assistant-font-size','xl'],['assistant-move-mode',true],['assistant-display-target','external']])await change(id,value);
  assert.equal(state.getAssistantSettings().windowLayerMode,'bottom-notify');assert.equal(state.controller.mode,'bottom-notify');
  for(const speed of [0.5,1,1.2,2.5,5]){await change('assistant-ball-speed',speed);assert.equal(state.getAssistantSettings().ballSpeed,speed);}
  const current=JSON.stringify(state.getAssistantSettings());
  const invalid = await settings.webContents.executeJavaScript("window.electronAPI.invoke('set-assistant-settings',{sizeKey:'std',ballSpeed:99}).then(()=>false,()=>true)");
  assert.equal(invalid,true);assert.equal(JSON.stringify(state.getAssistantSettings()),current,'Invalid patches make no partial changes');
  await settings.webContents.executeJavaScript("document.getElementById('assistant-reset-position').click()");await settings.webContents.executeJavaScript('assistantSettingsQueue');
  assert.ok(main.getBounds().x>=1200,'Reset uses the selected external monitor');
  assert.equal(await settings.webContents.executeJavaScript("document.getElementById('assistant-settings-status').textContent"),'');
  state.setBallSpeed(1.2,true);
  let initialized=false;ipcMain.on('set-notification-active',()=>{initialized=true;});
  await main.loadFile(path.join(appRoot,'dist/index.html'));await waitFor(()=>initialized,'globe initialized');state.setBallSpeed(1.2,true);
  await main.webContents.executeJavaScript("document.getElementById('ball-canvas').dispatchEvent(new WheelEvent('wheel',{deltaY:-100,cancelable:true}))");
  await waitFor(()=>settings.webContents.executeJavaScript("document.getElementById('assistant-ball-speed').value==='1.4'"),'wheel speed syncs to settings');
  assert.equal(state.getAssistantSettings().ballSpeed,1.4);
  assert.equal(await settings.webContents.executeJavaScript("document.querySelectorAll('#assistant-ball-speed [data-custom-speed]').length"),1);
  await main.webContents.executeJavaScript("document.getElementById('ball-canvas').dispatchEvent(new WheelEvent('wheel',{deltaY:100,cancelable:true}))");
  await waitFor(()=>settings.webContents.executeJavaScript("document.getElementById('assistant-ball-speed').value==='1.2'"),'preset restored');
  assert.equal(await settings.webContents.executeJavaScript("document.querySelectorAll('#assistant-ball-speed [data-custom-speed]').length"),0);
  for(const input of [NaN,Infinity,-1,6,'1.2'])ipcMain.emit('ball-speed-changed',{sender:main.webContents},input);
  ipcMain.emit('ball-speed-changed',{sender:settings.webContents},5);assert.equal(state.getAssistantSettings().ballSpeed,1.2);
  assert.equal(await main.webContents.executeJavaScript("window.electronAPI.invoke('set-assistant-settings',{ballSpeed:5}).then(()=>false,()=>true)"),true,'Globe renderer cannot change settings through the settings-only IPC');
  const expected=JSON.stringify(state.getAssistantSettings());
  vm.runInContext("currentSizeKey='std';currentStickyNotesSize='std';currentBubbleFontSize='std';currentBallSpeed=5;isMoveMode=false;assistantDisplayTarget='primary';windowLayerMode='top';",state);
  state.loadPetPreferences();assert.equal(JSON.stringify(state.getAssistantSettings()),expected,'Persisted preferences restore every moved setting');
  await settings.webContents.executeJavaScript("document.getElementById('btn-lang-en').click()");
  await waitFor(()=>settings.webContents.executeJavaScript("document.getElementById('tab-label-assistant').textContent==='Assistant settings' && document.getElementById('btn-lang-en').classList.contains('active')"),'English labels');
  await waitFor(()=>vm.runInContext('currentLanguage',state)==='en','English preference saved');
  for(const [width,height] of [[680,760],[1040,1000]]){
    settings.setSize(width,height);await delay(100);
    assert.equal(await settings.webContents.executeJavaScript('document.documentElement.scrollWidth<=window.innerWidth'),true,'No horizontal overflow');
  }
  await settings.webContents.executeJavaScript("document.getElementById('btn-lang-zh').click()");
  await waitFor(()=>settings.webContents.executeJavaScript("document.getElementById('tab-label-assistant').textContent==='小助手設定' && document.getElementById('btn-lang-zh').classList.contains('active')"),'Chinese labels');
  await waitFor(()=>vm.runInContext('currentLanguage',state)==='zh-TW','Chinese preference saved');
  settings.setSize(1040,1200);await delay(100);
  fs.writeFileSync(path.join(__dirname,'assistant-settings-verified.png'),(await settings.webContents.capturePage()).toPNG());
  assert.deepEqual(errors,[]);
  const menuStates=[];state.menuController={setMenuActive:active=>menuStates.push(active)};
  vm.runInContext('windowLayerController=menuController;',state);
  vm.runInContext(section("  ipcMain.on('show-context-menu'",'  const getLaptopShortcuts ='),state);
  state.menuFixture={popup(options){state.popupOptions=options;}};vm.runInContext('trayContextMenu=menuFixture;',state);
  ipcMain.emit('show-context-menu',{sender:settings.webContents});assert.deepEqual(menuStates,[]);
  ipcMain.emit('show-context-menu',{sender:main.webContents});state.popupOptions.callback();assert.deepEqual(menuStates,[true,false]);
  console.log('Assistant settings UI: moved controls apply/persist/restore; invalid/unauthorized IPC rejected; menu entries removed; wheel/custom speed sync, monitor reset, both languages and responsive layouts passed.');
  app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
app.on('will-quit',()=>{try{fs.rmSync(root,{recursive:true,force:true});}catch{}});
