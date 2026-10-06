const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const electron = require('electron');
const { app } = electron;
const { DesktopOrganizer } = require('../electron/desktop-organizer.cjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'organizer-transfer-ui-'));
app.setPath('userData', root);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let service;
async function waitFor(predicate, message) {
  for (let attempt=0; attempt<100; attempt++) { if (await predicate()) return; await delay(50); }
  throw new Error(message);
}
app.whenReady().then(async () => {
  try {
    const file = path.join(root,'設備文件.txt'); fs.writeFileSync(file,'original transfer bytes');
    const batch = process.env.METECH_TRANSFER_BATCH==='1';
    const files=[file];
    if(batch) {
      const other=path.join(root,'other-parent');fs.mkdirSync(other);
      files.push(path.join(other,'second.txt'),path.join(root,'folder'));
      fs.writeFileSync(files[1],'second original');fs.mkdirSync(files[2]);fs.writeFileSync(path.join(files[2],'child.txt'),'folder original');
    }
    process.env.METECH_ORGANIZER_DRAG_DEBUG='1';
    service = new DesktopOrganizer({...electron, organizerDesktopIcons:false},root);
    service.register(); await service.nativeDrag.prepare();
    service.nativeDrag.child.stderr.on('data',chunk=>console.log('Native fixture:',chunk.toString().trim()));
    service.create(); service.create();
    const [a,b] = service.boards;
    const windows = [a,b].map(board => service.windows.get(board.id));
    for (const [index,win] of windows.entries()) {
      service.layers.get(service.boards[index].id).dispose();
      win.setAlwaysOnTop(true,'screen-saver');
      win.setBounds({x:130+index*510,y:180,width:420,height:300});
      if (win.webContents.isLoading()) await new Promise(resolve => win.webContents.once('did-finish-load',resolve));
    }
    await windows[0].webContents.executeJavaScript(`window.electronAPI.invoke('organizer-add', ${JSON.stringify(files)})`);
    for (const win of windows) {
      const loaded = new Promise(resolve => win.webContents.once('did-finish-load',resolve)); win.reload(); await loaded;
    }
    const itemIds=a.items.map(item=>item.id);
    for (const [from,to] of [[a,b],[b,a],[a,b]]) {
      const source=service.windows.get(from.id), target=service.windows.get(to.id);
      const loaded=new Promise(resolve=>target.webContents.once('did-finish-load',resolve)); target.reload(); await loaded;
      for (const win of [source,target]) await win.webContents.executeJavaScript(`window.transferEvents=[]; window.electronAPI.on('organizer-drag-state',(_event,state)=>window.transferEvents.push({state})); for(const type of ['dragenter','drop'])document.addEventListener(type,event=>window.transferEvents.push({type,files:[...event.dataTransfer.files].map(file=>({name:file.name,path:window.electronAPI.getDroppedFilePath(file)}))}));`);
      await waitFor(()=>source.webContents.executeJavaScript(`document.querySelectorAll('.item').length === ${files.length}`),'Source icon missing');
      if(batch) {
        await source.webContents.executeJavaScript(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'a',ctrlKey:true,bubbles:true,cancelable:true}))`);
        assert.equal(await source.webContents.executeJavaScript(`document.querySelectorAll('.item.selected').length`),files.length);
      }
      await delay(300);
      const point=await source.webContents.executeJavaScript(`(()=>{const r=document.querySelector('.item').getBoundingClientRect();return {x:r.left+41,y:r.top+23,width:innerWidth};})()`);
      await new Promise((resolve,reject)=>{
        const driver=spawn('powershell.exe',['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'test-organizer-transfer-driver.ps1'),'-TestPid',String(process.pid),'-SourceHandle',source.getNativeWindowHandle().readBigUInt64LE().toString(),'-TargetHandle',target.getNativeWindowHandle().readBigUInt64LE().toString(),'-SourceX',String(point.x),'-SourceY',String(point.y),'-SourceWidth',String(point.width),...(batch?['-SelectAll']:[])],{windowsHide:true,stdio:['ignore','pipe','pipe']});
        let output=''; driver.stdout.on('data',chunk=>output+=chunk); driver.stderr.on('data',chunk=>output+=chunk);
        driver.on('error',reject); driver.on('exit',code=>code===0?resolve():reject(new Error(output)));
      });
      await waitFor(()=>from.items.length===0 && to.items.length===files.length && !service.activeDrag,'Cross-board drop duplicated the item or did not finish');
      await waitFor(async()=>await source.webContents.executeJavaScript(`document.querySelectorAll('.item').length === 0`) && await target.webContents.executeJavaScript(`document.querySelectorAll('.item').length === ${files.length}`),'Both renderers must reflect the transfer');
      assert.deepEqual(to.items.map(item=>item.id).sort(),[...itemIds].sort());assert.deepEqual(to.items.map(item=>item.path).sort(),[...files].sort());
      assert.equal(fs.readFileSync(file,'utf8'),'original transfer bytes');
      if(batch) {
        assert.equal(fs.readFileSync(files[1],'utf8'),'second original');assert.equal(fs.readFileSync(path.join(files[2],'child.txt'),'utf8'),'folder original');
      }
    }
    const restored=new DesktopOrganizer({organizerDesktopIcons:false,organizerDrag:{}},root);
    assert.equal(restored.boards[0].items.length,0); assert.equal(restored.boards[1].items.length,files.length);
    console.log(`Actual Windows OLE mouse drags of ${files.length} item(s) A to B, B to A, and A to B passed: both renderers update, restart and path/id/bytes retained.`);
  } catch(error) {
    console.error(error);
    if(service) {
      console.error('Inventory',JSON.stringify(service.boards.map(board=>({title:board.title,count:board.items.length}))), 'active:',Boolean(service.activeDrag));
      for(const win of service.windows.values()) if(!win.isDestroyed()) console.error('Renderer',await win.webContents.executeJavaScript(`JSON.stringify({events:window.transferEvents,status:document.getElementById('status').textContent,items:document.querySelectorAll('.item').length})`));
    }
    process.exitCode=1;
  }
  finally { service?.dispose(); app.exit(process.exitCode||0); }
});
setTimeout(()=>{console.error('Cross-board integration timed out');service?.dispose();app.exit(1);},45000).unref();
