const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');
const { NsisUpdater } = require('electron-updater/out/NsisUpdater');
const appRoot = process.env.ASSISTANT_TEST_APP_ROOT || path.join(__dirname,'..');
const { UpdateService } = require(path.join(appRoot,'electron/update-service.cjs'));
const dir = fs.mkdtempSync(path.join(os.tmpdir(),'assistant-update-ui-'));
app.setPath('userData',dir);
const delay = ms => new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(check,label) {
  const deadline=Date.now()+10000;
  while(Date.now()<deadline) { if(await check())return; await delay(50); }
  throw new Error('Timed out: '+label);
}
let service,main,settings;
app.whenReady().then(async()=>{
  try {
    let quits=0,saves=0; const launches=[];
    const updater=new NsisUpdater(null,{version:'1.6.0',isPackaged:true,whenReady:()=>Promise.resolve(),quit:()=>{quits++;}});
    updater.logger=null;
    updater.downloadedUpdateHelper={file:path.join(dir,'fixture-installer.exe'),downloadedFileInfo:{isAdminRightsRequired:false}};
    updater.spawnLog=async(file,args)=>{launches.push({file,args});};
    service=new UpdateService({app:{isPackaged:true,getVersion:()=> '1.6.0'},autoUpdater:updater,getWindows:()=>[main,settings],getLanguage:()=> 'zh-TW',beforeInstall:()=>{saves++;return true;}});
    const values={
      'get-language':'zh-TW','get-bubble-font-size':'std','get-sticky-notes-size':'std','sticky-notes-list':{active:[]},
      'get-assistant-settings':{windowLayerMode:'bottom',moveMode:false,displayTarget:'primary',sizeKey:'std',stickyNotesSize:'std',bubbleFontSize:'std',ballSpeed:1.2},
      'laptop-get-shortcuts':{shortcuts:[],emailAccounts:[],calendars:[]},'get-focus-mode':{active:false},
      'email-get-config':{enabled:false,language:'zh-TW',accounts:[],rules:{}},'calendar-get-config':{enabled:false,calendars:[],rules:{}},
      'trivia-get-config':{enabled:false},'knowledge-cards-get-config':{enabled:false,cards:[],intervalMinutes:20},
      'alarm-get-config':{soundType:'preset',customPaths:[]},'get-app-version':{displayVersion:'Ver.1.7.0'},'get-panel-opacity':{},
      'laptop-get-shortcut-settings':{shortcuts:[],fixedShortcuts:[],browserAssignments:{},installedBrowsers:[],maxShortcuts:20,maxMenuActions:20,fixedActionCount:0}
    };
    for(const [channel,value] of Object.entries(values))ipcMain.handle(channel,()=>value);
    ipcMain.handle('get-update-settings',()=>({enabled:true,state:service.getStatus()}));
    ipcMain.handle('install-update',()=>service.install());
    ipcMain.handle('check-for-updates',()=>service.check());
    const createWindow=()=>new BrowserWindow({show:false,width:900,height:800,webPreferences:{preload:path.join(appRoot,'electron/preload.cjs'),nodeIntegration:false,contextIsolation:true,webSecurity:true,backgroundThrottling:false}});
    main=createWindow(); settings=createWindow();
    main.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_details,done)=>done({cancel:true}));
    await main.loadFile(path.join(appRoot,'dist/index.html'));
    await settings.loadFile(path.join(appRoot,'dist/email-settings.html'));
    await delay(300);
    updater.emit('update-downloaded',{version:'1.7.0'});
    await waitFor(()=>main.webContents.executeJavaScript("document.getElementById('speech-text').textContent.includes('5 秒後自動安裝')"),'assistant completion prompt');
    await waitFor(()=>settings.webContents.executeJavaScript("document.getElementById('update-status').textContent.includes('5 秒後自動安裝')"),'settings completion prompt');
    assert.equal(quits,0,'prompts must precede quitting');
    await settings.reload();
    await waitFor(()=>settings.webContents.executeJavaScript("document.getElementById('update-status').textContent.includes('下載完成')"),'completion status after reopening settings');
    settings.webContents.send('language-changed','en');
    await waitFor(()=>settings.webContents.executeJavaScript("document.getElementById('update-status').textContent.includes('Installation starts in 5 seconds') && document.getElementById('check-updates-now').textContent==='Restart and install'"),'downloaded status survives language change');
    await settings.webContents.executeJavaScript("document.getElementById('check-updates-now').click()");
    await waitFor(()=>quits===1,'real updater quit callback');
    assert.equal(saves,1);assert.equal(launches.length,1);
    assert.equal(launches[0].file,path.join(dir,'fixture-installer.exe'));
    assert.ok(launches[0].args.includes('/S'));assert.ok(launches[0].args.includes('--force-run'));
    console.log('Real assistant/settings UI prompts and reopened status passed; actual NsisUpdater launches silent installer with --force-run after saving, then quits once.');
  }catch(error){console.error(error);process.exitCode=1;}
  finally{service?.stop();for(const win of [main,settings])if(win&&!win.isDestroyed())win.destroy();app.exit(process.exitCode||0);}
});
