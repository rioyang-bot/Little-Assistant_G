const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const electron = require('electron');
const { app, BrowserWindow } = electron;
const { DesktopOrganizer } = require('../electron/desktop-organizer.cjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(),'organizer-modal-'));
app.setPath('userData',root);
let service, other, driver;
const delay = ms => new Promise(resolve=>setTimeout(resolve,ms));
app.whenReady().then(async()=>{
  try {
    const title='Organizer background modal fixture '+path.basename(root);
    let opened=false;
    service=new DesktopOrganizer({ ...electron,organizerDesktopIcons:false,organizerDrag:{},dialog:{
      showOpenDialog(parent,options) {
        const layer=service.layers.get(service.boards[0].id);
        assert.equal(layer.modalDepth,2); assert.equal(layer.helper,null,'native lowering remains stopped for both settings and its file picker');
        opened=true;
        return electron.dialog.showOpenDialog(parent,{...options,title,defaultPath:root});
      }
    } },root);
    service.register(); service.create(); service.create();
    const board=service.boards[0], win=service.windows.get(board.id), layer=service.layers.get(board.id);
    win.setBounds({x:180,y:180,width:520,height:360});
    other=new BrowserWindow({show:false,width:260,height:200,x:160,y:160});
    await other.loadURL('data:text/html,<p>Owned modal overlap test</p>'); other.showInactive();
    if(win.webContents.isLoading())await new Promise(resolve=>win.webContents.once('did-finish-load',resolve));
    await win.webContents.executeJavaScript(`window.electronAPI.invoke('organizer-get')`);
    await delay(1800);
    await win.webContents.executeJavaScript(`window.electronAPI.invoke('organizer-settings-open')`);
    const settings=service.settingsWindows.get(board.id).window;
    assert.equal(layer.modalDepth,1);assert.equal(layer.helper,null);
    let changes=0, recording=false, diagnostics='', buffer='';
    win.hookWindowMessage(0x46,()=>{if(recording)changes++;});
    settings.hookWindowMessage(0x46,()=>{if(recording)changes++;});
    const completion=new Promise((resolve,reject)=>{
      driver=spawn('powershell.exe',['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'test-organizer-modal-driver.ps1'),'-TestOwnerPid',String(process.pid),'-TestOwnerHandle',settings.getNativeWindowHandle().readBigUInt64LE().toString()],{windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,METECH_MODAL_TEST_TITLE:title}});
      driver.stderr.on('data',chunk=>diagnostics+=chunk);
      driver.on('error',reject);
      driver.on('exit',code=>{if(code!==0)reject(new Error('Modal fixture driver failed: '+diagnostics));});
      driver.stdout.on('data',chunk=>{
        buffer+=chunk.toString(); let end;
        while((end=buffer.indexOf('\n'))>=0) {
          const line=buffer.slice(0,end).trim(); buffer=buffer.slice(end+1);
          let state; try{state=JSON.parse(line);}catch{continue;}
          if(state.ready)recording=true;
          if(state.complete){recording=false;win.unhookWindowMessage(0x46);settings.unhookWindowMessage(0x46);driver.stdin.end();resolve(state);}
        }
      });
    });
    const picker=settings.webContents.executeJavaScript(`window.electronAPI.invoke('organizer-background')`);
    const state=await completion;
    assert.equal(state.lost,0,'file picker must remain above its organizer throughout overlap and movement');
    assert.equal(changes,0,'organizer owner must not repeatedly reorder while its file picker is open');
    const result=await picker;
    assert.equal(opened,true); assert.equal(result.canceled,true,'cancelling must retain the current draft background');
    assert.equal(layer.modalDepth,1);assert.equal(layer.helper,null,'lowering stays paused until the settings popup closes');
    settings.close();
    for(let i=0;i<100 && service.settingsWindows.has(board.id);i++)await delay(20);
    assert.equal(layer.modalDepth,0); assert.ok(layer.helper,'bottom-layer control resumes after the picker closes');
    assert.equal(win.isAlwaysOnTop(),false);
    console.log('Real settings popup and nested Windows file picker: 18 overlap samples; zero owner reorders; cancellation retains background and closing settings restores bottom control.');
  } catch(error){console.error(error);process.exitCode=1;}
  finally{driver?.stdin.end();service?.dispose();if(other && !other.isDestroyed())other.destroy();app.exit(process.exitCode||0);}
});
setTimeout(()=>{console.error('Modal integration test timed out');driver?.stdin.end();service?.dispose();app.exit(1);},30000).unref();
