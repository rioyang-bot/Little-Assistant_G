const { app, ...electron } = require('electron');
const fs = require('fs');
const path = require('path');
const { DesktopOrganizer } = require('../electron/desktop-organizer.cjs');
const root = process.argv[2];
if (!root || !path.basename(root).startsWith('organizer-gesture-test-')) throw new Error('Missing fixture root');
app.setPath('userData', path.join(root, 'profile'));
let service, board, win;
let phase = 'loading';
const metadata = path.join(root, 'state.json');
function snapshot() {
  if (!win || win.isDestroyed()) return;
  const data = { phase, handle: win.getNativeWindowHandle().readBigUInt64LE().toString(), items: board.items, bounds: win.getBounds() };
  fs.writeFileSync(metadata + '.tmp', JSON.stringify(data)); fs.renameSync(metadata + '.tmp', metadata);
}
app.whenReady().then(async () => {
  service = new DesktopOrganizer({ app, ...electron }, path.join(root, 'profile'));
  service.register(); await service.nativeDrag.prepare();
  await service.iconVisibility?.prepare();
  await service.syncDesktopIcons();
  service.nativeDrag.child.stderr.on('data', chunk => fs.appendFileSync(path.join(root, 'native-debug.txt'), chunk));
  const drag = service.nativeDrag.drag.bind(service.nativeDrag);
  service.nativeDrag.drag = async file => {
    phase = 'dragging'; snapshot();
    try { const result = await drag(file); phase = `ended-${result}`; snapshot(); return result; }
    catch (error) { phase = `error-${error.message}`; snapshot(); throw error; }
  };
  service.create(); board = service.boards[0]; win = service.windows.get(board.id);
  // Native layering is verified separately. Keep this mouse-input fixture
  // above unrelated applications so injected clicks reach only its own window.
  service.layers.get(board.id).dispose();
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setBounds({ x: 160, y: 180, width: 420, height: 300 });
  await new Promise(resolve => win.webContents.once('did-finish-load', resolve));
  const batch = process.env.METECH_GESTURE_BATCH==='1';
  const name = 'organizer-gesture-' + path.basename(root).slice(-36) + '.txt';
  const source = path.join(root, name);
  fs.writeFileSync(source, 'real Electron gesture contents');
  const members=[source];
  if(batch) {
    const other=path.join(root,'other-parent');fs.mkdirSync(other);
    members.push(path.join(other,name.replace('.txt','-second.txt')),path.join(root,name.replace('.txt','-folder')));
    fs.writeFileSync(members[1],'real Electron gesture contents');fs.mkdirSync(members[2]);fs.writeFileSync(path.join(members[2],'contents.txt'),'real Electron gesture contents');
  }
  await win.webContents.executeJavaScript(`window.electronAPI.invoke('organizer-add', ${JSON.stringify(members)})`);
  const loaded = new Promise(resolve => win.webContents.once('did-finish-load', resolve)); win.reload(); await loaded;
  win.webContents.on('console-message', (_event, _level, message) => { if (message.startsWith('gesture:')) fs.appendFileSync(path.join(root, 'events.txt'), message + '\n'); });
  await win.webContents.executeJavaScript(`for (const type of ['dragenter', 'dragover', 'drop']) document.addEventListener(type, event => console.log('gesture:' + JSON.stringify({ type, x:event.clientX,y:event.clientY,files:event.dataTransfer.files.length,effect:event.dataTransfer.dropEffect })))`);
  await win.webContents.executeJavaScript(`new Promise(resolve => { const timer = setInterval(() => { if (document.querySelectorAll('.item img').length === document.querySelectorAll('.item').length) { clearInterval(timer); resolve(); } }, 20); })`);
  const signature = await win.webContents.executeJavaScript(`new Promise(resolve => {
    let mutations = 0, resizeErrors = 0;
    const observe = new MutationObserver(records => mutations += records.length);
    observe.observe(document.getElementById('items'), { subtree:true, attributes:true, childList:true });
    addEventListener('error', event => { if (event.message.includes('ResizeObserver')) resizeErrors++; });
    setTimeout(() => { observe.disconnect(); const nodes=[...document.querySelectorAll('.item')];const box=nodes[${batch?0:-1}===0?0:nodes.length-1].getBoundingClientRect(); resolve({ mutations, resizeErrors, x:Math.round(box.left+41), y:Math.round(box.top+23), width:innerWidth, height:innerHeight }); }, 1200);
  })`);
  if (signature.mutations || signature.resizeErrors || win.isResizable()) throw new Error('Idle layout is unstable: ' + JSON.stringify(signature));
  fs.writeFileSync(path.join(root, 'source.json'), JSON.stringify({ ...signature, fileName: name,fileNames:members.map(file=>path.basename(file)) }));
  win.focus();
  phase = 'ready'; snapshot();
  const save = service.save.bind(service); service.save = () => { save(); snapshot(); };
  const timer = setInterval(snapshot, 100); timer.unref();
}).catch(error => { console.error(error); service?.dispose(); app.exit(1); });
setInterval(() => { if (fs.existsSync(path.join(root, 'quit'))) app.quit(); }, 100).unref();
app.on('before-quit', () => service?.dispose());
setTimeout(() => { service?.dispose(); app.exit(1); }, 45000).unref();
