const assert=require('node:assert/strict');
const fs=require('fs'),os=require('os'),path=require('path');
const {spawn}=require('child_process');
const electron=require('electron');const {app}=electron;
const {DesktopOrganizer}=require('../electron/desktop-organizer.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'organizer-context-'));
app.setPath('userData',root);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let service;
app.whenReady().then(async()=>{
  try {
    const file=path.join(root,'原生選單-'+path.basename(root)+'.txt');fs.writeFileSync(file,'native context contents');
    service=new DesktopOrganizer({...electron,organizerDesktopIcons:false,organizerDrag:{}},root);
    service.register();await service.contextMenu.prepare();service.create();
    const board=service.boards[0],win=service.windows.get(board.id),layer=service.layers.get(board.id);
    win.setBounds({x:120,y:160,width:420,height:320});
    if(win.webContents.isLoading())await new Promise(resolve=>win.webContents.once('did-finish-load',resolve));
    await win.webContents.executeJavaScript(`window.electronAPI.invoke('organizer-add',[${JSON.stringify(file)}])`);
    const loaded=new Promise(resolve=>win.webContents.once('did-finish-load',resolve));win.reload();await loaded;
    for(const action of ['cancel','properties','rename','remove']) {
      const item=board.items[0];let output='';
      const drive=new Promise((resolve,reject)=>{
        const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'test-organizer-context-driver.ps1'),'-MenuPid',String(service.contextMenu.child.pid),'-OwnerHandle',win.getNativeWindowHandle().readBigUInt64LE().toString(),'-HostHandle',service.contextMenu.hostHandle],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,METECH_CONTEXT_ACTION:action,METECH_CONTEXT_REMOVE_LABEL:'從整理視窗移除',METECH_CONTEXT_FILE_NAME:path.parse(item.path).name}});
        child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);
        child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(output)));
      });
      const pending=win.webContents.executeJavaScript(action==='rename'
        ? `document.querySelector('.item').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:110,clientY:120}))`
        : `window.electronAPI.invoke('organizer-context-menu',${JSON.stringify(item.id)},{x:110,y:120})`);
      await drive;const result=await pending;
      if(action==='rename')for(let i=0;i<100 && !(await win.webContents.executeJavaScript(`Boolean(document.querySelector('.rename-input'))`));i++)await delay(20);
      assert.equal(layer.modalDepth,0);assert.ok(layer.helper);assert.equal(win.isAlwaysOnTop(),false);
      assert.ok(output.includes('複製路徑'),'path copy remains available');
      assert.ok(output.includes('內容') || output.includes('Properties'),'Shell provides the actual properties command');
      if(action==='cancel')assert.equal(result.action,'cancel');
      if(action==='properties')assert.equal(result.action,'shell');
      if(action==='rename'){
        assert.equal(await win.webContents.executeJavaScript(`Boolean(document.querySelector('.rename-input'))`),true);
        await win.webContents.executeJavaScript(`(()=>{const input=document.querySelector('.rename-input');input.value='重新命名.txt';input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));})()`);
        for(let i=0;i<100 && path.basename(board.items[0].path)!=='重新命名.txt';i++)await delay(20);
        assert.equal(path.basename(board.items[0].path),'重新命名.txt');
        assert.equal(fs.readFileSync(board.items[0].path,'utf8'),'native context contents');
      }
      if(action==='remove'){assert.equal(result.action,'remove');assert.equal(board.items.length,0);assert.ok(fs.existsSync(item.path));}
    }
    const folder=path.join(root,'資料夾'),shortcut=path.join(root,'捷徑.lnk');fs.mkdirSync(folder);
    assert.equal(electron.shell.writeShortcutLink(shortcut,{target:process.execPath}),true);
    await win.webContents.executeJavaScript(`window.electronAPI.invoke('organizer-add',${JSON.stringify([folder,shortcut])})`);
    for(const item of board.items) {
      const drive=new Promise((resolve,reject)=>{
        const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'test-organizer-context-driver.ps1'),'-MenuPid',String(service.contextMenu.child.pid),'-OwnerHandle',win.getNativeWindowHandle().readBigUInt64LE().toString(),'-HostHandle',service.contextMenu.hostHandle],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,METECH_CONTEXT_ACTION:'cancel'}});
        let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);
        child.on('error',reject);child.on('exit',code=>code===0?resolve(output):reject(new Error(output)));
      });
      const pending=win.webContents.executeJavaScript(`window.electronAPI.invoke('organizer-context-menu',${JSON.stringify(item.id)},{x:110,y:120})`);
      const output=await drive;assert.equal((await pending).action,'cancel');
      assert.ok(output.includes('內容') || output.includes('Properties'));
      assert.ok(fs.existsSync(item.path));
    }
    console.log('Actual Windows Shell popups for files, folders and shortcuts passed: native Properties, right-click Rename with persisted inventory, custom removal retaining files, and bottom-layer restoration.');
  }catch(error){console.error(error);process.exitCode=1;}
  finally{service?.dispose();app.exit(process.exitCode||0);}
});
setTimeout(()=>{console.error('Shell context integration timed out');service?.dispose();app.exit(1);},55000).unref();
