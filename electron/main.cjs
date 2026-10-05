const { app, BrowserWindow, Tray, Menu, screen, ipcMain, nativeImage, dialog, shell, clipboard, Notification } = require('electron');
const path = require('path');
const { EmailService } = require('./email-service.cjs');
const { DesktopOrganizer } = require('./desktop-organizer.cjs');
const { DesktopIconPermissions, readBroker } = require('./desktop-icon-permissions.cjs');
const { CalendarService } = require('./calendar-service.cjs');
const { TriviaService } = require('./trivia-service.cjs');
const { KnowledgeCardsService } = require('./knowledge-cards-service.cjs');
const { StickyNotesService } = require('./sticky-notes-service.cjs');
const { AlarmService } = require('./alarm-service.cjs');
const { WindowLayerController, normalizeWindowLayerMode } = require('./window-layer-controller.cjs');
const { parseNaturalLanguageTask } = require('./natural-language-task.cjs');
const { UpdateService } = require('./update-service.cjs');
const { startRelaunchWatchdog } = require('./update-relaunch-watchdog.cjs');
const { verifyDownloadedUpdate } = require('./update-signature.cjs');
const { autoUpdater } = require('electron-updater');
const { locales } = require('./locales.cjs');
const { isNewerVersion, formatDisplayVersion, getReleaseNotes } = require('./version-utils.cjs');
const {
  SIZE_PRESETS,
  getStickyNotesSizePreset,
  getCompositeWindowSize,
  clampWindowYToWorkArea,
  getMonitorFittedWindowHeight,
  getBottomRightWindowBounds,
  getAssistantDisplayAnchor,
  getDisplayLayoutKey,
  selectAssistantDisplay,
  centerWindowInWorkArea
} = require('./layout-utils.cjs');

const fs = require('fs');
const { spawn, execFileSync } = require('child_process');
const { fileURLToPath } = require('url');
const { installIpcSenderPolicy } = require('./ipc-sender-policy.cjs');

// Must run before any service registers handlers so every channel is covered.
installIpcSenderPolicy(ipcMain, sender => getIpcSenderRole(sender));

function isAppPageUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'file:') return false;
    const relative = path.relative(path.resolve(__dirname, '..'), fileURLToPath(parsed));
    return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
  } catch (error) {
    return false;
  }
}

// App pages are local files that hold the preload API. They must never navigate
// to remote content or open in-app windows; web links go to the system browser.
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    try {
      if (['http:', 'https:'].includes(new URL(url).protocol)) shell.openExternal(url);
    } catch (error) { /* Ignore malformed links. */ }
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    if (!isAppPageUrl(url)) event.preventDefault();
  });
  contents.on('will-attach-webview', event => event.preventDefault());
});

let mainWindow = null;
let desktopOrganizer = null;
let settingsWindow = null;
let knowledgeCardWindow = null;
let emailService = null;
let calendarService = null;
let triviaService = null;
let knowledgeCardsService = null;
let stickyNotesService = null;
let alarmService = null;
let updateService = null;
let updateNotification = null;
let tray = null;
let currentSizeKey = 'std';
let currentBubbleFontSize = 'std';
let currentStickyNotesSize = 'std';
let todoPanelOpacity = 1;
let calendarPanelOpacity = 1;
let emailPanelOpacity = 1;
let shortcutOpacity = 1;
let assistantOpacity = 1;
let currentLanguage = 'zh-TW';
let currentBallSpeed = 1.2;
let windowLayerMode = 'top';
let windowLayerController = null;
let isMoveMode = false; // 預設為穿透模式 (false)，但球體不穿透可互動
let isBubbleEnabled = true;
let isAssistantVisible = true;
let isAlarmActive = false;
let currentDockSide = 'right'; // 'right' (預設右側對齊) 或 'left' (左側對齊)
let savedWindowPosition = null;
let lastRunVersion = null;
let trayContextMenu = null;
let laptopShortcuts = [];
let laptopFixedLogos = {};
let laptopShortcutOrder = [];
let laptopBrowserAssignments = {};
let displayPositions = {};
let displayLayoutChangePending = false;
let displayLayoutTimer = null;
let assistantDisplayTarget = 'primary';
let resetPositionCorrectionTimer = null;
let focusModeUntil = 0;
let focusModeTimer = null;
let isNotificationActive = false;
let autoUpdateEnabled = true;
const MAX_LAPTOP_MENU_ACTIONS = 20;
const MAX_SHORTCUT_LOGO_BYTES = 10 * 1024 * 1024;

function getShortcutLogoDirectory() {
  return path.join(app.getPath('userData'), 'shortcut-logos');
}

function normalizeShortcutLogoPath(value) {
  const logoPath = String(value || '').trim();
  if (!logoPath || !path.isAbsolute(logoPath) || path.extname(logoPath).toLowerCase() !== '.png') return '';
  const logoDirectory = path.resolve(getShortcutLogoDirectory());
  const resolvedLogoPath = path.resolve(logoPath);
  const relative = path.relative(logoDirectory, resolvedLogoPath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(resolvedLogoPath)) return '';
  return resolvedLogoPath;
}

function getShortcutLogoUrl(logoPath) {
  const normalized = normalizeShortcutLogoPath(logoPath);
  if (!normalized) return '';
  try {
    return `data:image/png;base64,${fs.readFileSync(normalized).toString('base64')}`;
  } catch (error) {
    return '';
  }
}

function getEnvironmentPath(name) {
  const matchedKey = Object.keys(process.env).find(key => key.toLowerCase() === name.toLowerCase());
  return matchedKey ? process.env[matchedKey] : '';
}

function findRegisteredBrowserPath(executableName) {
  if (process.platform !== 'win32') return '';
  const registryKeys = [
    `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${executableName}`,
    `HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${executableName}`,
    `HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${executableName}`
  ];
  for (const registryKey of registryKeys) {
    try {
      const output = execFileSync('reg.exe', ['query', registryKey, '/ve'], {
        encoding: 'utf8',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore']
      });
      const match = output.match(/REG_(?:EXPAND_)?SZ\s+(.+?)\s*$/im);
      const registeredPath = String(match?.[1] || '').trim().replace(/^"|"$/g, '');
      if (registeredPath && fs.existsSync(registeredPath)) return registeredPath;
    } catch (error) { /* Browser is not registered in this location. */ }
  }
  return '';
}

function detectInstalledBrowsers() {
  const programFiles = getEnvironmentPath('ProgramFiles');
  const programFilesX86 = getEnvironmentPath('ProgramFiles(x86)');
  const localAppData = getEnvironmentPath('LOCALAPPDATA');
  const descriptors = [
    {
      name: 'Microsoft Edge', executable: 'msedge.exe',
      paths: [
        [programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'],
        [programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'],
        [localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe']
      ]
    },
    {
      name: 'Google Chrome', executable: 'chrome.exe',
      paths: [
        [programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'],
        [programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'],
        [localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe']
      ]
    },
    {
      name: 'Mozilla Firefox', executable: 'firefox.exe',
      paths: [
        [programFiles, 'Mozilla Firefox', 'firefox.exe'],
        [programFilesX86, 'Mozilla Firefox', 'firefox.exe'],
        [localAppData, 'Mozilla Firefox', 'firefox.exe']
      ]
    },
    {
      name: 'Brave', executable: 'brave.exe',
      paths: [
        [programFiles, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'],
        [programFilesX86, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'],
        [localAppData, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe']
      ]
    },
    {
      name: 'Opera', executable: 'opera.exe', useRegistry: false,
      paths: [
        [localAppData, 'Programs', 'Opera', 'launcher.exe'],
        [programFiles, 'Opera', 'launcher.exe'],
        [programFilesX86, 'Opera', 'launcher.exe']
      ]
    },
    {
      name: 'Opera GX', executable: 'opera.exe', useRegistry: false,
      paths: [[localAppData, 'Programs', 'Opera GX', 'launcher.exe']]
    },
    {
      name: 'Vivaldi', executable: 'vivaldi.exe',
      paths: [
        [localAppData, 'Vivaldi', 'Application', 'vivaldi.exe'],
        [programFiles, 'Vivaldi', 'Application', 'vivaldi.exe'],
        [programFilesX86, 'Vivaldi', 'Application', 'vivaldi.exe']
      ]
    },
    {
      name: 'Chromium', executable: 'chromium.exe',
      paths: [[localAppData, 'Chromium', 'Application', 'chrome.exe']]
    }
  ];
  const detected = [];
  const seenPaths = new Set();
  const addBrowser = (name, browserPath) => {
    if (!browserPath || !fs.existsSync(browserPath)) return;
    const normalizedPath = path.resolve(browserPath);
    const dedupeKey = normalizedPath.toLowerCase();
    if (seenPaths.has(dedupeKey)) return;
    seenPaths.add(dedupeKey);
    detected.push({ name, path: normalizedPath });
  };

  for (const descriptor of descriptors) {
    const standardPaths = descriptor.paths
      .filter(pathParts => pathParts[0])
      .map(pathParts => path.join(...pathParts));
    let browserPath = standardPaths.find(candidate => fs.existsSync(candidate));
    if (!browserPath && descriptor.useRegistry !== false) {
      browserPath = findRegisteredBrowserPath(descriptor.executable);
    }
    addBrowser(descriptor.name, browserPath);
  }
  return detected;
}

// Command interpreters and system launchers treat a URL argument as code, so they
// can never act as a "browser" even if one was saved by an earlier version.
const NON_BROWSER_EXECUTABLES = new Set([
  'powershell.exe', 'powershell_ise.exe', 'pwsh.exe', 'cmd.exe', 'wscript.exe', 'cscript.exe', 'mshta.exe',
  'rundll32.exe', 'regsvr32.exe', 'conhost.exe', 'wt.exe', 'bash.exe', 'wsl.exe', 'node.exe', 'python.exe',
  'pythonw.exe', 'msiexec.exe', 'explorer.exe', 'certutil.exe', 'bitsadmin.exe', 'schtasks.exe', 'reg.exe',
  'msbuild.exe', 'installutil.exe', 'forfiles.exe', 'hh.exe', 'control.exe', 'cmstp.exe', 'msxsl.exe'
]);
// Paths the user picked in a native dialog during this session.
const userChosenBrowserPaths = new Set();
const userChosenAppPaths = new Set();

function getPathKey(value) {
  return path.resolve(String(value || '')).toLowerCase();
}

function isUsableBrowserPath(browserPath) {
  if (!browserPath || !path.isAbsolute(browserPath) || !fs.existsSync(browserPath)) return false;
  if (NON_BROWSER_EXECUTABLES.has(path.basename(browserPath).toLowerCase())) return false;
  return process.platform !== 'win32' || path.extname(browserPath).toLowerCase() === '.exe';
}

// A browser may be assigned only if it was detected, chosen by the user in the
// file dialog, or is already part of the saved assignments.
function isApprovedBrowserPath(browserPath) {
  if (!isUsableBrowserPath(browserPath)) return false;
  const key = getPathKey(browserPath);
  return userChosenBrowserPaths.has(key)
    || Object.values(laptopBrowserAssignments).some(saved => getPathKey(saved) === key)
    || detectInstalledBrowsers().some(browser => getPathKey(browser.path) === key);
}

function normalizeBrowserAssignments(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const normalized = {};
  for (const [rawKey, rawBrowserPath] of Object.entries(input)) {
    const key = String(rawKey || '').trim();
    const browserPath = String(rawBrowserPath || '').trim();
    if (!/^(email|calendar|custom):.+/.test(key) || !browserPath) continue;
    if (!isUsableBrowserPath(browserPath)) continue;
    normalized[key] = browserPath;
  }
  return normalized;
}

async function openWebUrl(url, assignmentKey = '') {
  const browserPath = laptopBrowserAssignments[String(assignmentKey || '')];
  if (!browserPath || !isUsableBrowserPath(browserPath)) {
    await shell.openExternal(url);
    return;
  }

  try {
    await new Promise((resolve, reject) => {
      const child = spawn(browserPath, [url], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });
      child.once('error', reject);
      child.once('spawn', () => {
        child.unref();
        resolve();
      });
    });
  } catch (error) {
    console.warn(`Unable to launch assigned browser for ${assignmentKey}:`, error.message);
    await shell.openExternal(url);
  }
}

function normalizeLaptopShortcut(item) {
  if (!item || !['app', 'website'].includes(item.type) || typeof item.target !== 'string') return null;
  const target = item.target.trim();
  if (!target) return null;
  const shortcut = {
    id: String(item.id || `shortcut-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    type: item.type,
    name: String(item.name || (item.type === 'app' ? path.basename(target, path.extname(target)) : target)).trim().slice(0, 40),
    letter: /^[A-Z]$/.test(String(item.letter || '').toUpperCase())
      ? String(item.letter).toUpperCase()
      : ((String(item.name || '').toUpperCase().match(/[A-Z]/) || ['A'])[0]),
    color: ['#0ea5e9', '#2563eb', '#4f46e5', '#7c3aed', '#c026d3', '#db2777', '#e11d48', '#ea580c', '#d97706', '#16a34a', '#0d9488', '#475569', '#ffffff', '#e2e8f0', '#bae6fd', '#bfdbfe', '#ddd6fe', '#fbcfe8', '#fde68a', '#bbf7d0']
      .includes(String(item.color || '').toLowerCase()) ? String(item.color).toLowerCase() : '#0ea5e9',
    target
  };
  const logoPath = normalizeShortcutLogoPath(item.logoPath);
  if (logoPath) shortcut.logoPath = logoPath;
  return shortcut;
}

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
      if (Number.isFinite(Number(data.shortcutOpacity))) shortcutOpacity = Math.max(0.3, Math.min(1, Number(data.shortcutOpacity)));
      if (Number.isFinite(Number(data.assistantOpacity))) assistantOpacity = Math.max(0.3, Math.min(1, Number(data.assistantOpacity)));
      if (data.language && ['zh-TW', 'en'].includes(data.language)) {
        currentLanguage = data.language;
      }
      windowLayerMode = normalizeWindowLayerMode(data.windowLayerMode, data.isAlwaysOnTop);
      if (typeof data.isMoveMode === 'boolean') {
        isMoveMode = data.isMoveMode;
      }
      if (typeof data.isBubbleEnabled === 'boolean') {
        isBubbleEnabled = data.isBubbleEnabled;
      }
      if (typeof data.isAssistantVisible === 'boolean') {
        isAssistantVisible = data.isAssistantVisible;
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
      if (['primary', 'external'].includes(data.assistantDisplayTarget)) assistantDisplayTarget = data.assistantDisplayTarget;
      displayPositions = data.displayPositions && typeof data.displayPositions === 'object'
        ? data.displayPositions : {};
      focusModeUntil = Number.isFinite(Number(data.focusModeUntil)) ? Number(data.focusModeUntil) : 0;
      autoUpdateEnabled = data.autoUpdateEnabled !== false;
      if (typeof data.lastRunVersion === 'string') {
        lastRunVersion = data.lastRunVersion;
      }
      laptopFixedLogos = data.laptopFixedLogos || {};
      laptopShortcuts = Array.isArray(data.laptopShortcuts)
        ? data.laptopShortcuts.map(normalizeLaptopShortcut).filter(Boolean)
        : [];
      laptopShortcutOrder = Array.isArray(data.laptopShortcutOrder)
        ? data.laptopShortcutOrder.map(value => String(value)).filter(Boolean)
        : [];
      laptopBrowserAssignments = normalizeBrowserAssignments(data.laptopBrowserAssignments);
      // Migrate the earlier single-application preference without losing it.
      if (!laptopShortcuts.length && typeof data.customLaptopAppPath === 'string' && data.customLaptopAppPath) {
        const migrated = normalizeLaptopShortcut({ type: 'app', target: data.customLaptopAppPath });
        if (migrated) laptopShortcuts.push(migrated);
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
    rememberCurrentDisplayPosition();
    const prefPath = getPreferencesPath();
    const data = {
      sizeKey: currentSizeKey,
      bubbleFontSize: currentBubbleFontSize,
      stickyNotesSize: currentStickyNotesSize,
      todoPanelOpacity,
      calendarPanelOpacity,
      emailPanelOpacity,
      shortcutOpacity,
      assistantOpacity,
      language: currentLanguage,
      windowLayerMode,
      isAlwaysOnTop: windowLayerMode === 'top',
      isMoveMode: isMoveMode,
      isBubbleEnabled: isBubbleEnabled,
      isAssistantVisible,
      ballSpeed: currentBallSpeed,
      dockSide: currentDockSide,
      lastRunVersion: lastRunVersion,
      laptopShortcuts,
      laptopFixedLogos,
      laptopShortcutOrder,
      laptopBrowserAssignments,
      displayPositions,
      assistantDisplayTarget,
      focusModeUntil,
      autoUpdateEnabled,
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

function getCurrentDisplayLayoutKey() {
  try {
    if (typeof screen === 'undefined' || !screen?.getAllDisplays) return '';
    return getDisplayLayoutKey(screen.getAllDisplays());
  } catch (error) {
    return '';
  }
}

function rememberCurrentDisplayPosition() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const key = getCurrentDisplayLayoutKey();
  if (!key) return;
  const [x, y] = mainWindow.getPosition();
  displayPositions[key] = { x, y, dockSide: currentDockSide };
}

function getSavedDisplayPosition() {
  const key = getCurrentDisplayLayoutKey();
  const position = key ? displayPositions[key] : null;
  return position && Number.isFinite(position.x) && Number.isFinite(position.y) ? position : null;
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
    positionSettingsWindowOnAssistantDisplay();
  }
}

function createPetWindow() {
  const primaryDisplay = getPreferredAssistantDisplay();
  const { workArea } = primaryDisplay;

  const windowSize = getCompositeWindowSize(currentSizeKey, currentStickyNotesSize);
  const winW = windowSize.width;
  let winH = Math.max(windowSize.height, workArea.height - 10);

  let winX = Math.round(workArea.x + workArea.width - winW - 20);
  let winY = Math.round(workArea.y + workArea.height - winH - 10);

  currentDockSide = 'right';

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
    alwaysOnTop: windowLayerMode === 'top',
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

  windowLayerController = new WindowLayerController(mainWindow, windowLayerMode);
  mainWindow.webContents.on('did-start-loading', () => {
    isNotificationActive = false;
    windowLayerController?.resetNotifications();
  });
  mainWindow.webContents.on('render-process-gone', () => windowLayerController?.resetNotifications());

  ipcMain.on('set-notification-active', (event, active) => {
    if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) return;
    if (typeof active !== 'boolean') return;
    isNotificationActive = active;
    windowLayerController?.setNotificationActive(active);
  });

  // Keep the transparent host click-through until the renderer detects an
  // interactive control or, in move mode, the bear itself.
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  // Handle selective mouse event ignoring from renderer (for interactive ball)
  ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (isAlarmActive && !isMoveMode) {
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
    if (displayLayoutChangePending) return;
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
    mainWindow.webContents.send('assistant-visibility-changed', isAssistantVisible, true);
    mainWindow.webContents.send('focus-mode-updated', getFocusModeState(), true);
    mainWindow.webContents.send('language-changed', currentLanguage, true);
    mainWindow.webContents.send('panel-opacity-updated', { todo: todoPanelOpacity, calendar: calendarPanelOpacity, email: emailPanelOpacity, shortcut: shortcutOpacity, assistant: assistantOpacity }, true);
    // Restore the persisted mode in both processes. Without this event the tray
    // showed move mode as enabled after restart, while the renderer still
    // rejected every drag because its local state remained false.
    mainWindow.webContents.send('move-mode-changed', isMoveMode, true);
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
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
  ipcMain.on('ball-speed-changed', (event, speed) => {
    if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) return;
    if (typeof speed !== 'number' || !Number.isFinite(speed) || speed < 0.2 || speed > 5) return;
    if (currentBallSpeed !== speed) setBallSpeed(speed, true);
  });

  ipcMain.on('show-context-menu', event => {
    if (!trayContextMenu || !mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) return;
    const controller = windowLayerController;
    controller?.setMenuActive(true);
    try {
      trayContextMenu.popup({ window: mainWindow, callback: () => controller?.setMenuActive(false) });
    } catch (error) {
      controller?.setMenuActive(false);
      console.error('無法開啟科技球選單：', error);
    }
  });

  const getLaptopShortcuts = () => laptopShortcuts.map(({ id, type, name, letter, color, logoPath }) => ({
    id,
    type,
    name,
    letter,
    color,
    logoUrl: getShortcutLogoUrl(logoPath)
  }));
  const getEnabledLaptopEmailAccounts = () => (emailService?.config?.accounts || [])
      .filter(account => account.enabled !== false)
      .map(account => ({ id: String(account.id), name: account.name || account.user || 'Email', provider: account.provider || 'gmail' }));
  const getEnabledLaptopCalendars = () => (calendarService?.config?.calendars || [])
      .filter(calendar => calendar.enabled !== false)
      .map(calendar => ({ id: String(calendar.id), name: calendar.name || 'Calendar' }));
  const getLaptopFixedActionCount = () => Math.min(
    MAX_LAPTOP_MENU_ACTIONS,
    2 + getEnabledLaptopEmailAccounts().length + getEnabledLaptopCalendars().length
  );
  const getLaptopCustomShortcutLimit = () => Math.max(0, MAX_LAPTOP_MENU_ACTIONS - getLaptopFixedActionCount());
  const getLaptopMenuData = () => {
    const emailAccounts = getEnabledLaptopEmailAccounts().slice(0, MAX_LAPTOP_MENU_ACTIONS - 2);
    const remainingCalendarSlots = Math.max(0, MAX_LAPTOP_MENU_ACTIONS - 2 - emailAccounts.length);
    const calendars = getEnabledLaptopCalendars().slice(0, remainingCalendarSlots);
    const customShortcutSlots = Math.max(0, MAX_LAPTOP_MENU_ACTIONS - 2 - emailAccounts.length - calendars.length);
    return {
      shortcuts: getLaptopShortcuts().slice(0, customShortcutSlots),
      order: [...laptopShortcutOrder],
      fixedLogos: Object.fromEntries(Object.entries(laptopFixedLogos).map(([key, value]) => [key, getShortcutLogoUrl(value)])),
      maxShortcuts: MAX_LAPTOP_MENU_ACTIONS,
      emailAccounts,
      calendars
    };
  };

  ipcMain.handle('laptop-get-shortcuts', () => getLaptopMenuData());
  ipcMain.handle('laptop-save-shortcut-order', (event, input) => {
    const incoming = Array.isArray(input) ? input.map(value => String(value)).filter(Boolean) : [];
    laptopShortcutOrder = [...new Set(incoming)];
    savePetPreferences();
    return { ok: true, order: [...laptopShortcutOrder] };
  });
  ipcMain.handle('laptop-get-shortcut-settings', () => ({
    shortcuts: laptopShortcuts.map(shortcut => ({
      ...shortcut,
      logoUrl: getShortcutLogoUrl(shortcut.logoPath)
    })),
    fixedShortcuts: [
      { id: 'sticky', name: currentLanguage === 'en' ? 'Sticky notes' : '便利貼', letter: '📝' },
      { id: 'knowledge', name: currentLanguage === 'en' ? 'Professional knowledge' : '專業知識', letter: '🧠' },
      ...getEnabledLaptopEmailAccounts().map(item => ({ ...item, id: `email:${item.id}`, letter: '✉' })),
      ...getEnabledLaptopCalendars().map(item => ({ ...item, id: `calendar:${item.id}`, letter: '▦' }))
    ].map(item => ({ ...item, fixed: true, logoPath: laptopFixedLogos[item.id] || '', logoUrl: getShortcutLogoUrl(laptopFixedLogos[item.id]) })),
    maxShortcuts: getLaptopCustomShortcutLimit(),
    maxMenuActions: MAX_LAPTOP_MENU_ACTIONS,
    fixedActionCount: getLaptopFixedActionCount(),
    browserAssignments: { ...laptopBrowserAssignments },
    installedBrowsers: detectInstalledBrowsers()
  }));

  ipcMain.handle('laptop-choose-browser', async () => {
    const result = await dialog.showOpenDialog(settingsWindow || mainWindow || undefined, {
      title: currentLanguage === 'en' ? 'Choose a web browser' : '選擇網頁瀏覽器',
      properties: ['openFile'],
      filters: process.platform === 'win32'
        ? [{ name: currentLanguage === 'en' ? 'Browser applications' : '瀏覽器應用程式', extensions: ['exe'] }]
        : []
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    if (isUsableBrowserPath(result.filePaths[0])) userChosenBrowserPaths.add(getPathKey(result.filePaths[0]));
    return { canceled: false, path: result.filePaths[0] };
  });

  ipcMain.handle('laptop-save-browser-settings', (event, input) => {
    const requested = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const invalidPath = Object.entries(requested).some(([rawKey, rawBrowserPath]) => {
      const key = String(rawKey || '').trim();
      const browserPath = String(rawBrowserPath || '').trim();
      if (!browserPath) return false;
      return !/^(email|calendar|custom):.+/.test(key) || !isApprovedBrowserPath(browserPath);
    });
    if (invalidPath) {
      return { ok: false, error: currentLanguage === 'en' ? 'Please choose a valid browser application.' : '請選擇有效的瀏覽器應用程式。' };
    }
    laptopBrowserAssignments = normalizeBrowserAssignments(requested);
    savePetPreferences();
    return { ok: true, browserAssignments: { ...laptopBrowserAssignments } };
  });

  ipcMain.handle('laptop-choose-custom-app', async () => {
    const result = await dialog.showOpenDialog(mainWindow || undefined, {
      title: currentLanguage === 'en' ? 'Choose an application' : '選擇要開啟的應用程式',
      properties: ['openFile'],
      filters: process.platform === 'win32'
        ? [{ name: currentLanguage === 'en' ? 'Applications' : '應用程式', extensions: ['exe', 'lnk', 'bat', 'cmd'] }]
        : []
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const selectedPath = result.filePaths[0];
    userChosenAppPaths.add(getPathKey(selectedPath));
    return { canceled: false, target: selectedPath, suggestedName: path.basename(selectedPath, path.extname(selectedPath)) };
  });

  ipcMain.handle('laptop-choose-shortcut-logo', async () => {
    try {
      const result = await dialog.showOpenDialog(settingsWindow || mainWindow || undefined, {
        title: currentLanguage === 'en' ? 'Choose a shortcut logo' : '選擇快捷 Logo 圖片',
        properties: ['openFile'],
        filters: [{
          name: currentLanguage === 'en' ? 'Logo images' : 'Logo 圖片',
          extensions: ['png', 'jpg', 'jpeg', 'webp']
        }]
      });
      if (result.canceled || !result.filePaths[0]) return { canceled: true };
      const sourcePath = result.filePaths[0];
      const sourceStats = fs.statSync(sourcePath);
      if (!sourceStats.isFile() || sourceStats.size > MAX_SHORTCUT_LOGO_BYTES) {
        return { canceled: false, ok: false, error: currentLanguage === 'en'
          ? 'Choose an image smaller than 10 MB.'
          : '請選擇小於 10 MB 的圖片。' };
      }
      const sourceImage = nativeImage.createFromPath(sourcePath);
      if (sourceImage.isEmpty()) {
        return { canceled: false, ok: false, error: currentLanguage === 'en'
          ? 'The selected image could not be read.'
          : '無法讀取所選圖片。' };
      }
      const size = sourceImage.getSize();
      const side = Math.min(size.width, size.height);
      const cropped = sourceImage.crop({
        x: Math.floor((size.width - side) / 2),
        y: Math.floor((size.height - side) / 2),
        width: side,
        height: side
      }).resize({ width: 128, height: 128, quality: 'best' });
      const logoDirectory = getShortcutLogoDirectory();
      fs.mkdirSync(logoDirectory, { recursive: true });
      const logoPath = path.join(logoDirectory, `shortcut-logo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`);
      fs.writeFileSync(logoPath, cropped.toPNG());
      return { canceled: false, ok: true, logoPath, logoUrl: getShortcutLogoUrl(logoPath) };
    } catch (error) {
      return { canceled: false, ok: false, error: error.message };
    }
  });

  ipcMain.handle('laptop-replace-shortcuts', (event, input) => {
    try {
      const incoming = Array.isArray(input) ? input : (input?.shortcuts || []);
      const customShortcutLimit = getLaptopCustomShortcutLimit();
      if (incoming.length > customShortcutLimit) {
        return {
          ok: false,
          limitReached: true,
          error: currentLanguage === 'en'
            ? `Laptop shortcuts are limited to ${MAX_LAPTOP_MENU_ACTIONS} total (${customShortcutLimit} custom shortcuts are currently available).`
            : `筆電快捷總數最多 ${MAX_LAPTOP_MENU_ACTIONS} 個（目前可設定 ${customShortcutLimit} 個自訂捷徑）。`
        };
      }
      const normalized = incoming.map(item => {
        let target = String(item?.target || '').trim();
        if (!String(item?.name || '').trim()) throw new Error('Every shortcut requires a name.');
        if (item?.type === 'website') {
          const parsed = new URL(target);
          if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only HTTP and HTTPS websites are supported.');
          target = parsed.href;
        } else if (item?.type !== 'app' || !fs.existsSync(target) || !(
          // Applications must come from the file dialog or an already saved shortcut.
          userChosenAppPaths.has(getPathKey(target))
          || laptopShortcuts.some(saved => saved.type === 'app' && getPathKey(saved.target) === getPathKey(target))
        )) {
          throw new Error('Please choose a valid application.');
        }
        return normalizeLaptopShortcut({ ...item, target });
      });
      for (const item of input?.fixedShortcuts || []) {
        if (item.id === 'sticky' || item.id === 'knowledge' || /^(email|calendar):.+$/.test(item.id)) {
          laptopFixedLogos[item.id] = normalizeShortcutLogoPath(item.logoPath);
        }
      }
      laptopShortcuts = normalized;
      savePetPreferences();
      return { ok: true, shortcuts: getLaptopShortcuts() };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('laptop-open-shortcut', async (event, shortcutId) => {
    const shortcut = laptopShortcuts.find(item => item.id === String(shortcutId));
    if (!shortcut) return { ok: false, error: 'Shortcut not found.' };
    try {
      if (shortcut.type === 'website') {
        await openWebUrl(shortcut.target, `custom:${shortcut.id}`);
        return { ok: true };
      }
      if (!fs.existsSync(shortcut.target)) return { ok: false, error: 'Application no longer exists.' };
      const errorMessage = await shell.openPath(shortcut.target);
      return errorMessage ? { ok: false, error: errorMessage } : { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('laptop-open-account', async (event, input) => {
    try {
      if (input?.type === 'email') {
        const account = (emailService?.config?.accounts || []).find(item => String(item.id) === String(input.id));
        if (!account) return { ok: false, error: 'Email account not found.' };
        const user = encodeURIComponent(account.user || '');
        const url = account.provider === 'outlook'
          ? `https://outlook.office.com/mail/?login_hint=${user}`
          : account.provider === 'gmail'
            ? `https://mail.google.com/mail/?authuser=${user}`
            : 'mailto:';
        await openWebUrl(url, `email:${account.id}`);
        return { ok: true };
      }
      if (input?.type === 'calendar') {
        const calendar = (calendarService?.config?.calendars || []).find(item => String(item.id) === String(input.id));
        if (!calendar) return { ok: false, error: 'Calendar not found.' };
        let url = 'https://calendar.google.com/calendar/u/0/r';
        try {
          const sourceUrl = new URL(calendar.url || '');
          const segments = sourceUrl.pathname.split('/').filter(Boolean);
          const icalIndex = segments.indexOf('ical');
          const calendarId = icalIndex >= 0 ? decodeURIComponent(segments[icalIndex + 1] || '') : '';
          if (calendarId) url += `?cid=${encodeURIComponent(calendarId)}`;
        } catch (error) { /* Fall back to the main Google Calendar page. */ }
        await openWebUrl(url, `calendar:${calendar.id}`);
        return { ok: true };
      }
      return { ok: false, error: 'Unsupported account type.' };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('laptop-open-action', async (event, action) => {
    try {
      if (action === 'email') {
        const primaryAccount = (emailService?.config?.accounts || []).find(account => account.enabled !== false);
        const provider = primaryAccount?.provider || 'gmail';
        const url = provider === 'outlook'
          ? 'https://outlook.office.com/mail/'
          : provider === 'gmail'
            ? 'https://mail.google.com/mail/u/0/#inbox'
            : 'mailto:';
        await openWebUrl(url, primaryAccount ? `email:${primaryAccount.id}` : '');
        return { ok: true };
      }
      if (action === 'calendar') {
        const primaryCalendar = (calendarService?.config?.calendars || []).find(calendar => calendar.enabled !== false);
        const url = 'https://calendar.google.com/calendar/u/0/r';
        await openWebUrl(url, primaryCalendar ? `calendar:${primaryCalendar.id}` : '');
        return { ok: true };
      }
      if (action === 'knowledge') {
        openKnowledgeCardWindow();
        return { ok: true };
      }
      return { ok: false, error: 'Unsupported laptop action.' };
    } catch (error) {
      return { ok: false, error: error.message };
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

  ipcMain.handle('natural-language-create', (event, input) => {
    const parsed = parseNaturalLanguageTask(input);
    if (!parsed.success) return parsed;
    if (!stickyNotesService) return { success: false, error: 'Sticky notes are not ready.' };
    return { ...stickyNotesService.create(parsed), parsed };
  });

  ipcMain.handle('get-focus-mode', () => getFocusModeState());
  ipcMain.handle('set-focus-mode', (event, input = {}) => {
    setFocusMode(input.minutes, input.untilTomorrow === true);
    return { success: true, ...getFocusModeState() };
  });

  ipcMain.handle('get-update-settings', () => ({ enabled: autoUpdateEnabled, state: updateService?.getStatus() || null }));
  ipcMain.handle('set-update-settings', (event, input = {}) => {
    autoUpdateEnabled = input.enabled !== false;
    updateService?.setEnabled(autoUpdateEnabled);
    savePetPreferences();
    return { success: true, enabled: autoUpdateEnabled };
  });
  ipcMain.handle('check-for-updates', () => updateService?.check(true) || { success: false, error: 'Update service is not ready.' });
  ipcMain.handle('install-update', () => updateService?.install() || { success: false, error: 'Update service is not ready.' });

  ipcMain.handle('set-language', (event, lang) => {
    setLanguage(lang);
    return { success: true, language: currentLanguage };
  });

  // Bubble Font Size IPC Handlers
  registerAssistantSettingsIpc();
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

  ipcMain.handle('get-panel-opacity', () => ({ todo: todoPanelOpacity, calendar: calendarPanelOpacity, email: emailPanelOpacity, shortcut: shortcutOpacity, assistant: assistantOpacity }));
  ipcMain.handle('preview-panel-opacity', (event, input = {}) => {
    const requestedTodo = Number(input.todo);
    const requestedCalendar = Number(input.calendar);
    const requestedEmail = Number(input.email);
    const requestedShortcut = Number(input.shortcut);
    const requestedAssistant = Number(input.assistant);
    const todo = Number.isFinite(requestedTodo) ? Math.max(0.3, Math.min(1, requestedTodo)) : todoPanelOpacity;
    const calendar = Number.isFinite(requestedCalendar) ? Math.max(0.3, Math.min(1, requestedCalendar)) : calendarPanelOpacity;
    const email = Number.isFinite(requestedEmail) ? Math.max(0.3, Math.min(1, requestedEmail)) : emailPanelOpacity;
    const shortcut = Number.isFinite(requestedShortcut) ? Math.max(0.3, Math.min(1, requestedShortcut)) : shortcutOpacity;
    const assistant = Number.isFinite(requestedAssistant) ? Math.max(0.3, Math.min(1, requestedAssistant)) : assistantOpacity;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('panel-opacity-updated', { todo, calendar, email, shortcut, assistant });
    }
    return { success: true, todo, calendar, email, shortcut, assistant };
  });
  ipcMain.handle('set-panel-opacity', (event, input = {}) => {
    todoPanelOpacity = Math.max(0.3, Math.min(1, Number(input.todo) || 1));
    calendarPanelOpacity = Math.max(0.3, Math.min(1, Number(input.calendar) || 1));
    emailPanelOpacity = Math.max(0.3, Math.min(1, Number(input.email) || 1));
    shortcutOpacity = Math.max(0.3, Math.min(1, Number(input.shortcut) || 1));
    assistantOpacity = Math.max(0.3, Math.min(1, Number(input.assistant) || 1));
    savePetPreferences();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('panel-opacity-updated', { todo: todoPanelOpacity, calendar: calendarPanelOpacity, email: emailPanelOpacity, shortcut: shortcutOpacity, assistant: assistantOpacity });
    }
    return { success: true, todo: todoPanelOpacity, calendar: calendarPanelOpacity, email: emailPanelOpacity, shortcut: shortcutOpacity, assistant: assistantOpacity };
  });

  // Health Reminder IPC Handlers
  ipcMain.handle('health-test-reminder', (event, options = {}) => {
    triggerHealthReminder(options.soundEnabled !== false);
    return { success: true };
  });

  ipcMain.handle('knowledge-cards-get-config', () => {
    return knowledgeCardsService?.getConfig() || { enabled: false, intervalMinutes: 20, cards: [] };
  });
  ipcMain.handle('knowledge-cards-save-config', (event, input = {}) => {
    return knowledgeCardsService?.saveConfig(input) || { success: false, error: 'Knowledge cards are not ready.' };
  });
  ipcMain.handle('knowledge-cards-add', (event, input = {}) => {
    return knowledgeCardsService?.addCard(input) || { success: false, error: 'Knowledge cards are not ready.' };
  });
  ipcMain.handle('knowledge-cards-test-reminder', () => {
    return knowledgeCardsService?.trigger(true) || { success: false, error: 'Knowledge cards are not ready.' };
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
    windowLayerController?.dispose();
    windowLayerController = null;
    mainWindow = null;
    isNotificationActive = false;
  });
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
  if (isFocusModeActive()) return;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('health-reminder', {
      soundEnabled: soundEnabled !== false,
      timestamp: Date.now()
    });
  }
}

function getCurrentAssistantDisplay() {
  if (!mainWindow || mainWindow.isDestroyed()) return screen.getPrimaryDisplay();
  const bounds = mainWindow.getBounds();
  const anchor = getAssistantDisplayAnchor(bounds, currentDockSide);
  return screen.getDisplayNearestPoint(anchor)
    || screen.getDisplayMatching(bounds)
    || screen.getPrimaryDisplay();
}

function getPreferredAssistantDisplay() {
  return selectAssistantDisplay(screen.getAllDisplays(), screen.getPrimaryDisplay(), assistantDisplayTarget);
}

function getAssistantSettings() {
  return {
    windowLayerMode, moveMode: isMoveMode, displayTarget: assistantDisplayTarget,
    sizeKey: currentSizeKey, stickyNotesSize: currentStickyNotesSize,
    bubbleFontSize: currentBubbleFontSize, ballSpeed: currentBallSpeed
  };
}

function notifyAssistantSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('assistant-settings-updated', getAssistantSettings());
  }
}

function getIpcSenderRole(sender) {
  const owner = [[mainWindow, 'main'], [settingsWindow, 'settings'], [knowledgeCardWindow, 'knowledge']]
    .find(([window]) => window && !window.isDestroyed() && window.webContents === sender);
  return owner ? owner[1] : null;
}

function registerAssistantSettingsIpc() {
  const authorize = event => {
    if (!settingsWindow || settingsWindow.isDestroyed() || event.sender !== settingsWindow.webContents) throw new Error('無法存取小助手設定。');
  };
  ipcMain.handle('get-assistant-settings', event => { authorize(event); return getAssistantSettings(); });
  ipcMain.handle('set-assistant-settings', (event, input) => {
    authorize(event);
    const choices = {
      windowLayerMode: ['top', 'bottom', 'bottom-notify'], displayTarget: ['primary', 'external'],
      sizeKey: ['mini', 'std', 'lg'], stickyNotesSize: ['sm', 'std', 'lg'], bubbleFontSize: ['sm', 'std', 'lg', 'xl']
    };
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('小助手設定格式無效。');
    for (const [key, value] of Object.entries(input)) {
      const valid = Object.hasOwn(choices, key) ? choices[key].includes(value)
        : key === 'moveMode' || key === 'resetPosition' ? typeof value === 'boolean'
        : key === 'ballSpeed' && typeof value === 'number' && Number.isFinite(value) && value >= 0.2 && value <= 5;
      if (!valid) throw new Error('小助手設定值無效。');
    }
    if ('windowLayerMode' in input) setWindowLayerMode(input.windowLayerMode);
    if ('sizeKey' in input) setAssistantSize(input.sizeKey);
    if ('stickyNotesSize' in input) setStickyNotesSize(input.stickyNotesSize);
    if ('bubbleFontSize' in input) setBubbleFontSize(input.bubbleFontSize);
    if ('ballSpeed' in input) setBallSpeed(input.ballSpeed);
    if ('moveMode' in input) setMoveMode(input.moveMode);
    if ('displayTarget' in input) setAssistantDisplayTarget(input.displayTarget);
    else if (input.resetPosition) resetPosition();
    return getAssistantSettings();
  });
}

function setAssistantDisplayTarget(target) {
  assistantDisplayTarget = target;
  resetPosition();
  updateTrayMenu();
}

function resetPosition(display = null) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const targetDisplay = display?.workArea ? display : getPreferredAssistantDisplay();
  if (!targetDisplay?.workArea) return;
  const targetDisplayId = targetDisplay.id;

  const applyBottomRightBounds = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const refreshedDisplay = targetDisplayId === undefined || targetDisplayId === null
      ? targetDisplay
      : (screen.getAllDisplays().find(candidate => String(candidate.id) === String(targetDisplayId)) || getPreferredAssistantDisplay());
    if (!refreshedDisplay?.workArea) return;
    const [width] = mainWindow.getSize();
    const bearSize = (SIZE_PRESETS[currentSizeKey] || SIZE_PRESETS.std).bearSize;
    const height = getMonitorFittedWindowHeight(refreshedDisplay.workArea.height, bearSize);
    const bounds = getBottomRightWindowBounds({ width, height }, refreshedDisplay.workArea);
    currentDockSide = 'right';
    mainWindow.webContents.send('dock-side-changed', 'right');
    mainWindow.setBounds(bounds, false);
    savedWindowPosition = { x: bounds.x, y: bounds.y };
    savePetPreferences();
    positionSettingsWindowOnAssistantDisplay();
  };

  clearTimeout(resetPositionCorrectionTimer);
  applyBottomRightBounds();
  resetPositionCorrectionTimer = setTimeout(() => {
    resetPositionCorrectionTimer = null;
    applyBottomRightBounds();
  }, 200);
}

function setMoveMode(enabled) {
  isMoveMode = enabled;
  savePetPreferences();
  if (!mainWindow) return;
  mainWindow.setIgnoreMouseEvents(true, { forward: true });
  mainWindow.webContents.send('move-mode-changed', isMoveMode);
  updateTrayMenu();
}

function setBallSpeed(speed, silent = false) {
  const parsedSpeed = Number(speed);
  currentBallSpeed = Number.isFinite(parsedSpeed) && parsedSpeed > 0 ? parsedSpeed : 1.2;
  savePetPreferences();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('set-ball-speed', currentBallSpeed, silent);
  }
  updateTrayMenu();
}

function setBubbleEnabled(enabled) {
  isBubbleEnabled = !!enabled;
  savePetPreferences();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('set-quotes-enabled', isBubbleEnabled);
  }
  updateTrayMenu();
}

function setAssistantVisible(visible) {
  isAssistantVisible = visible !== false;
  savePetPreferences();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.showInactive();
  mainWindow.webContents.send('assistant-visibility-changed', isAssistantVisible);
  updateTrayMenu();
}

function setWindowLayerMode(mode) {
  windowLayerMode = normalizeWindowLayerMode(mode);
  windowLayerController?.setMode(windowLayerMode);
  savePetPreferences();
  updateTrayMenu();
}

function isFocusModeActive() {
  return focusModeUntil > Date.now();
}

function getFocusModeState() {
  const active = isFocusModeActive();
  return { active, until: active ? focusModeUntil : 0 };
}

function scheduleFocusModeEnd() {
  clearTimeout(focusModeTimer);
  focusModeTimer = null;
  if (!isFocusModeActive()) return;
  focusModeTimer = setTimeout(() => {
    focusModeUntil = 0;
    savePetPreferences();
    notifyFocusModeChanged();
  }, Math.min(2147483647, focusModeUntil - Date.now()));
}

function notifyFocusModeChanged() {
  const state = getFocusModeState();
  for (const win of [mainWindow, settingsWindow]) {
    if (win && !win.isDestroyed()) win.webContents.send('focus-mode-updated', state);
  }
  updateTrayMenu();
}

function setFocusMode(minutes, untilTomorrow = false) {
  if (untilTomorrow) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(8, 0, 0, 0);
    focusModeUntil = tomorrow.getTime();
  } else {
    const duration = Number(minutes);
    focusModeUntil = Number.isFinite(duration) && duration > 0 ? Date.now() + duration * 60000 : 0;
  }
  savePetPreferences();
  scheduleFocusModeEnd();
  notifyFocusModeChanged();
}

async function configureDesktopIconPermissions(mode) {
  if (!desktopOrganizer || desktopOrganizer.permissionOperation) return;
  const service = new DesktopIconPermissions(app.getPath('userData'), () => desktopOrganizer.desktopPaths());
  try {
    const result = await desktopOrganizer.withIconServiceStopped(async () => {
      if (['Enable', 'Disable'].includes(mode)) { service.setBrokerEnabled(mode === 'Enable'); return { changed: 0, errors: [] }; }
      const result = await service.run(mode);
      if (mode === 'Install') service.setBrokerEnabled(true);
      return result;
    });
    const en = currentLanguage === 'en';
    dialog.showMessageBox({ type: result.errors?.length ? 'warning' : 'info', message: en ? 'Desktop icon permissions updated.' : '桌面圖示權限設定完成。', detail: result.errors?.length ? result.errors.join('\n') : en ? `Updated ${result.changed || 0} shortcut(s). Original file paths are retained.` : `已更新 ${result.changed || 0} 個捷徑，檔案保留原路徑。` });
  } catch (error) {
    dialog.showMessageBox({ type: 'error', message: currentLanguage === 'en' ? 'Unable to update desktop icon permissions.' : '桌面圖示權限設定未完成。', detail: error.message });
  } finally { updateTrayMenu(); }
}

function updateTrayMenu() {
  notifyAssistantSettings();
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
      label: isAssistantVisible ? t.hideAssistant : t.showAssistant,
      click: () => setAssistantVisible(!isAssistantVisible)
    },
    {
      label: t.toggleQuotes,
      type: 'checkbox',
      checked: isBubbleEnabled,
      click: (menuItem) => setBubbleEnabled(menuItem.checked)
    },
    {
      label: currentLanguage === 'en' ? 'Desktop organizer' : '桌面整理工具',
      submenu: [
        { label: currentLanguage === 'en' ? 'New organizer window' : '新增整理視窗', click: () => desktopOrganizer?.create() },
        { label: currentLanguage === 'en' ? 'Show all organizer windows' : '顯示所有整理視窗', enabled: !!desktopOrganizer?.boards.length, click: () => desktopOrganizer?.restore() },
        {
          label: currentLanguage === 'en' ? 'Desktop icon permissions' : '桌面圖示權限',
          submenu: [
            { label: currentLanguage === 'en' ? 'Authorize collected shortcuts once' : '一次授權已收納的捷徑', click: () => configureDesktopIconPermissions('Grant') },
            { label: currentLanguage === 'en' ? 'Restore shortcut permissions' : '還原捷徑原本權限', click: () => configureDesktopIconPermissions('Restore') },
            { type: 'separator' },
            { label: currentLanguage === 'en' ? 'Install or repair background helper' : '安裝／修復背景輔助程序', click: () => configureDesktopIconPermissions('Install') },
            { label: currentLanguage === 'en' ? 'Use background helper' : '使用背景輔助程序', type: 'checkbox', enabled: !!readBroker(app.getPath('userData')), checked: readBroker(app.getPath('userData'))?.enabled === true, click: item => configureDesktopIconPermissions(item.checked ? 'Enable' : 'Disable') },
            { label: currentLanguage === 'en' ? 'Remove background helper' : '移除背景輔助程序', enabled: !!readBroker(app.getPath('userData')), click: () => configureDesktopIconPermissions('Remove') }
          ]
        },
        {
          label: currentLanguage === 'en' ? 'Recover organizer window' : '復原整理視窗',
          enabled: !!desktopOrganizer?.boards.length,
          submenu: (desktopOrganizer?.boards || []).map(board => ({
            label: board.title,
            click: async () => {
              try { await desktopOrganizer.recover(board); }
              catch {
                dialog.showMessageBox({ type: 'error', message: currentLanguage === 'en' ? 'Unable to recover this organizer window. Finish any file drag and try again.' : '無法復原整理視窗，請先完成檔案拖曳，再試一次。' });
              }
            }
          }))
        },
        ...(desktopOrganizer?.boards || []).map(board => ({ label: board.title, click: () => desktopOrganizer.show(board) }))
      ]
    },
    {
      label: isFocusModeActive() ? t.focusModeActive : t.focusMode,
      submenu: [
        { label: t.focusOff, type: 'radio', checked: !isFocusModeActive(), click: () => setFocusMode(0) },
        { label: t.focus30, type: 'radio', checked: false, click: () => setFocusMode(30) },
        { label: t.focus60, type: 'radio', checked: false, click: () => setFocusMode(60) },
        { label: t.focus120, type: 'radio', checked: false, click: () => setFocusMode(120) },
        { label: t.focusTomorrow, type: 'radio', checked: false, click: () => setFocusMode(0, true) }
      ]
    },
    {
      label: t.checkUpdates,
      click: () => updateService?.check(true)
    },
    {
      label: t.emailSettings,
      click: () => openSettingsWindow()
    },
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
    tray?.popUpContextMenu(trayContextMenu);
  });
}

function positionKnowledgeCardWindow() {
  if (!knowledgeCardWindow || knowledgeCardWindow.isDestroyed()) return;
  const display = getCurrentAssistantDisplay();
  const [width, height] = knowledgeCardWindow.getSize();
  const position = centerWindowInWorkArea({ width, height }, display.workArea, 12);
  knowledgeCardWindow.setPosition(position.x, position.y, false);
}

function openKnowledgeCardWindow() {
  if (knowledgeCardWindow && !knowledgeCardWindow.isDestroyed()) {
    if (knowledgeCardWindow.isMinimized()) knowledgeCardWindow.restore();
    positionKnowledgeCardWindow();
    knowledgeCardWindow.show();
    knowledgeCardWindow.moveTop();
    knowledgeCardWindow.focus();
    return;
  }

  const title = currentLanguage === 'en' ? 'Add knowledge card' : '新增知識卡';
  knowledgeCardWindow = new BrowserWindow({
    width: 520,
    height: 590,
    minWidth: 420,
    minHeight: 520,
    title,
    backgroundColor: '#071426',
    resizable: true,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    }
  });

  knowledgeCardWindow.setMenu(null);
  positionKnowledgeCardWindow();
  const distPage = path.join(__dirname, '../dist/knowledge-card.html');
  const rawPage = path.join(__dirname, '../knowledge-card.html');
  knowledgeCardWindow.loadFile(fs.existsSync(distPage) ? distPage : rawPage).catch(error => {
    console.error('Failed to load knowledge card window:', error);
  });
  knowledgeCardWindow.once('ready-to-show', () => {
    if (!knowledgeCardWindow || knowledgeCardWindow.isDestroyed()) return;
    positionKnowledgeCardWindow();
    knowledgeCardWindow.show();
    knowledgeCardWindow.moveTop();
    knowledgeCardWindow.focus();
  });
  knowledgeCardWindow.on('closed', () => {
    knowledgeCardWindow = null;
  });
}

function openSettingsWindow(initialPanel = '') {
  const requestedPanel = ['panel-assistant', 'panel-email', 'panel-calendar', 'panel-health', 'panel-trivia', 'panel-knowledge', 'panel-alarm', 'panel-shortcuts'].includes(initialPanel)
    ? initialPanel
    : '';
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    if (settingsWindow.isMinimized()) settingsWindow.restore();
    positionSettingsWindowOnAssistantDisplay();
    settingsWindow.show();
    settingsWindow.setAlwaysOnTop(true);
    settingsWindow.moveTop();
    settingsWindow.focus();
    if (requestedPanel) settingsWindow.webContents.send('settings-select-tab', requestedPanel);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setIgnoreMouseEvents(true);
      mainWindow.webContents.send('settings-window-visibility', true);
    }
    return;
  }

  const loc = getLocale();
  // The shortcut settings tab uses two working columns. Give both columns
  // enough room at startup so action buttons and browser selectors do not
  // collide before the responsive single-column layout takes over.
  const initWidth = currentLanguage === 'en' ? 1100 : 1040;
  const initHeight = currentLanguage === 'en' ? 780 : 760;
  settingsWindow = new BrowserWindow({
    width: initWidth,
    height: initHeight,
    minWidth: 680,
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
  positionSettingsWindowOnAssistantDisplay();

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
      positionSettingsWindowOnAssistantDisplay();
      settingsWindow.show();
      settingsWindow.setAlwaysOnTop(true);
      settingsWindow.moveTop();
      settingsWindow.focus();
      if (requestedPanel) settingsWindow.webContents.send('settings-select-tab', requestedPanel);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('settings-window-visibility', true);
      }
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
        email: emailPanelOpacity,
        shortcut: shortcutOpacity,
        assistant: assistantOpacity
      });
      mainWindow.webContents.send('settings-window-visibility', false);
      mainWindow.setIgnoreMouseEvents(true, { forward: true });
    }
  });
}

function positionSettingsWindowOnAssistantDisplay() {
  if (!settingsWindow || settingsWindow.isDestroyed()) return;
  const display = mainWindow && !mainWindow.isDestroyed()
    ? screen.getDisplayMatching(mainWindow.getBounds())
    : screen.getPrimaryDisplay();
  const [width, height] = settingsWindow.getSize();
  const position = centerWindowInWorkArea({ width, height }, display.workArea, 12);
  settingsWindow.setPosition(position.x, position.y, false);
}

// Set application identity
app.name = 'METechAssistant';
app.setAppUserModelId('com.metech.bear.desktop.assistant');

// Prevent multiple instances of the assistant app
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log('Another instance is already running. Quitting.');
  app.exit(0);
} else {
  app.on('second-instance', () => {
    // Windows can launch us twice at login. Keep the user's hidden preference;
    // showing the assistant remains an explicit tray action.
    if (mainWindow && !mainWindow.isDestroyed() && isAssistantVisible) {
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
    knowledgeCardsService = new KnowledgeCardsService({
      getWindow: () => mainWindow,
      isBlocked: () => isFocusModeActive() || isNotificationActive || isAlarmActive
    });
    stickyNotesService = new StickyNotesService();
    alarmService = new AlarmService(() => mainWindow, () => stickyNotesService);
    updateService = new UpdateService({
      app,
      autoUpdater,
      getWindows: () => [mainWindow, settingsWindow],
      getLanguage: () => currentLanguage,
      notifyDownloaded: ({ version, autoInstallInSeconds }) => {
        if (!Notification.isSupported()) return;
        updateNotification = new Notification({
          title: currentLanguage === 'en' ? 'METech Assistant update' : 'METech小助手更新',
          body: currentLanguage === 'en'
            ? `Version ${version} downloaded. ${autoInstallInSeconds ? `Installation starts in ${autoInstallInSeconds} seconds and the assistant will reopen automatically.` : 'Open Settings to restart and install.'}`
            : `${version} 版下載完成。${autoInstallInSeconds ? `${autoInstallInSeconds} 秒後自動結束並安裝，完成後會重新開啟小助手。` : '可從設定重新啟動並安裝。'}`,
          silent: true
        });
        updateNotification.show();
      },
      beforeInstall: () => {
        if (desktopOrganizer?.activeDrag || desktopOrganizer?.permissionOperation) return false;
        desktopOrganizer?.save();
        savePetPreferences();
        return true;
      },
      beforeQuitForInstall: () => startRelaunchWatchdog(app.getPath('exe')),
      verifyDownloadedUpdate
    });

    if (emailService.config && emailService.config.language) {
      currentLanguage = emailService.config.language;
    }

    desktopOrganizer = new DesktopOrganizer({ app, BrowserWindow, screen, ipcMain, dialog, shell, nativeImage, clipboard }, app.getPath('userData'), updateTrayMenu);
    desktopOrganizer.register();
    desktopOrganizer.restore();
    createPetWindow();
    createTray();
    scheduleFocusModeEnd();
    updateService.start(autoUpdateEnabled);

    // Windows can retain coordinates and height from a disconnected monitor.
    // Recalculate against the remaining primary display after its work area
    // settles, keeping the assistant above the taskbar at the bottom right.
    const restoreDisplayLayout = () => {
      displayLayoutChangePending = true;
      clearTimeout(displayLayoutTimer);
      clearTimeout(resetPositionCorrectionTimer);
      displayLayoutTimer = setTimeout(() => {
        displayLayoutTimer = null;
        resetPosition();
        desktopOrganizer?.reposition();
        displayLayoutChangePending = false;
      }, 500);
    };
    screen.on('display-added', restoreDisplayLayout);
    screen.on('display-removed', restoreDisplayLayout);
    screen.on('display-metrics-changed', (_event, _display, metrics) => {
      if (metrics.some(metric => ['bounds', 'workArea', 'scaleFactor'].includes(metric))) restoreDisplayLayout();
    });

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
  desktopOrganizer?.dispose();
  clearTimeout(displayLayoutTimer);
  clearTimeout(focusModeTimer);
  clearTimeout(resetPositionCorrectionTimer);
  updateService?.stop();
  windowLayerController?.dispose();
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
  knowledgeCardsService?.stopScheduler();
  stopHealthTimer();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
