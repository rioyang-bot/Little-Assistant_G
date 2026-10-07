// Free-placement layout UI: no arrangement setting, long names stay within
// their row, resizing and reloads keep positions, keyboard and group moves,
// drop preview, minimum width and selection behaviour.
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const electron = require('electron');
const { app } = electron;
const { DesktopOrganizer } = require('../electron/desktop-organizer.cjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'organizer-arrangement-ui-'));
app.setPath('userData', dir);
let service;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
app.whenReady().then(async () => {
  try {
    const files = Array.from({ length: 8 }, (_, index) => path.join(dir, (index === 0 ? '很長的文件名稱'.repeat(8) : `文件${index}`) + '.txt'));
    files.forEach(file => fs.writeFileSync(file, 'original contents'));
    service = new DesktopOrganizer({ ...electron, organizerDesktopIcons: false, organizerDrag: { dispose() {} }, organizerContextMenu: { async show() { return {action:'remove'}; } } }, dir);
    service.register(); service.create();
    const board = service.boards[0], win = service.windows.get(board.id);
    // Native layering has separate regression coverage. Keep this rendering
    // fixture visible while resizing and capturing its compositor surface.
    service.layers.get(board.id).dispose();
    win.setAlwaysOnTop(true,'screen-saver');
    await new Promise(resolve => win.webContents.once('did-finish-load', resolve));
    const errors = [];
    win.webContents.on('console-message', (_event, level, message) => { if (level >= 3) errors.push(message); });
    await win.webContents.executeJavaScript(`window.electronAPI.invoke('organizer-add', ${JSON.stringify(files)})`);
    await new Promise(resolve => { win.webContents.once('did-finish-load', resolve); win.reload(); });
    const inspect = () => win.webContents.executeJavaScript(`({
      positions: [...document.querySelectorAll('.item')].map(node => ({ x:node.offsetLeft,y:node.offsetTop,width:node.offsetWidth,height:node.offsetHeight })),
      width: document.getElementById('items').clientWidth,
      height: document.getElementById('items').offsetHeight - 16,
      status: document.getElementById('status').textContent
    })`);
    async function settled() {
      for (let i = 0; i < 100; i++) {
        const state = await inspect();
        if (state.positions.length === board.items.length && state.positions.every((position, index) => position.x === board.items[index].position.x && position.y === board.items[index].position.y)) {
          await delay(250);
          const again = await inspect();
          if (JSON.stringify(again) === JSON.stringify(state)) return state;
        }
        await delay(20);
      }
      throw new Error('Layout did not settle');
    }
    async function openSettings() {
      await win.webContents.executeJavaScript(`window.electronAPI.invoke('organizer-settings-open')`);
      const settings=service.settingsWindows.get(board.id).window;
      for(let i=0;i<100 && !(await settings.webContents.executeJavaScript(`document.getElementById('name').value===${JSON.stringify(board.title)}`));i++)await delay(20);
      return settings;
    }
    async function closeSettings(settings) {
      settings.close();
      for(let i=0;i<100 && service.settingsWindows.has(board.id);i++)await delay(20);
      assert.equal(service.settingsWindows.has(board.id),false);
      await delay(50);
    }
    const optionsWindow=await openSettings();
    assert.equal(await optionsWindow.webContents.executeJavaScript(`document.getElementById('arrangement')`), null, 'settings no longer offer an arrangement');
    await closeSettings(optionsWindow);
    assert.equal('arrangement' in board, false);
    const initial = await settled();
    for (const item of initial.positions) assert.ok(item.height <= 104, 'long filenames are clamped and never cover the next row');
    // Resizing keeps positions and existing nodes; idle layout is stable.
    await win.webContents.executeJavaScript(`window.layoutFirstNode = document.querySelector('.item')`);
    await win.webContents.executeJavaScript(`window.electronAPI.invoke('organizer-resize', { width:360,height:450 })`);
    const resized = await settled();
    assert.deepEqual(resized.positions, initial.positions);
    assert.equal(await win.webContents.executeJavaScript(`window.layoutFirstNode === document.querySelector('.item')`), true);
    const stable = await win.webContents.executeJavaScript(`new Promise(resolve => {
      let mutations=0,resizeErrors=0;
      const observer=new MutationObserver(records => mutations+=records.length);
      observer.observe(document.getElementById('items'), { subtree:true,attributes:true,childList:true });
      addEventListener('error', event => { if(event.message.includes('ResizeObserver')) resizeErrors++; });
      setTimeout(() => { observer.disconnect(); resolve({mutations,resizeErrors}); }, 1000);
    })`);
    assert.deepEqual(stable, { mutations:0,resizeErrors:0 });
    await new Promise(resolve => { win.webContents.once('did-finish-load', resolve); win.reload(); });
    assert.deepEqual((await settled()).positions, resized.positions);
    // Removal keeps the remaining positions.
    const remaining = board.items.slice(1).map(item => ({ ...item.position }));
    const removedId = board.items[0].id;
    await win.webContents.executeJavaScript(`document.querySelector('.item').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))`);
    for (let i = 0; i < 100 && board.items.some(item => item.id === removedId); i++) await delay(20);
    await settled();
    assert.equal(board.items.length, 7); assert.deepEqual(board.items.map(item => item.position), remaining);
    // Manual and keyboard placement keep neighbours where they are.
    await win.webContents.executeJavaScript(`window.electronAPI.invoke('organizer-position', { id:${JSON.stringify(board.items[0].id)},x:137,y:211 })`);
    assert.deepEqual(board.items[0].position, { x:137,y:211 });
    const neighbors=board.items.slice(1).map(item=>({...item.position}));
    await new Promise(resolve=>{win.webContents.once('did-finish-load',resolve);win.reload();});
    await settled();
    await win.webContents.executeJavaScript(`document.querySelector('.item').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}))`);
    for(let i=0;i<100 && board.items[0].position.y!==219;i++)await delay(20);
    await settled();
    assert.deepEqual(board.items[0].position,{x:137,y:219},'arrow keys move by 8 px');
    assert.deepEqual(board.items.slice(1).map(item=>item.position),neighbors,'keyboard placement retains neighbouring icons');
    const placed=board.items.map(item=>({...item.position}));
    await win.webContents.executeJavaScript(`window.electronAPI.invoke('organizer-resize', { width:1,height:450 })`);
    await delay(300);
    assert.equal(win.getBounds().width,220,'custom resizing permits the minimum width');
    assert.equal(win.getMinimumSize()[0],220,'native window minimum matches custom resizing');
    assert.deepEqual(board.items.map(item=>item.position),placed,'positions survive a narrower window');
    const headerFits = await win.webContents.executeJavaScript(`(() => {
      const elements = [...document.getElementById('header').children];
      const boxes = elements.map(element => element.getBoundingClientRect());
      return !document.getElementById('settings') && !document.getElementById('arrangement')
        && boxes.every((box,index) => box.left >= 0 && box.right <= innerWidth && (!index || box.left >= boxes[index-1].right));
    })()`);
    assert.equal(headerFits,true,'header controls fit the minimum width');
    // Drop preview marks the drop position. Event coordinates are whole
    // pixels; rounding keeps a fractional title bar height from truncating.
    const sourceItem=board.items.at(-1),targetItem=board.items[2];
    win.webContents.send('organizer-drag-state',{boardId:board.id,path:sourceItem.path,token:'fixture-preview'});
    await win.webContents.executeJavaScript(`(() => {
      const area=document.getElementById('items'); area.scrollLeft=0;area.scrollTop=0;
      const box=area.getBoundingClientRect();
      document.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:new DataTransfer(),clientX:Math.round(box.left+${targetItem.position.x}+41),clientY:Math.round(box.top+${targetItem.position.y}+16)}));
    })()`);
    const preview=await win.webContents.executeJavaScript(`(() => {
      const node=document.getElementById('drop-preview'),style=getComputedStyle(node);
      return {x:node.offsetLeft,y:node.offsetTop,text:node.textContent,visible:style.display!=='none',border:style.borderStyle,pointer:style.pointerEvents};
    })()`);
    assert.deepEqual(preview,{...targetItem.position,text:'放置位置',visible:true,border:'dashed',pointer:'none'});
    await win.webContents.executeJavaScript(`document.dispatchEvent(new DragEvent('dragleave',{bubbles:true}))`);
    assert.equal(await win.webContents.executeJavaScript(`document.getElementById('drop-preview')===null`),true);
    win.webContents.send('organizer-drag-state',null);
    // The settings popup fits a narrow window.
    const settings=await openSettings();
    settings.setSize(320,480);await delay(100);
    assert.equal(win.getBounds().width,220,'settings popup does not expand the organizer');
    const customHeaderFits=await settings.webContents.executeJavaScript(`(async () => {
      const mode=document.getElementById('header-color-mode'),picker=document.getElementById('header-color');
      mode.value='custom';picker.value='#234567';mode.dispatchEvent(new Event('change',{bubbles:true}));
      const textPicker=document.getElementById('header-text-color');
      textPicker.value='#80eeaa';textPicker.dispatchEvent(new Event('input',{bubbles:true}));
      await new Promise(resolve=>setTimeout(resolve,100));
      const form=document.getElementById('settings'),box=picker.getBoundingClientRect(),textBox=textPicker.getBoundingClientRect(),name=document.getElementById('name').getBoundingClientRect();
      return !picker.hidden && form.scrollWidth===form.clientWidth && box.right<=innerWidth && textBox.right<=innerWidth && name.right<=innerWidth;
    })()`);
    assert.equal(customHeaderFits,true,'all settings controls fit a narrow popup');
    await delay(100);
    assert.equal(await win.webContents.executeJavaScript(`getComputedStyle(document.getElementById('title')).color`),'rgb(128, 238, 170)');
    assert.equal(await win.webContents.executeJavaScript(`getComputedStyle(document.getElementById('header')).backgroundColor`),'rgb(35, 69, 103)');
    await closeSettings(settings);
    // New items fill two columns at the minimum width.
    for (const item of [...board.items]) await win.webContents.executeJavaScript(`window.electronAPI.invoke('organizer-remove',${JSON.stringify(item.id)})`);
    await win.webContents.executeJavaScript(`window.electronAPI.invoke('organizer-add',${JSON.stringify(files.slice(0,3))})`);
    await new Promise(resolve=>{win.webContents.once('did-finish-load',resolve);win.reload();});
    await settled();
    assert.deepEqual(board.items.map(item=>item.position),[{x:8,y:12},{x:96,y:12},{x:8,y:116}],'new items use two columns at minimum width');
    assert.equal(await win.webContents.executeJavaScript(`document.getElementById('items').scrollWidth===document.getElementById('items').clientWidth`),true,'both columns fit without horizontal scrolling');
    assert.equal(new DesktopOrganizer({},dir).boards[0].bounds.width,220,'minimum width survives restart');
    async function clickItem(index,modifiers=[]) {
      const point=await win.webContents.executeJavaScript(`(()=>{const box=document.querySelectorAll('.item')[${index}].getBoundingClientRect();return {x:Math.round(box.left+41),y:Math.round(box.top+16)};})()`);
      win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point,modifiers});
      win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...point,modifiers});
      await delay(30);
    }
    const selectedCount=()=>win.webContents.executeJavaScript(`document.querySelectorAll('.item.selected[aria-pressed="true"]').length`);
    await clickItem(0);assert.equal(await selectedCount(),1);
    await clickItem(1,['control']);assert.equal(await selectedCount(),2,'Ctrl adds another item');
    await clickItem(2,['shift']);assert.equal(await selectedCount(),2,'Shift selects the visual range from the anchor');
    await clickItem(0);await clickItem(2,['shift']);assert.equal(await selectedCount(),3,'Shift range can select more than two items');
    await clickItem(1,['control']);assert.equal(await selectedCount(),2,'Ctrl toggles an existing selection');
    await win.webContents.executeJavaScript(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'a',ctrlKey:true,bubbles:true,cancelable:true}))`);
    assert.equal(await selectedCount(),3,'Ctrl+A selects every item');
    const beforeGroup=board.items.map(item=>({...item.position}));
    await win.webContents.executeJavaScript(`document.querySelector('.item').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}))`);
    await settled();assert.deepEqual(board.items.map(item=>item.position),beforeGroup.map(position=>({x:position.x,y:position.y+8})),'selected items move as one group');
    await win.webContents.executeJavaScript(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
    assert.equal(await selectedCount(),0,'Escape clears selection');
    for (const file of files) assert.equal(fs.readFileSync(file,'utf8'),'original contents');
    assert.deepEqual(errors, []);
    console.log('Organizer layout UI: free placement only, clamped names, stable resize and reload, keyboard and group moves, drop preview, minimum width and selection passed.');
  } catch(error) { console.error(error); process.exitCode=1; }
  finally { service?.dispose(); app.exit(process.exitCode||0); }
});
