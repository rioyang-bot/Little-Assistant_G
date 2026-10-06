const { app, ...electron } = require('electron');
const fs = require('fs');
const path = require('path');
const { DesktopOrganizer } = require('../electron/desktop-organizer.cjs');
const root = process.argv[2];
if (!root || !path.basename(root).startsWith('organizer-inbound-test-')) throw new Error('Missing fixture root');
app.setPath('userData', path.join(root, 'profile'));
let service;
app.whenReady().then(async () => {
  service = new DesktopOrganizer({ app, ...electron }, path.join(root, 'profile'));
  service.register(); await service.iconVisibility.prepare();
  service.create(); const board = service.boards[0], win = service.windows.get(board.id);
  // Keep only the owned test window above other apps; production stays at bottom.
  service.layers.get(board.id).dispose(); win.setAlwaysOnTop(true, 'screen-saver');
  win.setBounds({ x: 160, y: 180, width: 420, height: 300 });
  await new Promise(resolve => win.webContents.once('did-finish-load', resolve));
  await win.webContents.executeJavaScript(`window.electronAPI.invoke('organizer-get')`);
  const timer = setInterval(async () => {
    try {
      const ui = await win.webContents.executeJavaScript(`({ width: innerWidth, count: document.querySelectorAll('.item').length, icons: document.querySelectorAll('.item img').length, status: document.getElementById('status').textContent })`);
      const state = { handle: win.getNativeWindowHandle().readBigUInt64LE().toString(), items: board.items, ui, elevated: service.iconVisibility.workerIsElevated === true };
      const file = path.join(root, 'state.json'); fs.writeFileSync(file + '.tmp', JSON.stringify(state)); fs.renameSync(file + '.tmp', file);
    } catch (error) { if (!win.isDestroyed()) console.error(error); }
  }, 100); timer.unref();
}).catch(error => { console.error(error); service?.dispose(); app.exit(1); });
setInterval(() => { if (fs.existsSync(path.join(root, 'quit'))) app.quit(); }, 100).unref();
app.on('before-quit', () => service?.dispose());
setTimeout(() => { service?.dispose(); app.exit(1); }, 45000).unref();
