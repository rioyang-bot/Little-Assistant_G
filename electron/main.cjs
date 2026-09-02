const { app, BrowserWindow, Tray, Menu, screen, ipcMain, nativeImage, dialog } = require('electron');
const path = require('path');
const { EmailService } = require('./email-service.cjs');
const { CalendarService } = require('./calendar-service.cjs');
const { TriviaService } = require('./trivia-service.cjs');
const { StickyNotesService } = require('./sticky-notes-service.cjs');
const { AlarmService } = require('./alarm-service.cjs');
const { locales } = require('./locales.cjs');
const { isNewerVersion, formatDisplayVersion, getReleaseNotes } = require('./version-utils.cjs');
const {
  SIZE_PRESETS,
  getStickyNotesSizePreset,
  getCompositeWindowSize,
  clampWindowYToWorkArea,
  getMonitorFittedWindowHeight
} = require('./layout-utils.cjs');

const fs = require('fs');

let mainWindow = null;
let settingsWindow = null;
let emailService = null;
let calendarService = null;
let triviaService = null;
let stickyNotesService = null;
let alarmService = null;
let tray = null;
let currentSizeKey = 'std';
let currentBubbleFontSize = 'std';
let currentStickyNotesSize = 'std';
let todoPanelOpacity = 1;
let calendarPanelOpacity = 1;
let emailPanelOpacity = 1;
let currentLanguage = 'zh-TW';
let currentBallSpeed = 1.2;
let isAlwaysOnTop = true;
let isMoveMode = false; // 預設為穿透模式 (false)，但球體不穿透可互動
let isBubbleEnabled = true;
let isAlarmActive = false;
let currentDockSide = 'right'; // 'right' (預設右側對齊) 或 'left' (左側對齊)
let savedWindowPosition = null;
let lastRunVersion = null;
let trayContextMenu = null;

// Preferences Persistence (Saved in standard Windows AppData user directory)
function getPreferencesPath() {
  try {
    const userDir = app.getPath('userData');
    return path.join(userDir, 'pet-preferences.json');
  } catch (e) {
    return path.join(__dirname, '../pet-preferences.json');
  }
}

function loadPetPreferences() {
  try {
    const prefPath = getPreferencesPath();
    if (fs.existsSync(prefPath)) {
      const data = JSON.parse(fs.readFileSync(prefPath, 'utf8'));
      if (data.sizeKey && ['mini', 'std', 'lg'].includes(data.sizeKey)) {
        currentSizeKey = data.sizeKey;
      }
      if (data.bubbleFontSize && ['sm', 'std', 'lg', 'xl'].includes(data.bubbleFontSize)) {
        currentBubbleFontSize = data.bubbleFontSize;
      }
      if (data.stickyNotesSize && ['sm', 'std', 'lg'].includes(data.stickyNotesSize)) {
        currentStickyNotesSize = data.stickyNotesSize;
      }
      if (Number.isFinite(Number(data.todoPanelOpacity))) todoPanelOpacity = Math.max(0.3, Math.min(1, Number(data.todoPanelOpacity)));
      if (Number.isFinite(Number(data.calendarPanelOpacity))) calendarPanelOpacity = Math.max(0.3, Math.min(1, Number(data.calendarPanelOpacity)));
      if (Number.isFinite(Number(data.emailPanelOpacity))) emailPanelOpacity = Math.max(0.3, Math.min(1, Number(data.emailPanelOpacity)));
      if (data.language && ['zh-TW', 'en'].includes(data.language)) {
        currentLanguage = data.language;
      }
      if (typeof data.isAlwaysOnTop === 'boolean') {
        isAlwaysOnTop = data.isAlwaysOnTop;
      }
      if (typeof data.isMoveMode === 'boolean') {
        isMoveMode = data.isMoveMode;
      }
      if (typeof data.isBubbleEnabled === 'boolean') {
        isBubbleEnabled = data.isBubbleEnabled;
      }
      if (typeof data.ballSpeed === 'number' && data.ballSpeed > 0) {
        currentBallSpeed = data.ballSpeed;
      }
      if (data.dockSide && ['left', 'right'].includes(data.dockSide)) {
        currentDockSide = data.dockSide;
      }
      if (data.windowPosition && typeof data.windowPosition.x === 'number') {
        savedWindowPosition = data.windowPosition;
      }
      if (typeof data.lastRunVersion === 'string') {
        lastRunVersion = data.lastRunVersion;
      }
      return data;
    }
  } catch (e) {
    console.error('Failed to load pet preferences:', e);
  }
  return {};
}

function savePetPreferences() {
  try {
    const prefPath = getPreferencesPath();
    const data = {
      sizeKey: currentSizeKey,
      bubbleFontSize: currentBubbleFontSize,
      stickyNotesSize: currentStickyNotesSize,
      todoPanelOpacity,
      calendarPanelOpacity,
      emailPanelOpacity,
      language: currentLanguage,
      isAlwaysOnTop: isAlwaysOnTop,
      isMoveMode: isMoveMode,
      isBubbleEnabled: isBubbleEnabled,
      ballSpeed: currentBallSpeed,
      dockSide: currentDockSide,
      lastRunVersion: lastRunVersion,
      windowPosition: mainWindow && !mainWindow.isDestroyed() ? {
        x: mainWindow.getPosition()[0],
        y: mainWindow.getPosition()[1]
      } : savedWindowPosition
    };
    fs.writeFileSync(prefPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save pet preferences:', e);
  }
}

// Disable hardware acceleration issues if any on transparent windows
app.commandLine.appendSwitch('enable-transparent-visuals');
// Alarm audio is a user-configured background feature and must be allowed to
// start when a scheduled reminder fires without a fresh click gesture.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

function getLocale() {
  return locales[currentLanguage] || locales['zh-TW'];
}

async function showUpdateNoticeIfNeeded() {
  const currentVersion = app.getVersion();
  const previousVersion = lastRunVersion;

  if (!previousVersion || !isNewerVersion(currentVersion, previousVersion)) {
    lastRunVersion = currentVersion;
    savePetPreferences();
    return;
  }

  const isEnglish = currentLanguage === 'en';
  const notes = getReleaseNotes(currentVersion, currentLanguage);
  const detail = notes.map(note => `• ${note}`).join('\n');

  try {
    await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: isEnglish ? 'METech Assistant Updated' : 'METech 小助手版本更新',
      message: isEnglish
        ? `Updated to ${formatDisplayVersion(currentVersion)}`
        : `已更新至 ${formatDisplayVersion(currentVersion)}`,
      detail,
      buttons: [isEnglish ? 'OK' : '我知道了'],
      defaultId: 0,
      noLink: true
    });
  } catch (error) {
    console.warn('Unable to display update notice:', error.message);
  }

  lastRunVersion = currentVersion;
  savePetPreferences();
}

function setLanguage(lang) {
  if (lang !== 'zh-TW' && lang !== 'en') lang = 'zh-TW';
  currentLanguage = lang;
  savePetPreferences();
  if (emailService) {
    emailService.saveConfig({ language: lang });
  }
  if (calendarService) {
    calendarService.saveConfig({ language: lang });
  }
  if (triviaService) {
    triviaService.saveConfig({ language: lang });
  }
  updateTrayMenu();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('language-changed', currentLanguage);
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('language-changed', currentLanguage);
    settingsWindow.setTitle(getLocale().settingsWindowTitle);
    // Auto-adjust settings window size to fit language comfortably without clipping
    const targetW = currentLanguage === 'en' ? 780 : 720;
    const targetH = currentLanguage === 'en' ? 780 : 760;
    const [w, h] = settingsWindow.getSize();
    if (w < targetW || h < targetH) {
      settingsWindow.setSize(Math.max(w, targetW), Math.max(h, targetH), true);
    }
  }
}

function createPetWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { workArea } = primaryDisplay;

  const windowSize = getCompositeWindowSize(currentSizeKey, currentStickyNotesSize);
  const winW = windowSize.width;
  let winH = Math.max(windowSize.height, workArea.height - 10);

  let winX = Math.round(workArea.x + workArea.width - winW - 20);
  let winY = Math.round(workArea.y + workArea.height - winH - 10);

  if (savedWindowPosition && typeof savedWindowPosition.x === 'number' && typeof savedWindowPosition.y === 'number') {
    winX = savedWindowPosition.x;
    winY = savedWindowPosition.y;
  }

  const nearestDisplay = screen.getDisplayNearestPoint({ x: winX, y: winY }) || primaryDisplay;
  const dispWorkArea = nearestDisplay.workArea;
  // Keep the transparent host window within the destination monitor. Panels
  // already use responsive max-heights, while an oversized native window may
  // be repositioned by Windows and push the bear below a smaller display.
  winH = getMonitorFittedWindowHeight(dispWorkArea.height, (SIZE_PRESETS[currentSizeKey] || SIZE_PRESETS.std).bearSize);

  if (currentDockSide !== 'left' && currentDockSide !== 'right') {
    currentDockSide = (winX + winW / 2 < dispWorkArea.x + dispWorkArea.width / 2) ? 'left' : 'right';
  }

  // Keep inside screen work area
  if (winX + winW > dispWorkArea.x + dispWorkArea.width) winX = dispWorkArea.x + dispWorkArea.width - winW - 10;
  winY = clampWindowYToWorkArea(winY, winH, dispWorkArea);
  if (winX < dispWorkArea.x) winX = dispWorkArea.x + 10;

  mainWindow = new BrowserWindow({
    width: winW,
    height: winH,
    x: winX,
    y: winY,
    transparent: true,
    frame: false,
    alwaysOnTop: isAlwaysOnTop,
    resizable: true,
    hasShadow: false,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required'
    }
  });

  const distPath = path.join(__dirname, '../dist/index.html');
  const indexPath = fs.existsSync(distPath) ? distPath : path.join(__dirname, '../index.html');
  mainWindow.loadFile(indexPath);

  // Ensure window stays on top when set
  if (isAlwaysOnTop) {
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
  }

  // 預設開啟滑鼠穿透模式 (forward: true 允許 DOM 監聽滑鼠移動以保留球體互動)
  if (!isMoveMode) {
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
  }

  // Handle selective mouse event ignoring from renderer (for interactive ball)
  ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (isAlarmActive) {
      mainWindow.setIgnoreMouseEvents(false);
      return;
    }
    if (isMoveMode) {
      mainWindow.setIgnoreMouseEvents(false);
      return;
    }
    // If settings window is currently open, do not let mainWindow install global forward hook
    if (settingsWindow && !settingsWindow.isDestroyed() && settingsWindow.isVisible()) {
      mainWindow.setIgnoreMouseEvents(true);
      return;
    }
    mainWindow.setIgnoreMouseEvents(ignore, options || { forward: true });
  });

  ipcMain.on('set-alarm-active', (event, active) => {
    isAlarmActive = active === true;
    if (!isAlarmActive && alarmService) alarmService.stopNativeSound();
    if (!mainWindow || mainWindow.isDestroyed() || isMoveMode) return;
    if (isAlarmActive) {
      mainWindow.webContents.setAudioMuted(false);
      mainWindow.setIgnoreMouseEvents(false);
    } else if (settingsWindow && !settingsWindow.isDestroyed() && settingsWindow.isVisible()) {
      mainWindow.setIgnoreMouseEvents(true);
    } else {
      mainWindow.setIgnoreMouseEvents(true, { forward: true });
    }
  });

  // Handle window moving via IPC with intelligent left/right dock switching and bounds clamping
  let dragParams = null;

  ipcMain.on('window-drag-start', (event, payload) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const [winX, winY] = mainWindow.getPosition();
    const [winW, winH] = mainWindow.getSize();
    const preset = SIZE_PRESETS[currentSizeKey] || SIZE_PRESETS['std'];
    const bearSize = preset.bearSize || 190;
    const bearMarginX = currentDockSide === 'left' ? 6 : 42;
    const bearMarginY = 2;

    const bearInsideX = currentDockSide === 'left' ? bearMarginX : (winW - bearSize - bearMarginX);
    const bearInsideY = winH - bearSize - bearMarginY;
    const bearScreenX = winX + bearInsideX;
    const bearScreenY = winY + bearInsideY;

    const cursor = screen.getCursorScreenPoint();

    dragParams = {
      grabBearOffsetX: cursor.x - bearScreenX,
      grabBearOffsetY: cursor.y - bearScreenY,
      winW,
      winH,
      bearSize,
      bearMarginX,
      bearMarginY
    };
  });

  ipcMain.on('window-move', (event, payload) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const cursor = screen.getCursorScreenPoint();

    if (!dragParams) {
      const [winX, winY] = mainWindow.getPosition();
      const [winW, winH] = mainWindow.getSize();
      const preset = SIZE_PRESETS[currentSizeKey] || SIZE_PRESETS['std'];
      const bearSize = preset.bearSize || 190;
      const bearMarginX = currentDockSide === 'left' ? 6 : 42;
      const bearMarginY = 2;
      const bearInsideX = currentDockSide === 'left' ? bearMarginX : (winW - bearSize - bearMarginX);
      const bearInsideY = winH - bearSize - bearMarginY;
      const bearScreenX = winX + bearInsideX;
      const bearScreenY = winY + bearInsideY;

      dragParams = {
        grabBearOffsetX: (payload && typeof payload.mouseX === 'number') ? (cursor.x - (winX + payload.mouseX) + bearInsideX) : (cursor.x - bearScreenX),
        grabBearOffsetY: (payload && typeof payload.mouseY === 'number') ? (cursor.y - (winY + payload.mouseY) + bearInsideY) : (cursor.y - bearScreenY),
        winW,
        winH,
        bearSize,
        bearMarginX,
        bearMarginY
      };
    }

    const { grabBearOffsetX, grabBearOffsetY, winW, bearSize, bearMarginY } = dragParams;
    const targetBearX = cursor.x - grabBearOffsetX;
    const targetBearY = cursor.y - grabBearOffsetY;

    const display = screen.getDisplayNearestPoint({ x: cursor.x, y: cursor.y }) || screen.getPrimaryDisplay();
    const { workArea } = display;
    const targetWinH = getMonitorFittedWindowHeight(workArea.height, bearSize);
    const screenCenterX = workArea.x + workArea.width / 2;

    const targetDock = (targetBearX + bearSize / 2 < screenCenterX) ? 'left' : 'right';
    const targetBearMarginX = targetDock === 'left' ? 6 : 42;

    let targetWinX = targetDock === 'left'
      ? (targetBearX - targetBearMarginX)
      : (targetBearX - (winW - bearSize - targetBearMarginX));
    let targetWinY = targetBearY - (targetWinH - bearSize - bearMarginY);

    // Keep window strictly inside display work area so speech bubble is never off-screen
    targetWinX = Math.max(workArea.x, Math.min(workArea.x + workArea.width - winW, targetWinX));
    targetWinY = clampWindowYToWorkArea(targetWinY, targetWinH, workArea, 2);

    if (targetDock !== currentDockSide) {
      currentDockSide = targetDock;
      savePetPreferences();
      mainWindow.webContents.send('dock-side-changed', currentDockSide);
    }

    mainWindow.setBounds({
      x: Math.round(targetWinX),
      y: Math.round(targetWinY),
      width: winW,
      height: Math.round(targetWinH)
    });
  });

  mainWindow.on('moved', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const [x, y] = mainWindow.getPosition();
      savedWindowPosition = { x, y };
      savePetPreferences();
    }
  });

  mainWindow.webContents.on('did-finish-load', () => {
    const curPreset = SIZE_PRESETS[currentSizeKey] || SIZE_PRESETS['std'];
    const stickyPreset = getStickyNotesSizePreset(currentStickyNotesSize);
    const currentWindowSize = getCompositeWindowSize(currentSizeKey, currentStickyNotesSize);
    mainWindow.webContents.send('dock-side-changed', currentDockSide);
    mainWindow.webContents.send('size-updated', {
      width: currentWindowSize.width,
      height: currentWindowSize.height,
      bearSize: curPreset.bearSize || 190,
      sizeKey: currentSizeKey,
      isInit: true,
      label: (currentLanguage === 'en' ? curPreset.labelEn : curPreset.labelZh)
    });
    mainWindow.webContents.send('sticky-size-updated', {
      sizeKey: currentStickyNotesSize,
      boardWidth: stickyPreset.boardWidth,
      isInit: true
    });
    mainWindow.webContents.send('font-size-updated', currentBubbleFontSize, true);
    mainWindow.webContents.send('set-ball-speed', currentBallSpeed, true);
    mainWindow.webContents.send('set-quotes-enabled', isBubbleEnabled, true);
    mainWindow.webContents.send('language-changed', currentLanguage, true);
    mainWindow.webContents.send('panel-opacity-updated', { todo: todoPanelOpacity, calendar: calendarPanelOpacity, email: emailPanelOpacity }, true);
    // Restore the persisted mode in both processes. Without this event the tray
    // showed move mode as enabled after restart, while the renderer still
    // rejected every drag because its local state remained false.
    mainWindow.webContents.send('move-mode-changed', isMoveMode, true);
    mainWindow.setIgnoreMouseEvents(!isMoveMode, isMoveMode ? undefined : { forward: true });
  });

  // Handle window scale / size
  ipcMain.on('set-size', (event, sizeKey) => {
    setAssistantSize(sizeKey);
  });

  ipcMain.on('set-scale', (event, sizeKeyOrScale) => {
    if (sizeKeyOrScale === 0.75 || sizeKeyOrScale === '0.75' || sizeKeyOrScale === 'mini') {
      setAssistantSize('mini');
    } else if (sizeKeyOrScale === 1.25 || sizeKeyOrScale === '1.25' || sizeKeyOrScale === 'lg') {
      setAssistantSize('lg');
    } else {
      setAssistantSize('std');
    }
  });

  // Native Context Menu Popup
  ipcMain.on('show-context-menu', () => {
    if (trayContextMenu && mainWindow) {
      trayContextMenu.popup({ window: mainWindow });
    }
  });

  // Open Email Settings Window
  ipcMain.on('open-email-settings', () => {
    openSettingsWindow();
  });

  // Language IPC Handlers
  ipcMain.handle('get-language', () => {
    return currentLanguage;
  });

  ipcMain.handle('get-app-version', () => {
    return {
      version: app.getVersion(),
      displayVersion: formatDisplayVersion(app.getVersion())
    };
  });

  ipcMain.handle('set-language', (event, lang) => {
    setLanguage(lang);
    return { success: true, language: currentLanguage };
  });

  // Bubble Font Size IPC Handlers
  ipcMain.handle('get-bubble-font-size', () => currentBubbleFontSize);
  ipcMain.handle('set-bubble-font-size', (event, sizeKey) => {
    setBubbleFontSize(sizeKey);
    return { success: true, fontSize: currentBubbleFontSize };
  });

  // Sticky Notes Size IPC Handlers (independent from assistant size)
  ipcMain.handle('get-sticky-notes-size', () => currentStickyNotesSize);
  ipcMain.handle('set-sticky-notes-size', (event, sizeKey) => {
    setStickyNotesSize(sizeKey);
    return { success: true, stickyNotesSize: currentStickyNotesSize };
  });

  ipcMain.handle('get-panel-opacity', () => ({ todo: todoPanelOpacity, calendar: calendarPanelOpacity, email: emailPanelOpacity }));
  ipcMain.handle('preview-panel-opacity', (event, input = {}) => {
    const requestedTodo = Number(input.todo);
    const requestedCalendar = Number(input.calendar);
    const requestedEmail = Number(input.email);
    const todo = Number.isFinite(requestedTodo) ? Math.max(0.3, Math.min(1, requestedTodo)) : todoPanelOpacity;
    const calendar = Number.isFinite(requestedCalendar) ? Math.max(0.3, Math.min(1, requestedCalendar)) : calendarPanelOpacity;
    const email = Number.isFinite(requestedEmail) ? Math.max(0.3, Math.min(1, requestedEmail)) : emailPanelOpacity;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('panel-opacity-updated', { todo, calendar, email });
    }
    return { success: true, todo, calendar, email };
  });
  ipcMain.handle('set-panel-opacity', (event, input = {}) => {
    todoPanelOpacity = Math.max(0.3, Math.min(1, Number(input.todo) || 1));
    calendarPanelOpacity = Math.max(0.3, Math.min(1, Number(input.calendar) || 1));
    emailPanelOpacity = Math.max(0.3, Math.min(1, Number(input.email) || 1));
    savePetPreferences();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('panel-opacity-updated', { todo: todoPanelOpacity, calendar: calendarPanelOpacity, email: emailPanelOpacity });
    }
    return { success: true, todo: todoPanelOpacity, calendar: calendarPanelOpacity, email: emailPanelOpacity };
  });

  // Auto-Launch IPC Handlers
  ipcMain.handle('get-auto-launch', () => getAutoLaunch());
  ipcMain.handle('set-auto-launch', (event, enable) => {
    const isNow = setAutoLaunch(enable);
    return { success: true, openAtLogin: isNow };
  });

  // Health Reminder IPC Handlers
  ipcMain.handle('health-test-reminder', (event, options = {}) => {
    triggerHealthReminder(options.soundEnabled !== false);
    return { success: true };
  });

  // Handle close
  ipcMain.on('close-app', () => {
    app.quit();
  });

  // Handle minimize
  ipcMain.on('minimize-app', () => {
    mainWindow.minimize();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function getAutoLaunch() {
  try {
    return app.getLoginItemSettings(getAutoLaunchOptions()).openAtLogin;
  } catch (e) {
    console.error('Failed to read login item settings:', e);
    return false;
  }
}

function getAutoLaunchOptions() {
  const options = {
    path: process.execPath,
    args: []
  };

  // When running from the project, process.execPath is electron.exe. Windows
  // therefore also needs the application entry point or it starts Electron
  // without loading the assistant. Packaged builds need only their own exe.
  if (!app.isPackaged) {
    options.args = [path.resolve(__dirname, 'main.cjs')];
  }

  return options;
}

function setAutoLaunch(enable) {
  try {
    app.setLoginItemSettings({
      ...getAutoLaunchOptions(),
      openAtLogin: !!enable,
      openAsHidden: false
    });
  } catch (e) {
    console.error('Failed to update login item settings:', e);
  }
  updateTrayMenu();
  return getAutoLaunch();
}

function setBubbleFontSize(sizeKey) {
  if (!['sm', 'std', 'lg', 'xl'].includes(sizeKey)) sizeKey = 'std';
  currentBubbleFontSize = sizeKey;
  savePetPreferences();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('font-size-updated', sizeKey);
  }
  updateTrayMenu();
}

function resizeMainWindowForCurrentSizes() {
  const nextSize = getCompositeWindowSize(currentSizeKey, currentStickyNotesSize);
  if (!mainWindow || mainWindow.isDestroyed()) return nextSize;
  const [curX, curY] = mainWindow.getPosition();
  const [curW, curH] = mainWindow.getSize();
  const newW = nextSize.width;

  const currentDisplay = screen.getDisplayNearestPoint({ x: curX, y: curY }) || screen.getPrimaryDisplay();
  const { workArea } = currentDisplay;
  const newH = getMonitorFittedWindowHeight(workArea.height, (SIZE_PRESETS[currentSizeKey] || SIZE_PRESETS.std).bearSize);

  // Anchor according to current docking side
  let newX;
  if (currentDockSide === 'left') {
    newX = curX;
  } else {
    newX = curX + (curW - newW);
  }
  let newY = curY + (curH - newH);

  // Keep inside screen work area
  if (newX + newW > workArea.x + workArea.width) {
    newX = workArea.x + workArea.width - newW - 10;
  }
  newY = clampWindowYToWorkArea(newY, newH, workArea);
  if (newX < workArea.x) newX = workArea.x + 10;

  mainWindow.setResizable(true);
  mainWindow.setBounds({
    x: Math.round(newX),
    y: Math.round(newY),
    width: newW,
    height: newH
  });

  return nextSize;
}

function setAssistantSize(presetKey) {
  const preset = SIZE_PRESETS[presetKey] || SIZE_PRESETS.std;
  currentSizeKey = preset.id;
  const windowSize = resizeMainWindowForCurrentSizes();

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('size-updated', {
      width: windowSize.width,
      height: windowSize.height,
      bearSize: preset.bearSize || 190,
      sizeKey: preset.id,
      label: (currentLanguage === 'en' ? preset.labelEn : preset.labelZh)
    });
  }

  savePetPreferences();
  updateTrayMenu();
}

function setStickyNotesSize(sizeKey) {
  const preset = getStickyNotesSizePreset(sizeKey);
  currentStickyNotesSize = preset.id;
  const windowSize = resizeMainWindowForCurrentSizes();

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('sticky-size-updated', {
      sizeKey: preset.id,
      boardWidth: preset.boardWidth,
      windowWidth: windowSize.width,
      windowHeight: windowSize.height
    });
  }

  savePetPreferences();
  updateTrayMenu();
}

// ==========================================================================
// Health & Hydration Reminder Scheduler
// ==========================================================================
let healthTimer = null;

function startHealthTimer() {
  stopHealthTimer();
  const config = (emailService && emailService.config) ? emailService.config : {};
  const healthConfig = config.health || { enabled: true, intervalMinutes: 45, soundEnabled: true };
  if (healthConfig.enabled === false) return;

  const intervalMin = Math.max(1, parseInt(healthConfig.intervalMinutes, 10) || 45);
  const intervalMs = intervalMin * 60 * 1000;
  console.log(`🍵 Health Reminder Timer started (every ${intervalMin} minutes).`);

  healthTimer = setInterval(() => {
    triggerHealthReminder(healthConfig.soundEnabled !== false);
  }, intervalMs);
}

function stopHealthTimer() {
  if (healthTimer) {
    clearInterval(healthTimer);
    healthTimer = null;
    console.log('🛑 Health Reminder Timer stopped.');
  }
}

function triggerHealthReminder(soundEnabled = true) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('health-reminder', {
      soundEnabled: soundEnabled !== false,
      timestamp: Date.now()
    });
  }
}

function resetPosition() {
  if (!mainWindow) return;
  const primaryDisplay = screen.getPrimaryDisplay();
  const { workArea } = primaryDisplay;
  const [w, h] = mainWindow.getSize();
  currentDockSide = 'right';
  savePetPreferences();
  mainWindow.webContents.send('dock-side-changed', 'right');
  mainWindow.setPosition(
    Math.round(workArea.x + workArea.width - w - 20),
    Math.round(workArea.y + workArea.height - h - 10)
  );
}

function setMoveMode(enabled) {
  isMoveMode = enabled;
  savePetPreferences();
  if (!mainWindow) return;
  if (isMoveMode) {
    mainWindow.setIgnoreMouseEvents(false);
  } else {
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
  }
  mainWindow.webContents.send('move-mode-changed', isMoveMode);
  updateTrayMenu();
}

function setBallSpeed(speed) {
  const parsedSpeed = Number(speed);
  currentBallSpeed = Number.isFinite(parsedSpeed) && parsedSpeed > 0 ? parsedSpeed : 1.2;
  savePetPreferences();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('set-ball-speed', currentBallSpeed);
  }
}

function setBubbleEnabled(enabled) {
  isBubbleEnabled = !!enabled;
  savePetPreferences();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('set-quotes-enabled', isBubbleEnabled);
  }
  updateTrayMenu();
}

function updateTrayMenu() {
  if (!tray) return;

  const t = getLocale().tray;
  const mock = getLocale().mockEmails;

  trayContextMenu = Menu.buildFromTemplate([
    {
      label: t.title,
      enabled: false
    },
    { type: 'separator' },
    {
      label: t.windowMenu,
      submenu: [
        {
          label: t.alwaysOnTop,
          type: 'checkbox',
          checked: isAlwaysOnTop,
          click: (menuItem) => {
            isAlwaysOnTop = menuItem.checked;
            savePetPreferences();
            if (mainWindow) {
              mainWindow.setAlwaysOnTop(isAlwaysOnTop, 'screen-saver');
            }
          }
        },
        {
          label: t.autoLaunch,
          type: 'checkbox',
          checked: getAutoLaunch(),
          click: (menuItem) => {
            const isEnabled = setAutoLaunch(menuItem.checked);
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('auto-launch-updated', isEnabled);
            }
          }
        },
        {
          label: t.moveMode,
          type: 'checkbox',
          checked: isMoveMode,
          click: (menuItem) => {
            setMoveMode(menuItem.checked);
          }
        },
        {
          label: t.resetPosition,
          click: () => {
            if (mainWindow) {
              const primaryDisplay = screen.getPrimaryDisplay();
              const { workArea } = primaryDisplay;
              const [w, h] = mainWindow.getSize();
              mainWindow.setPosition(
                Math.round(workArea.x + workArea.width - w - 20),
                Math.round(workArea.y + workArea.height - h - 10)
              );
              savePetPreferences();
            }
          }
        }
      ]
    },
    {
      label: t.assistantSize,
      submenu: [
        {
          label: t.sizeMini,
          type: 'radio',
          checked: currentSizeKey === 'mini',
          click: () => setAssistantSize('mini')
        },
        {
          label: t.sizeStd,
          type: 'radio',
          checked: currentSizeKey === 'std',
          click: () => setAssistantSize('std')
        },
        {
          label: t.sizeLg,
          type: 'radio',
          checked: currentSizeKey === 'lg',
          click: () => setAssistantSize('lg')
        }
      ]
    },
    {
      label: t.stickyNotesSize,
      submenu: [
        {
          label: t.stickySizeSm,
          type: 'radio',
          checked: currentStickyNotesSize === 'sm',
          click: () => setStickyNotesSize('sm')
        },
        {
          label: t.stickySizeStd,
          type: 'radio',
          checked: currentStickyNotesSize === 'std',
          click: () => setStickyNotesSize('std')
        },
        {
          label: t.stickySizeLg,
          type: 'radio',
          checked: currentStickyNotesSize === 'lg',
          click: () => setStickyNotesSize('lg')
        }
      ]
    },
    {
      label: t.bubbleFontSize,
      submenu: [
        {
          label: t.fontSizeSm,
          type: 'radio',
          checked: currentBubbleFontSize === 'sm',
          click: () => setBubbleFontSize('sm')
        },
        {
          label: t.fontSizeStd,
          type: 'radio',
          checked: currentBubbleFontSize === 'std',
          click: () => setBubbleFontSize('std')
        },
        {
          label: t.fontSizeLg,
          type: 'radio',
          checked: currentBubbleFontSize === 'lg',
          click: () => setBubbleFontSize('lg')
        },
        {
          label: t.fontSizeXl,
          type: 'radio',
          checked: currentBubbleFontSize === 'xl',
          click: () => setBubbleFontSize('xl')
        }
      ]
    },
    {
      label: t.globeSpeed,
      submenu: [
        {
          label: t.speedSlow,
          click: () => setBallSpeed(0.5)
        },
        {
          label: t.speedNormal,
          click: () => setBallSpeed(1.0)
        },
        {
          label: t.speedDefault,
          click: () => setBallSpeed(1.2)
        },
        {
          label: t.speedFast,
          click: () => setBallSpeed(2.5)
        },
        {
          label: t.speedTurbo,
          click: () => setBallSpeed(5.0)
        }
      ]
    },
    {
      label: t.toggleQuotes,
      type: 'checkbox',
      checked: isBubbleEnabled,
      click: (menuItem) => setBubbleEnabled(menuItem.checked)
    },
    {
      label: t.languageMenu,
      submenu: [
        {
          label: t.langZh,
          type: 'radio',
          checked: currentLanguage === 'zh-TW',
          click: () => setLanguage('zh-TW')
        },
        {
          label: t.langEn,
          type: 'radio',
          checked: currentLanguage === 'en',
          click: () => setLanguage('en')
        }
      ]
    },
    {
      label: t.exploreTrivia,
      click: () => {
        if (triviaService) {
          triviaService.fetchAndTrigger(true);
        }
      }
    },
    { type: 'separator' },
    {
      label: t.emailSettings,
      click: () => openSettingsWindow()
    },
    { type: 'separator' },
    {
      label: t.quit,
      click: () => app.quit()
    }
  ]);

  tray.setContextMenu(trayContextMenu);
}

function createTray() {
  const iconCandidates = [
    path.join(__dirname, '../dist/assets/icon.png'),
    path.join(__dirname, '../assets/icon.png'),
    path.join(__dirname, '../public/assets/icon.png')
  ];
  let iconPath = iconCandidates.find(p => require('fs').existsSync(p)) || iconCandidates[2];
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon.resize({ width: 24, height: 24, quality: 'best' }));

  updateTrayMenu();

  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.focus() : mainWindow.show();
    }
  });
}

function openSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    if (settingsWindow.isMinimized()) settingsWindow.restore();
    settingsWindow.show();
    settingsWindow.setAlwaysOnTop(true);
    settingsWindow.moveTop();
    settingsWindow.focus();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setIgnoreMouseEvents(true);
    }
    return;
  }

  const loc = getLocale();
  const initWidth = currentLanguage === 'en' ? 780 : 720;
  const initHeight = currentLanguage === 'en' ? 780 : 760;
  settingsWindow = new BrowserWindow({
    width: initWidth,
    height: initHeight,
    minWidth: 640,
    minHeight: 620,
    title: loc.settingsWindowTitle,
    backgroundColor: '#0b1120',
    resizable: true,
    minimizable: true,
    maximizable: false,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      autoplayPolicy: 'no-user-gesture-required'
    }
  });

  settingsWindow.setMenu(null);
  settingsWindow.setAlwaysOnTop(true);

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setIgnoreMouseEvents(true);
  }

  const fs = require('fs');
  const distSettings = path.join(__dirname, '../dist/email-settings.html');
  const rawSettings = path.join(__dirname, '../email-settings.html');
  const settingsPath = fs.existsSync(distSettings) ? distSettings : rawSettings;

  settingsWindow.loadFile(settingsPath).catch(err => {
    console.error('Failed to load settings window:', err);
  });

  settingsWindow.once('ready-to-show', () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.show();
      settingsWindow.setAlwaysOnTop(true);
      settingsWindow.moveTop();
      settingsWindow.focus();
    }
  });

  settingsWindow.on('focus', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setIgnoreMouseEvents(true);
    }
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      // Discard any unsaved settings-window preview and restore persisted values.
      mainWindow.webContents.send('panel-opacity-updated', {
        todo: todoPanelOpacity,
        calendar: calendarPanelOpacity,
        email: emailPanelOpacity
      });
      if (isMoveMode) mainWindow.setIgnoreMouseEvents(false);
      else mainWindow.setIgnoreMouseEvents(true, { forward: true });
    }
  });
}

// Set application identity
app.name = 'METechAssistant';
app.setAppUserModelId('com.metech.assistant');

// Prevent multiple instances of the assistant app
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log('Another instance is already running. Quitting.');
  app.exit(0);
} else {
  app.on('second-instance', () => {
    // Focus and restore existing instance if user tries to open it again
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    // Load persisted pet preferences (size, font size, language, ball speed, position)
    loadPetPreferences();

    // Initialize Email Service & load config
    emailService = new EmailService(() => mainWindow, (cfg) => {
      startHealthTimer();
    });
    // Initialize Calendar Service & load config
    calendarService = new CalendarService(() => mainWindow);
    // Initialize Trivia & Clean Humor Joke Service
    triviaService = new TriviaService(() => mainWindow);
    stickyNotesService = new StickyNotesService();
    alarmService = new AlarmService(() => mainWindow, () => stickyNotesService);

    if (emailService.config && emailService.config.language) {
      currentLanguage = emailService.config.language;
    }

    createPetWindow();
    createTray();

    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        showUpdateNoticeIfNeeded();
      }, 500);
    });

    emailService.startPolling();
    calendarService.startPolling();
    startHealthTimer();
    alarmService.start();
  });
}

app.on('before-quit', () => {
  savePetPreferences();
  if (emailService) {
    emailService.stopPolling();
  }
  if (alarmService) alarmService.stop();
  if (calendarService) {
    calendarService.stopPolling();
  }
  if (triviaService) {
    triviaService.stopScheduler();
  }
  stopHealthTimer();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
