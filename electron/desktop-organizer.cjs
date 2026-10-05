const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { isWithin, moveFile, extractShortcutIcon, extractShellIcon, expandWindowsPath } = require('./organizer-files.cjs');
const { WindowsFileDrag } = require('./windows-file-drag.cjs');
const { WindowLayerController } = require('./window-layer-controller.cjs');
const { DesktopIconVisibility } = require('./desktop-icon-visibility.cjs');
const { WindowsContextMenu } = require('./windows-context-menu.cjs');

const limit = (value, min, max, fallback) => Number.isFinite(value) ? Math.round(Math.max(min, Math.min(max, value))) : fallback;
const arrangements = ['free', 'grid', 'row', 'column'];
const gridCell = position => ({ column:limit((position.x - 8) / 88, 0, 454, 0), row:limit((position.y - 12) / 104, 0, 384, 0) });
const cellKey = cell => `${cell.column}:${cell.row}`;
function gridPosition(position, occupied) {
  const target = gridCell(position);
  for (let radius = 0; radius <= occupied.size + 1; radius++) {
    let closest;
    for (let row = Math.max(0, target.row - radius); row <= Math.min(384, target.row + radius); row++) {
      for (let column = Math.max(0, target.column - radius); column <= Math.min(454, target.column + radius); column++) {
        if (Math.max(Math.abs(row - target.row), Math.abs(column - target.column)) !== radius || occupied.has(`${column}:${row}`)) continue;
        const distance = ((column - target.column) * 88) ** 2 + ((row - target.row) * 104) ** 2;
        if (!closest || distance < closest.distance) closest = { column, row, distance };
      }
    }
    if (closest) return { x:8 + closest.column * 88, y:12 + closest.row * 104 };
  }
  throw new Error('找不到可用的圖示位置。');
}
function normalizeBoard(input = {}) {
  return {
    id: typeof input.id === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(input.id) ? input.id : randomUUID(),
    title: String(input.title || '桌面整理').slice(0, 60),
    locked: input.locked === true,
    // Retain positions when reopening settings from the retired automatic modes.
    arrangement: ['row','column'].includes(input.arrangement) ? 'grid' : arrangements.includes(input.arrangement) ? input.arrangement : 'free',
    opacity: limit(input.opacity, 0, 100, 45),
    color: /^#[0-9a-f]{6}$/i.test(input.color || '') ? input.color : '#171c2a',
    textColor: /^#[0-9a-f]{6}$/i.test(input.textColor || '') ? input.textColor : '#f7f7fb',
    headerColorMode: input.headerColorMode === 'custom' ? 'custom' : 'follow',
    headerColor: /^#[0-9a-f]{6}$/i.test(input.headerColor || '') ? input.headerColor : '#171c2a',
    headerTextColor: /^#[0-9a-f]{6}$/i.test(input.headerTextColor || '') ? input.headerTextColor : '#f7f7fb',
    pattern: ['none', 'dots', 'grid', 'diagonal'].includes(input.pattern) ? input.pattern : 'none',
    image: typeof input.image === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(input.image) && input.image.length < 6000000 ? input.image : '',
    bounds: {
      x: limit(input.bounds?.x, -100000, 100000, 40),
      y: limit(input.bounds?.y, -100000, 100000, 40),
      width: limit(input.bounds?.width, 220, 1400, 360),
      height: limit(input.bounds?.height, 160, 1200, 300)
    },
    items: (Array.isArray(input.items) ? input.items : []).filter(item =>
      item && typeof item.path === 'string' && item.path.length <= 32768 && path.isAbsolute(item.path) && !item.path.includes('\0')
    ).slice(0, 300).map(item => ({
      id: typeof item.id === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(item.id) ? item.id : randomUUID(), path: item.path,
      originalPath: typeof item.originalPath === 'string' && path.isAbsolute(item.originalPath) && !item.originalPath.includes('\0') ? item.originalPath : undefined,
      position: item.position && Number.isFinite(item.position.x) && Number.isFinite(item.position.y)
        ? { x: limit(item.position.x, 0, 40000, 0), y: limit(item.position.y, 0, 40000, 0) } : undefined
    }))
  };
}

class DesktopOrganizer {
  constructor(electron, userDir, onChange = () => {}) {
    this.electron = electron;
    this.file = path.join(userDir, 'desktop-organizer.json');
    this.filesRoot = path.join(userDir, 'desktop-organizer-files');
    this.icons = new Map();
    this.windows = new Map();
    this.settingsWindows = new Map();
    this.recoveries = new Map();
    this.viewports = new Map();
    this.layers = new Map();
    this.migrationWarnings = new Map();
    this.iconErrors = [];
    this.suspendedIcons = new Set();
    this.dragSessions = new Map();
    this.contextWatchers = new Set();
    this.clipboardFiles = new Map();
    this.contextMenu = electron.organizerContextMenu || (process.platform === 'win32' && electron.app ? new WindowsContextMenu() : null);
    if (this.contextMenu) this.contextMenu.onClipboardChanged = sequence => {
      let changed = false;
      for (const [key, pending] of this.clipboardFiles) if (pending.sequence !== null && pending.sequence !== sequence) { pending.finishWatch?.(); this.clipboardFiles.delete(key); changed = true; }
      if (changed) this.syncDesktopIcons();
    };
    this.iconVisibility = electron.organizerDesktopIcons === false ? null : electron.organizerDesktopIcons ||
      (process.platform === 'win32' && electron.app ? new DesktopIconVisibility(userDir, electron.app.getPath('desktop'), {
        onStatus: message => {
          this.iconErrors = [message];
          this.notifyIconStatus();
        }
      }) : null);
    this.nativeDrag = electron.organizerDrag || (process.platform === 'win32' && electron.app ? new WindowsFileDrag() : null);
    this.onChange = onChange;
    this.boards = [];
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.boards = (Array.isArray(data.boards) ? data.boards : []).filter(board => board && typeof board === 'object').slice(0, 30).map(normalizeBoard);
      this.boards = this.boards.filter((board, index, all) => all.findIndex(other => other.id === board.id) === index);
    } catch (error) {
      if (error.code !== 'ENOENT') console.warn('桌面整理設定無法讀取，使用預設值。');
    }
    this.restoreLegacyItems();
  }

  save() {
    clearTimeout(this.saveTimer); this.saveTimer = null;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = this.file + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify({ boards: this.boards }, null, 2), 'utf8');
    fs.renameSync(temporary, this.file);
  }

  scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => { this.saveTimer = null; this.save(); }, 180);
  }

  withDialog(board, task) {
    const layer = this.layers.get(board.id);
    return layer ? layer.withModal(task) : task();
  }

  notifyView(board, preview = this.settingsWindows.get(board.id)?.preview || null) {
    this.windows.get(board.id)?.webContents.send?.('organizer-view-updated', { board, preview });
  }

  notifyIconStatus() {
    if (this.quitting) return;
    for (const board of this.boards) {
      const win = this.windows.get(board.id);
      if (!win || win.isDestroyed?.() || win.webContents.isDestroyed?.()) continue;
      try { win.webContents.send?.('organizer-view-updated', {
        statusOnly: true, migrationErrors: this.boardResult(board).migrationErrors
      }); } catch { /* The window may close while the native worker responds. */ }
    }
  }

  closeSettings(board) {
    const entry = this.settingsWindows.get(board.id);
    if (!entry) return;
    entry.cancelled = true;
    if (entry.window && !entry.window.isDestroyed()) entry.window.close();
  }

  async openSettings(board) {
    if (board.locked) throw new Error('整理視窗已鎖定，請先解鎖。');
    const existing = this.settingsWindows.get(board.id);
    if (existing) {
      await existing.ready;
      if (existing.window && !existing.window.isDestroyed()) { existing.window.show(); existing.window.focus(); }
      return true;
    }
    const entry = { window: null, preview: null, cancelled: false };
    this.settingsWindows.set(board.id, entry);
    let ready, failed;
    entry.ready = new Promise((resolve, reject) => { ready = resolve; failed = reject; });
    entry.lifecycle = this.withDialog(board, async () => {
      if (entry.cancelled || board.locked || this.quitting) { ready(false); return; }
      const win = new this.electron.BrowserWindow({
        width: 380, height: 480, minWidth: 320, minHeight: 420,
        parent: this.windows.get(board.id), modal: true, show: false, skipTaskbar: true,
        autoHideMenuBar: true, backgroundColor: '#172030', title: `整理視窗設定 — ${board.title}`,
        webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, webSecurity: true, backgroundThrottling: false }
      });
      entry.window = win;
      win.setMenu(null);
      win.on('page-title-updated', event => event.preventDefault());
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      win.webContents.on('will-navigate', event => event.preventDefault());
      const closed = new Promise(resolve => win.once('closed', resolve));
      win.once('ready-to-show', () => { if (!win.isDestroyed() && !board.locked) win.show(); });
      const built = path.join(__dirname, '../dist/desktop-organizer-settings.html');
      try {
        await win.loadFile(fs.existsSync(built) ? built : path.join(__dirname, '../desktop-organizer-settings.html'));
        ready(true);
        await closed;
      } catch (error) { if (!win.isDestroyed()) win.destroy(); throw error; }
    }).catch(error => { failed(error); }).finally(() => {
      if (this.settingsWindows.get(board.id) === entry) this.settingsWindows.delete(board.id);
      if (!this.quitting && this.boards.includes(board)) this.notifyView(board, null);
    });
    return entry.ready;
  }

  removeFromBoard(board, id) {
    const item = board.items.find(item => item.id === id);
    if (item) this.restoreItem(item);
    const remove = () => { board.items = board.items.filter(item => item.id !== id); this.layoutBoard(board); this.save(); return board; };
    if (item && this.iconVisibility) return this.releaseDesktopIcon(item).then(remove);
    return remove();
  }

  notifyItems(board) { this.windows.get(board.id)?.webContents.send?.('organizer-items-updated', board.items); }

  watchContextFile(file) {
    let timer, update, watcher;
    const close = () => { clearTimeout(timer); clearTimeout(update); watcher?.close(); this.contextWatchers.delete(close); };
    try {
      watcher = fs.watch(path.dirname(file), () => {
        clearTimeout(update);
        update = setTimeout(() => {
          if (fs.existsSync(file)) return;
          let changed = false;
          for (const board of this.boards) {
            const items = board.items.filter(item => item.path.toLowerCase() !== file.toLowerCase());
            if (items.length === board.items.length) continue;
            board.items = items; this.layoutBoard(board); this.notifyItems(board); changed = true;
          }
          if (changed) { this.save(); this.syncDesktopIcons(); }
          close();
        }, 150);
      });
      watcher.on('error', close);
      this.contextWatchers.add(close);
    } catch { return () => {}; }
    return () => { timer = setTimeout(close, 30000); timer.unref(); };
  }

  desktopPaths(excludedItem) {
    return [...new Set(this.boards.flatMap(board => board.items).filter(item => item !== excludedItem && !item.originalPath && !this.suspendedIcons.has(item.path.toLowerCase()) && !this.clipboardFiles.has(item.path.toLowerCase())).map(item => item.path))];
  }

  async syncDesktopIcons(paths = this.desktopPaths()) {
    if (this.permissionOperation) return this.iconErrors;
    if (!this.iconVisibility) return [];
    try { this.iconErrors = await this.iconVisibility.sync(paths); }
    catch (error) { this.iconErrors = [error.message || '無法隱藏桌面圖示。']; }
    this.notifyIconStatus();
    return this.iconErrors;
  }

  async withIconServiceStopped(operation) {
    if (this.activeDrag) throw new Error('請先完成檔案拖曳。');
    if (this.permissionOperation) throw new Error('桌面圖示權限正在設定中。');
    this.permissionOperation = true;
    try {
      await this.iconVisibility?.stopWorker();
      this.iconVisibility?.dispose();
      return await operation();
    } finally {
      this.permissionOperation = false;
      if (!this.quitting && !this.iconVisibility?.child) {
        this.iconVisibility = new DesktopIconVisibility(path.dirname(this.file), this.electron.app.getPath('desktop'), {
          onStatus: message => { this.iconErrors = [message]; this.notifyIconStatus(); }
        });
        // A permission action already made the user's consent decision. Do
        // not immediately open a second UAC prompt when ordinary sync resumes.
        this.iconVisibility.elevationAttempted = true;
        await this.syncDesktopIcons();
      }
    }
  }

  boardResult(board) {
    return { ...board, migrationErrors: [...board.items.map(item => this.migrationWarnings.get(item)).filter(Boolean), ...this.iconErrors] };
  }

  releaseDesktopIcon(item) {
    if (!this.iconVisibility) return;
    return this.syncDesktopIcons(this.desktopPaths(item)).then(errors => {
      if (errors.length) throw new Error(errors.join(' '));
    });
  }

  layoutBoard(board) {
    const bounds = this.windows.get(board.id)?.getBounds?.() || board.bounds;
    const viewport = this.viewports.get(board.id);
    const width = viewport?.width || bounds.width;
    const columns = Math.max(1, Math.floor((width - 16) / 88));
    if (board.arrangement === 'grid') {
      const occupied = new Set(); let changed = false, slot = 0;
      // Existing placements get priority. Fill new items into vacant cells
      // without compacting gaps or reordering when the viewport changes.
      for (const item of [...board.items.filter(item => item.position), ...board.items.filter(item => !item.position)]) {
        let desired = item.position;
        if (!desired) {
          do { desired = { x:8 + (slot % columns) * 88, y:12 + Math.floor(slot / columns) * 104 }; slot++; }
          while (occupied.has(cellKey(gridCell(desired))));
        }
        const position = gridPosition(desired, occupied);
        occupied.add(cellKey(gridCell(position)));
        if (item.position?.x !== position.x || item.position?.y !== position.y) { item.position = position; changed = true; }
      }
      return changed;
    }
    if (board.arrangement === 'row' || board.arrangement === 'column') {
      const height = viewport?.height || Math.max(1, bounds.height - 52);
      const rows = Math.max(1, Math.floor((height - 24) / 104));
      let changed = false;
      board.items.forEach((item, index) => {
        const position = board.arrangement === 'column'
          ? { x: 8 + Math.floor(index / rows) * 88, y: 12 + (index % rows) * 104 }
          : { x: 8 + (index % columns) * 88, y: 12 + Math.floor(index / columns) * 104 };
        if (item.position?.x !== position.x || item.position?.y !== position.y) { item.position = position; changed = true; }
      });
      return changed;
    }
    let changed = false;
    for (const item of board.items) {
      if (item.position) continue;
      let slot = 0;
      let candidate;
      do {
        candidate = { x: 8 + (slot % columns) * 88, y: 12 + Math.floor(slot / columns) * 104 };
        slot++;
      } while (board.items.some(other => other !== item && other.position && Math.abs(other.position.x - candidate.x) < 82 && Math.abs(other.position.y - candidate.y) < 96));
      item.position = candidate; changed = true;
    }
    return changed;
  }

  restoreItem(item) {
    if (!item.originalPath) return;
    if (!isWithin(this.filesRoot, item.path)) throw new Error('此項目的位置不在整理資料夾內，無法移回。');
    // Recover a restore interrupted between moving the file and saving JSON.
    if (fs.existsSync(item.path)) {
      const result = moveFile(item.path, item.originalPath);
      if (result.sourceRetained) throw new Error('檔案已移回，但整理資料夾內的檔案仍被使用中，請關閉檔案後再試。');
    } else if (!fs.existsSync(item.originalPath)) {
      throw new Error('找不到要恢復的檔案，請確認原位置與整理資料夾。');
    }
    item.path = item.originalPath;
    delete item.originalPath;
    this.migrationWarnings.delete(item);
  }

  restoreLegacyItems() {
    const items = this.boards.flatMap(board => board.items).filter(item => item.originalPath);
    if (!items.length) return;
    // Preserve the previous inventory before migrating real files. Never
    // overwrite an original-path file, including one recreated by the user.
    try {
      fs.copyFileSync(this.file, this.file + '.before-references.json', fs.constants.COPYFILE_EXCL);
    } catch (error) {
      if (error.code !== 'EEXIST') {
        for (const item of items) this.migrationWarnings.set(item, '無法備份整理設定，尚未恢復原位置。');
        return;
      }
    }
    for (const item of items) {
      try { this.restoreItem(item); this.save(); }
      catch (error) {
        this.migrationWarnings.set(item, `${path.basename(item.path)}：${error.message}`);
        console.warn('整理項目尚未恢復原路徑：', error.message);
      }
    }
  }

  async getIcon(item) {
    const { app, shell, nativeImage } = this.electron;
    const stat = fs.statSync(item.path);
    const key = `${item.path}:${stat.mtimeMs}:${stat.size}`;
    if (this.icons.has(key)) return this.icons.get(key);
    const job = (async () => {
      if (stat.isDirectory()) {
        // Query the actual folder so Windows retains its folder/custom icon.
        // Electron's extension-based fallback treats extensionless folders as files.
        const folderIcon = await extractShellIcon(item.path);
        if (folderIcon) return folderIcon;
      }
      if (stat.isFile() && /\.(png|jpe?g|gif|bmp|webp|tiff?|ico|heic|heif|avif)$/i.test(item.path) && nativeImage) {
        try {
          const thumbnail = await nativeImage.createThumbnailFromPath(item.path, { width: 96, height: 96 });
          if (!thumbnail.isEmpty()) return thumbnail.toDataURL();
        } catch { /* Unsupported or damaged images keep their file-type icon. */ }
      }
      if (path.extname(item.path).toLowerCase() === '.lnk') {
        try {
          const shortcut = shell.readShortcutLink(item.path);
          const iconPath = expandWindowsPath(shortcut.icon || shortcut.target);
          if (iconPath && fs.existsSync(iconPath)) {
            const custom = await extractShortcutIcon(iconPath, shortcut.iconIndex || 0);
            if (custom) return custom;
          }
          const target = expandWindowsPath(shortcut.target);
          if (target && fs.existsSync(target)) return (await app.getFileIcon(target, { size: 'normal' })).toDataURL();
        } catch { /* Broken links retain the shell's original fallback icon. */ }
      }
      return (await app.getFileIcon(item.path, { size: 'normal' })).toDataURL();
    })().catch(() => '');
    if (this.icons.size > 600) this.icons.clear();
    this.icons.set(key, job);
    return job;
  }

  fitBounds(bounds) {
    const { screen } = this.electron;
    const area = screen.getDisplayMatching(bounds).workArea;
    const width = Math.min(bounds.width, area.width);
    const height = Math.min(bounds.height, area.height);
    return { width, height, x: Math.round(Math.max(area.x, Math.min(area.x + area.width - width, bounds.x))), y: Math.round(Math.max(area.y, Math.min(area.y + area.height - height, bounds.y))) };
  }

  create() {
    if (this.boards.length >= 30) return;
    const { screen } = this.electron;
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    const offset = (this.boards.length % 6) * 24;
    const board = normalizeBoard({ title: `桌面整理 ${this.boards.length + 1}`, bounds: { x: area.x + 40 + offset, y: area.y + 40 + offset } });
    this.boards.push(board);
    this.save();
    this.show(board);
    this.onChange();
  }

  show(board) {
    const existing = this.windows.get(board.id);
    if (existing && !existing.isDestroyed()) {
      if (existing.isMinimized()) existing.restore();
      const bounds = existing.getBounds();
      const fitted = this.fitBounds(bounds);
      if (Object.keys(fitted).some(key => fitted[key] !== bounds[key])) existing.setBounds(fitted);
      existing.showInactive();
      existing.moveTop();
      return existing;
    }
    const { BrowserWindow } = this.electron;
    const creationBounds = this.fitBounds(board.bounds);
    const win = new BrowserWindow({
      ...creationBounds, minWidth: 220, minHeight: 160,
      transparent: true, frame: false, resizable: false, thickFrame: false, hasShadow: false, backgroundColor: '#00000000', movable: !board.locked,
      skipTaskbar: true, show: false, title: board.title,
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, webSecurity: true, backgroundThrottling: false }
    });
    const initialNativeBounds = win.getBounds();
    this.windows.set(board.id, win);
    this.layers.set(board.id, new WindowLayerController(win, 'bottom', { desktopOrganizer: true }));
    win.setMenu(null);
    win.on('page-title-updated', event => event.preventDefault());
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', event => event.preventDefault());
    const built = path.join(__dirname, '../dist/desktop-organizer.html');
    win.once('ready-to-show', () => {
      if (win.isDestroyed()) return;
      // Frameless Windows creation can add a DPI-dependent frame offset.
      // Apply the intended geometry after creation before revealing it.
      const liveBounds = win.getBounds();
      const changedBeforeLoad = Object.keys(initialNativeBounds).some(key => liveBounds[key] !== initialNativeBounds[key]);
      win.setBounds(changedBeforeLoad ? this.fitBounds(liveBounds) : creationBounds, false);
      board.bounds = win.getBounds(); this.scheduleSave();
      win.showInactive();
    });
    win.loadFile(fs.existsSync(built) ? built : path.join(__dirname, '../desktop-organizer.html')).catch(() => console.warn('桌面整理視窗載入失敗。'));
    const remember = () => {
      if (win.isDestroyed()) return;
      board.bounds = win.getBounds();
      this.scheduleSave();
    };
    win.on('moved', remember);
    win.on('resized', remember);
    win.on('close', event => { if (!this.quitting) { event.preventDefault(); this.closeSettings(board); win.hide(); } });
    win.on('closed', () => {
      // A retired native window must not remove a replacement window's state.
      if (this.windows.get(board.id) !== win) return;
      this.closeSettings(board); this.windows.delete(board.id); this.layers.delete(board.id); this.viewports.delete(board.id);
    });
    return win;
  }

  recover(board) {
    if (this.recoveries.has(board.id)) return this.recoveries.get(board.id);
    const recovery = this.recoverWindow(board).finally(() => this.recoveries.delete(board.id));
    this.recoveries.set(board.id, recovery);
    return recovery;
  }

  async recoverWindow(board) {
    if (this.quitting || !this.boards.includes(board)) return false;
    if (this.activeDrag) throw new Error('請先完成檔案拖曳，再復原整理視窗。');
    const settings = this.settingsWindows.get(board.id);
    this.closeSettings(board);
    if (settings?.lifecycle) await settings.lifecycle;
    if (this.quitting || !this.boards.includes(board)) return false;
    if (this.activeDrag) throw new Error('請先完成檔案拖曳，再復原整理視窗。');
    // Recreate the native window and renderer even when the page is alive but
    // its transparent surface is blank. Showing the same HWND cannot fix it.
    const previous = this.windows.get(board.id);
    this.layers.get(board.id)?.dispose();
    if (previous && !previous.isDestroyed()) previous.destroy();
    this.windows.delete(board.id); this.layers.delete(board.id); this.viewports.delete(board.id);
    const { screen } = this.electron;
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    const width = Math.min(board.bounds.width, area.width);
    const height = Math.min(board.bounds.height, area.height);
    board.bounds = { width, height, x: Math.round(area.x + (area.width - width) / 2), y: Math.round(area.y + (area.height - height) / 2) };
    this.save();
    const win = this.show(board);
    await new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); win.removeListener('ready-to-show', ready); win.removeListener('closed', closed); win.webContents.removeListener('did-fail-load', failed); };
      const ready = () => { cleanup(); win.showInactive(); win.moveTop(); resolve(); };
      const closed = () => { cleanup(); reject(new Error('整理視窗復原中斷，請再試一次。')); };
      const failed = (_event, _code, _description, _url, isMainFrame) => { if (isMainFrame) { cleanup(); reject(new Error('整理視窗載入失敗，請再試一次。')); } };
      const timer = setTimeout(() => { cleanup(); reject(new Error('整理視窗復原逾時，請再試一次。')); }, 15000);
      win.once('ready-to-show', ready); win.once('closed', closed); win.webContents.on('did-fail-load', failed);
    });
    return true;
  }

  register() {
    this.nativeDrag?.prepare?.().catch(() => {});
    this.contextMenu?.prepare?.().catch(() => {});
    if (this.iconVisibility) this.syncDesktopIcons();
    const { ipcMain, dialog, app, shell } = this.electron;
    const ownBoard = (event, allowSettings = false) => {
      for (const board of this.boards) if (this.windows.get(board.id)?.webContents === event.sender || (allowSettings && this.settingsWindows.get(board.id)?.window?.webContents === event.sender)) return board;
      throw new Error('無法存取此整理視窗。');
    };
    const settingsBoard = event => {
      const board = ownBoard(event, true);
      if (this.settingsWindows.get(board.id)?.window?.webContents !== event.sender) throw new Error('無法存取此設定視窗。');
      if (board.locked) throw new Error('整理視窗已鎖定，請先解鎖。');
      return board;
    };
    ipcMain.handle('organizer-settings-open', event => this.openSettings(ownBoard(event)));
    ipcMain.handle('organizer-settings-close', event => this.closeSettings(settingsBoard(event)));
    ipcMain.handle('organizer-settings-preview', (event, input = {}) => {
      const board = settingsBoard(event), entry = this.settingsWindows.get(board.id);
      const normalized = normalizeBoard({ ...board, ...input });
      entry.preview = Object.fromEntries(['title', 'opacity', 'color', 'textColor', 'headerColorMode', 'headerColor', 'headerTextColor', 'pattern', 'image'].map(key => [key, normalized[key]]));
      this.notifyView(board); return true;
    });
    ipcMain.handle('organizer-get', event => {
      const board = ownBoard(event, true);
      if (this.layoutBoard(board)) this.save();
      if (this.iconVisibility) return this.syncDesktopIcons().then(() => this.boardResult(board));
      return this.boardResult(board);
    });
    ipcMain.handle('organizer-position', (event, input = {}) => {
      const board = ownBoard(event);
      const item = board.items.find(item => item.id === input.id);
      if (!item || !Number.isFinite(input.x) || !Number.isFinite(input.y)) throw new Error('無效的圖示位置。');
      const ids = Array.isArray(input.ids) ? [...new Set(input.ids)] : [item.id];
      const moving = ids.map(id => board.items.find(candidate => candidate.id === id));
      if (!ids.length || ids.length > 300 || !ids.includes(item.id) || moving.some(candidate => !candidate)) throw new Error('無效的圖示選取。');
      if (!['free','grid'].includes(board.arrangement)) return board;
      this.layoutBoard(board);
      const desired = { x:limit(input.x, 0, 40000, 0), y:limit(input.y, 0, 40000, 0) };
      const target = board.arrangement === 'grid' ? gridPosition(desired, new Set()) : desired;
      const minX = board.arrangement === 'grid' ? 8 : 0, minY = board.arrangement === 'grid' ? 12 : 0;
      const maxX = board.arrangement === 'grid' ? 39960 : 40000, maxY = board.arrangement === 'grid' ? 39948 : 40000;
      const dx = limit(target.x-item.position.x,minX-Math.min(...moving.map(entry=>entry.position.x)),maxX-Math.max(...moving.map(entry=>entry.position.x)),0);
      const dy = limit(target.y-item.position.y,minY-Math.min(...moving.map(entry=>entry.position.y)),maxY-Math.max(...moving.map(entry=>entry.position.y)),0);
      const positions = moving.map(entry=>({x:entry.position.x+dx,y:entry.position.y+dy}));
      if (board.arrangement === 'grid') {
        const targets = new Set(positions.map(position=>cellKey(gridCell(position))));
        const vacant = moving.map(entry=>entry.position).filter(position=>!targets.has(cellKey(gridCell(position))));
        const displaced = board.items.filter(entry=>!moving.includes(entry) && targets.has(cellKey(gridCell(entry.position))));
        displaced.forEach((entry,index)=>{entry.position={...vacant[index]};});
      }
      moving.forEach((entry,index)=>{entry.position=positions[index];});
      this.save(); return board;
    });
    ipcMain.handle('organizer-layout', (event, input = {}) => {
      const board = ownBoard(event);
      if (!Number.isFinite(input.width) || !Number.isFinite(input.height)) throw new Error('無效的整理區域大小。');
      this.viewports.set(board.id, { width: limit(input.width, 1, 20000, 1), height: limit(input.height, 1, 20000, 1) });
      if (this.layoutBoard(board)) this.scheduleSave();
      return { positions: board.items.map(item => ({ id: item.id, position: item.position })) };
    });
    ipcMain.handle('organizer-drag-out', async (event, id) => {
      if (this.permissionOperation) throw new Error('桌面圖示權限正在設定中，請稍後再拖曳。');
      const board = ownBoard(event);
      const ids = [...new Set(Array.isArray(id) ? id : [id])];
      const items = ids.map(value=>board.items.find(item=>item.id===value));
      if (!items.length || items.length>300 || items.some(item=>!item || !fs.existsSync(item.path))) throw new Error('找不到要拖曳的檔案。');
      const item = items[0];
      if (!this.nativeDrag) throw new Error('此系統尚不支援檔案拖出。');
      if (this.activeDrag) throw new Error('另一個檔案正在拖曳，請稍後再試。');
      const session = { token: randomUUID(), board, item, items };
      this.activeDrag = session;
      this.dragSessions.set(session.token, session);
      for (const win of this.windows.values()) if (!win.isDestroyed?.()) win.webContents.send?.('organizer-drag-state', { token: session.token, boardId: board.id, path: item.path, paths:items.map(entry=>entry.path) });
      for (const entry of items) this.suspendedIcons.add(entry.path.toLowerCase());
      let effect;
      try {
        // Restore owned flags before an external Shell move so the destination
        // file does not inherit the organizer's temporary hidden/system bits.
        for (const entry of items) await this.iconVisibility?.reveal(entry.path);
        const result = await this.nativeDrag.drag(items.length===1 ? item.path : items.map(entry=>entry.path));
        effect = typeof result==='object' ? result.effect : result;
        const restored = typeof result==='object' ? result.restored : undefined;
        // The native source intercepts a return to the original desktop before
        // Shell Drop runs; restore its icon and remove only the reference.
        if (effect === 'Move' || (effect==='Desktop' && restored)) {
          const moving=items.filter(entry=>!restored?.some(file=>file.toLowerCase()===entry.path.toLowerCase()));
          for (let attempt = 0; attempt < 40 && moving.some(entry=>fs.existsSync(entry.path)); attempt++) await new Promise(resolve => setTimeout(resolve, 50));
        }
        const removed = items.filter(entry=>(effect === 'Desktop' && !entry.originalPath && (!restored || restored.some(file=>file.toLowerCase()===entry.path.toLowerCase()))) || !fs.existsSync(entry.path));
        if (removed.length) {
          board.items = board.items.filter(candidate => !removed.includes(candidate));
          this.layoutBoard(board);
          this.save();
        }
      } finally {
        const missing=items.filter(entry=>board.items.includes(entry) && !fs.existsSync(entry.path));
        if(missing.length){board.items=board.items.filter(entry=>!missing.includes(entry));this.layoutBoard(board);this.save();this.notifyItems(board);}
        this.activeDrag = null;
        for (const win of this.windows.values()) if (!win.isDestroyed?.()) win.webContents.send?.('organizer-drag-state', null);
        // Chromium dispatches drop before OLE finishes, but its IPC may arrive
        // afterwards. Retain the authenticated session for that queued drop.
        if (this.dragSessions.has(session.token)) {
          session.timer = setTimeout(() => this.dragSessions.delete(session.token), 30000);
          session.timer.unref();
        }
        for (const entry of items) this.suspendedIcons.delete(entry.path.toLowerCase());
        await this.syncDesktopIcons();
      }
      return board;
    });
    ipcMain.handle('organizer-update', (event, input = {}) => {
      const board = ownBoard(event, true);
      const fromSettings = this.settingsWindows.get(board.id)?.window?.webContents === event.sender;
      if (fromSettings) settingsBoard(event);
      if (typeof input.title === 'string') board.title = input.title.trim().slice(0, 60) || '桌面整理';
      if (typeof input.locked === 'boolean') board.locked = input.locked;
      if (Number.isFinite(input.opacity)) board.opacity = limit(input.opacity, 0, 100, 45);
      if (typeof input.color === 'string' && /^#[0-9a-f]{6}$/i.test(input.color)) board.color = input.color;
      if (typeof input.textColor === 'string' && /^#[0-9a-f]{6}$/i.test(input.textColor)) board.textColor = input.textColor;
      if (['follow', 'custom'].includes(input.headerColorMode)) board.headerColorMode = input.headerColorMode;
      if (typeof input.headerColor === 'string' && /^#[0-9a-f]{6}$/i.test(input.headerColor)) board.headerColor = input.headerColor;
      if (typeof input.headerTextColor === 'string' && /^#[0-9a-f]{6}$/i.test(input.headerTextColor)) board.headerTextColor = input.headerTextColor;
      if (['none', 'dots', 'grid', 'diagonal'].includes(input.pattern)) board.pattern = input.pattern;
      if (arrangements.includes(input.arrangement)) board.arrangement = input.arrangement;
      if (input.clearImage === true) board.image = '';
      if (fromSettings && typeof input.image === 'string') board.image = normalizeBoard({ image: input.image }).image;
      const win = this.windows.get(board.id);
      win.setMovable(!board.locked);
      // Transparent Windows windows require native resizing to remain off.
      // The custom resize grip uses setBounds and still honors board.locked.
      win.setTitle(board.title);
      this.layoutBoard(board);
      this.save(); this.onChange();
      if (board.locked) this.closeSettings(board);
      this.notifyView(board);
      return board;
    });
    const add = (board, paths, dropPosition, token) => {
      if (!Array.isArray(paths) || paths.length > 300) throw new Error('一次最多加入 300 個項目。');
      const session = token ? this.dragSessions.get(token) : null;
      if (token && (!session || paths.length !== session.items.length || new Set(paths.map(target=>typeof target==='string' ? path.normalize(target).toLowerCase() : '')).size !== paths.length || session.items.some(item=>!session.board.items.includes(item) || !paths.some(target=>typeof target==='string' && path.normalize(target).toLowerCase()===item.path.toLowerCase())))) throw new Error('拖曳項目已變更，請重新拖曳。');
      let skipped = 0;
      const errors = [];
      const seen = new Set();
      for (const target of paths) {
        if (typeof target !== 'string' || target.length > 32768 || !path.isAbsolute(target) || target.includes('\0')) { skipped++; continue; }
        const resolved = path.normalize(target);
        const sourceKey = resolved.toLowerCase();
        if (seen.has(sourceKey)) continue;
        seen.add(sourceKey);
        if (!fs.existsSync(resolved)) { skipped++; continue; }
        const existing = board.items.find(item => item.path.toLowerCase() === sourceKey);
        const transfer = session && session.board !== board;
        if (existing && !transfer) continue;
        if (!existing && board.items.length >= 300) { skipped++; continue; }
        const sourceItem = transfer && session.items.find(item=>item.path.toLowerCase()===sourceKey);
        const item = existing || sourceItem || { id: randomUUID(), path: resolved };
        if (transfer && !existing) delete item.position;
        if (Number.isFinite(dropPosition?.x) && Number.isFinite(dropPosition?.y)) {
          item.position = { x: limit(dropPosition.x, 0, 20000, 0), y: limit(dropPosition.y, 0, 20000, 0) };
          const nextX = dropPosition.x+88;
          const availableWidth = this.viewports.get(board.id)?.width || board.bounds.width-18;
          dropPosition = nextX+90>availableWidth ? {x:8,y:dropPosition.y+104} : {x:nextX,y:dropPosition.y};
        }
        // This is an inventory entry only. Do not move/copy the source or
        // create shortcut files; opening and icons use the original path.
        if (!existing) board.items.push(item);
        if (transfer) {
          session.board.items = session.board.items.filter(candidate => candidate !== sourceItem);
        }
      }
      if (session && session.board !== board && session.items.some(item=>!session.board.items.includes(item))) {
        this.layoutBoard(session.board);
        this.notifyItems(session.board);
        clearTimeout(session.timer);
        this.dragSessions.delete(session.token);
      }
      this.layoutBoard(board);
      this.save();
      return { board, skipped, errors };
    };
    ipcMain.handle('organizer-add', (event, paths, position, token) => {
      if (this.permissionOperation) throw new Error('桌面圖示權限正在設定中，請稍後再加入檔案。');
      const result = add(ownBoard(event), paths, position, token);
      if (!this.iconVisibility) return result;
      return this.syncDesktopIcons().then(errors => ({ ...result, errors: [...result.errors, ...errors] }));
    });
    ipcMain.handle('organizer-background', async event => {
      const board = ownBoard(event, true);
      const fromSettings = this.settingsWindows.get(board.id)?.window?.webContents === event.sender;
      if (fromSettings) settingsBoard(event);
      const parent = fromSettings ? this.settingsWindows.get(board.id).window : this.windows.get(board.id);
      const result = await this.withDialog(board, () => dialog.showOpenDialog(parent, { title: '選擇背景圖片', properties: ['openFile'], filters: [{ name: '背景圖片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] }));
      if (result.canceled || !result.filePaths.length) return fromSettings ? { canceled: true } : board;
      if (fromSettings) settingsBoard(event);
      const file = result.filePaths[0];
      if (fs.statSync(file).size > 4 * 1024 * 1024) throw new Error('背景圖片請小於 4 MB。');
      const bytes = fs.readFileSync(file);
      const type = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'png'
        : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'jpeg'
        : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' ? 'webp' : '';
      if (!type) throw new Error('請選擇 PNG、JPEG 或 WebP 圖片。');
      const image = `data:image/${type};base64,${bytes.toString('base64')}`;
      if (fromSettings) return { ...board, image };
      board.image = image;
      this.save(); return board;
    });
    ipcMain.handle('organizer-remove', (event, id) => {
      if (this.permissionOperation) throw new Error('桌面圖示權限正在設定中，請稍後再移除。');
      const board = ownBoard(event);
      return this.removeFromBoard(board, id);
    });
    ipcMain.handle('organizer-context-menu', async (event, id, point = {}) => {
      if (this.permissionOperation) throw new Error('桌面圖示權限正在設定中，請稍後再試。');
      const board = ownBoard(event), item = board.items.find(item => item.id === id);
      if (!item || !fs.existsSync(item.path)) throw new Error('找不到檔案或資料夾，可能已移動或刪除。');
      if (!this.contextMenu) return { fallback:true };
      const win = this.windows.get(board.id), bounds = win.getBounds();
      const position = { x:bounds.x + limit(point.x, 0, bounds.width, 20), y:bounds.y + limit(point.y, 0, bounds.height, 40) };
      const physical = this.electron.screen.dipToScreenPoint?.(position) || position;
      const finishWatch = this.watchContextFile(item.path);
      const sourceKey = item.path.toLowerCase();
      let result;
      try {
        result = await this.withDialog(board, () => this.contextMenu.show({ file:item.path, owner:win.getNativeWindowHandle().readBigUInt64LE().toString(), ownerPid:process.pid, ...physical, extended:point.extended===true,
          removeLabel:item.originalPath ? '移回原位置' : '從整理視窗移除', revealLabel:'在檔案總管顯示', copyPathLabel:'複製路徑' }, async verb => {
            // Shell commands must see the file's original attributes. Keep
            // copy/cut sources restored until their clipboard data is replaced.
            this.suspendedIcons.add(sourceKey);
            if (['copy','cut'].includes(verb.toLowerCase())) { this.clipboardFiles.get(sourceKey)?.finishWatch?.(); this.clipboardFiles.set(sourceKey,{ sequence:null }); }
            await this.iconVisibility?.reveal(item.path);
          }));
        if (this.clipboardFiles.get(sourceKey)?.sequence === null) this.clipboardFiles.get(sourceKey).sequence = result.clipboardSequence;
        if (result.action === 'remove') await this.removeFromBoard(board, id);
        else if (result.action === 'reveal') shell.showItemInFolder(item.path);
        else if (result.action === 'copy-path') this.electron.clipboard.writeText('"' + item.path + '"');
      } finally {
        this.suspendedIcons.delete(sourceKey);
        if (!result && this.clipboardFiles.get(sourceKey)?.sequence === null) this.clipboardFiles.delete(sourceKey);
        await this.syncDesktopIcons();
        if (this.clipboardFiles.has(sourceKey)) this.clipboardFiles.get(sourceKey).finishWatch = finishWatch;
        else finishWatch();
      }
      return { action:result.action, id, items:board.items };
    });
    ipcMain.handle('organizer-rename', async (event, id, name) => {
      if (this.permissionOperation) throw new Error('桌面圖示權限正在設定中，請稍後再重新命名。');
      const board = ownBoard(event), item = board.items.find(item => item.id === id);
      if (!item || !fs.existsSync(item.path)) throw new Error('找不到要重新命名的檔案。');
      if (typeof name !== 'string' || !name || name.length > 255 || /[<>:"/\\|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name) || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name)) throw new Error('檔案名稱無效，請使用 Windows 可接受的名稱。');
      const previous = item.path, next = path.join(path.dirname(previous), name);
      if (next === previous) return { items:board.items };
      if (next.toLowerCase() !== previous.toLowerCase() && fs.existsSync(next)) throw new Error('已有同名檔案，請使用其他名稱。');
      await this.iconVisibility?.reveal(previous);
      try {
        fs.renameSync(previous, next);
        for (const candidate of this.boards) {
          let changed = false;
          for (const entry of candidate.items) if (entry.path.toLowerCase() === previous.toLowerCase()) { entry.path = next; changed = true; }
          if (changed) this.notifyItems(candidate);
        }
        this.icons.delete(previous); this.save();
      } finally { await this.syncDesktopIcons(); }
      return { items:board.items };
    });
    ipcMain.handle('organizer-resize', (event, size = {}) => {
      const board = ownBoard(event);
      if (board.locked) return;
      const win = this.windows.get(board.id);
      const current = win.getBounds();
      const next = this.fitBounds({ ...current, width: limit(size.width, 220, 1400, 360), height: limit(size.height, 160, 1200, 300) });
      if (Object.keys(next).some(key => current[key] !== next[key])) {
        win.setBounds(next);
        // Programmatic sizing of a frameless window may omit 'resized'.
        board.bounds = win.getBounds();
        this.scheduleSave();
      }
    });
    ipcMain.handle('organizer-open', async (event, id, reveal = false) => {
      const board = ownBoard(event);
      const item = board.items.find(candidate => candidate.id === id);
      if (!item || !fs.existsSync(item.path)) return { error: '找不到檔案或資料夾，可能已移動或刪除。' };
      if (reveal === true) { shell.showItemInFolder(item.path); return {}; }
      const error = await shell.openPath(item.path);
      return { error: error ? '無法開啟此項目，請確認檔案與預設應用程式。' : '' };
    });
    ipcMain.handle('organizer-icon', async (event, id) => {
      const item = ownBoard(event).items.find(candidate => candidate.id === id);
      if (!item) return '';
      try { return await this.getIcon(item); } catch { return ''; }
    });
    ipcMain.handle('organizer-hide', event => { const board = ownBoard(event); this.closeSettings(board); this.windows.get(board.id).hide(); });
    ipcMain.handle('organizer-delete', async event => {
      if (this.permissionOperation) throw new Error('桌面圖示權限正在設定中，請稍後再刪除整理視窗。');
      const board = ownBoard(event, true);
      const fromSettings = this.settingsWindows.get(board.id)?.window?.webContents === event.sender;
      if (fromSettings) settingsBoard(event);
      const win = this.windows.get(board.id);
      const parent = fromSettings ? this.settingsWindows.get(board.id).window : win;
      const result = await this.withDialog(board, () => dialog.showMessageBox(parent, { type: 'question', buttons: ['取消', '刪除整理視窗'], defaultId: 0, cancelId: 0, message: `刪除「${board.title}」？`, detail: board.items.some(item => item.originalPath) ? '尚未恢復原位置的舊項目會先移回；遇到同名檔案會保留視窗，避免覆蓋。' : '原檔案及資料夾會保留在原位置，桌面圖示會恢復顯示；仍收納於其他整理視窗的項目會繼續隱藏。' }));
      if (result.response !== 1) return false;
      if (this.permissionOperation) throw new Error('桌面圖示權限正在設定中，請稍後再刪除整理視窗。');
      if (fromSettings) settingsBoard(event);
      for (const item of [...board.items]) {
        this.restoreItem(item);
        await this.releaseDesktopIcon(item);
        board.items = board.items.filter(candidate => candidate !== item);
        this.save();
      }
      this.boards = this.boards.filter(candidate => candidate.id !== board.id);
      win.destroy(); this.save(); this.onChange(); return true;
    });
  }

  restore() { for (const board of this.boards) this.show(board); }
  reposition() { for (const win of this.windows.values()) if (!win.isDestroyed()) win.setBounds(this.fitBounds(win.getBounds())); }
  dispose() {
    this.quitting = true;
    for (const board of this.boards) this.closeSettings(board);
    this.contextMenu?.dispose?.();
    for (const close of this.contextWatchers) close();
    for (const session of this.dragSessions.values()) clearTimeout(session.timer);
    this.dragSessions.clear();
    this.nativeDrag?.dispose?.();
    this.iconVisibility?.dispose?.();
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; this.save(); }
    for (const win of this.windows.values()) if (!win.isDestroyed()) win.destroy();
  }
}

module.exports = { DesktopOrganizer, normalizeBoard };
