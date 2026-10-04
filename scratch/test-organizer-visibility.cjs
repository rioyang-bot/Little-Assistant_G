const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const electron = require('electron');
const { app } = electron;
const { DesktopOrganizer } = require('../electron/desktop-organizer.cjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'organizer-visibility-'));
app.setPath('userData', dir);
let service;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
app.whenReady().then(async () => {
  try {
    service = new DesktopOrganizer({ ...electron, organizerDesktopIcons:false, organizerDrag:{} }, dir);
    service.register(); service.create();
    const board = service.boards[0], win = service.windows.get(board.id);
    await new Promise(resolve => win.webContents.once('did-finish-load', resolve));
    await win.webContents.executeJavaScript(`window.electronAPI.invoke('organizer-update', { title:'設備文件',color:'#00ff00',opacity:100 })`);
    const reloaded=new Promise(resolve=>win.webContents.once('did-finish-load',resolve)); win.reload(); await reloaded;
    assert.equal(win.getTitle(), '設備文件');
    assert.equal(win.webContents.getBackgroundThrottling(),false);
    win.hide(); assert.equal(win.isVisible(),false);
    service.show(board); assert.equal(win.isVisible(),true);
    win.minimize();
    for(let i=0;i<50 && !win.isMinimized();i++) await delay(20);
    assert.equal(win.isMinimized(),true);
    service.show(board);
    for(let i=0;i<50 && win.isMinimized();i++) await delay(20);
    assert.equal(win.isMinimized(),false); assert.equal(win.isVisible(),true);
    win.setBounds({ x:50000,y:50000,width:360,height:300 });
    service.show(board);
    const bounds=win.getBounds(), fitted=service.fitBounds(bounds);
    for(const key of ['x','y','width','height']) assert.ok(Math.abs(bounds[key]-fitted[key])<=1,'restored bounds must fit within DPI rounding tolerance');
    assert.equal(win.isAlwaysOnTop(),false,'restoration retains the desktop bottom layer');
    await delay(250);
    const captured = await win.webContents.capturePage();
    const { PNG } = require('pngjs'); const image = PNG.sync.read(captured.toPNG());
    let greenPixels=0;
    for(let i=0;i<image.data.length;i+=4) if(image.data[i+1]>180 && image.data[i]<60 && image.data[i+2]<60) greenPixels++;
    assert.ok(greenPixels>image.width*image.height/2,'restored organizer must render its background instead of remaining blank');
    console.log('Organizer visibility: hidden/minimized restore, off-screen recovery, title, background rendering and bottom layer passed.');
  } catch(error) { console.error(error); process.exitCode=1; }
  finally { service?.dispose(); app.exit(process.exitCode||0); }
});
