const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../electron/main.cjs'), 'utf8');
function section(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from);
  return source.slice(from, to);
}

function createApp(userDir) {
  const handlers = {};
  const calls = [];
  const state = vm.createContext({
    fs, path, console, process, __dirname: path.join(__dirname, '../electron'),
    app: { isPackaged: true, getPath: () => userDir, on: (event, fn) => { handlers[event] = fn; } },
    normalizeWindowLayerMode: mode => mode || 'top',
    normalizeBrowserAssignments: value => value || {},
    normalizeLaptopShortcut: value => value,
    updateTrayMenu() {},
  });
  vm.runInContext(section('let mainWindow = null;', 'function getShortcutLogoDirectory('), state);
  vm.runInContext(section('function getPreferencesPath(', '// Disable hardware acceleration'), state);
  vm.runInContext(section('function setAssistantVisible(', 'function setWindowLayerMode('), state);
  vm.runInContext(section("  app.on('second-instance'", '  app.whenReady()'), state);
  state.window = {
    isDestroyed: () => false, isMinimized: () => true, isVisible: () => true,
    getPosition: () => [10, 20],
    restore: () => calls.push('restore'), show: () => calls.push('show'),
    focus: () => calls.push('focus'),
    webContents: { send: (...args) => calls.push(args) },
  };
  vm.runInContext('mainWindow = window;', state);
  return { state, calls, handlers };
}

test('hidden preference survives a fresh process and duplicate login launches', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'assistant-startup-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const first = createApp(dir);
  first.state.setAssistantVisible(false);
  const prefPath = path.join(dir, 'pet-preferences.json');
  assert.equal(JSON.parse(fs.readFileSync(prefPath)).isAssistantVisible, false);

  const restarted = createApp(dir);
  restarted.state.loadPetPreferences();
  assert.equal(vm.runInContext('isAssistantVisible', restarted.state), false);
  const saved = fs.readFileSync(prefPath, 'utf8');
  restarted.handlers['second-instance']();
  restarted.handlers['second-instance']();
  assert.deepEqual(restarted.calls, []);
  assert.equal(fs.readFileSync(prefPath, 'utf8'), saved);
  restarted.state.savePetPreferences();
  assert.equal(JSON.parse(fs.readFileSync(prefPath)).isAssistantVisible, false);

  // The explicit tray action still shows the assistant and persists that choice.
  restarted.state.setAssistantVisible(true);
  assert.equal(JSON.parse(fs.readFileSync(prefPath)).isAssistantVisible, true);
  assert.ok(restarted.calls.some(call => Array.isArray(call) && call[0] === 'assistant-visibility-changed' && call[1] === true));
});

test('a visible assistant still focuses on a second launch without rewriting preferences', () => {
  const { state, calls, handlers } = createApp('unused');
  handlers['second-instance']();
  assert.deepEqual(calls, ['restore', 'show', 'focus']);
  vm.runInContext('mainWindow = null;', state);
  assert.doesNotThrow(() => handlers['second-instance']());
});

test('clicking the tray icon opens its menu without changing hidden visibility', () => {
  const traySection = section('function createTray(', 'function openSettingsWindow(');
  assert.match(traySection, /popUpContextMenu\(trayContextMenu\)/);
  assert.doesNotMatch(traySection, /setAssistantVisible\(true\)/);
});

test('display changes schedule relocation to the preferred bottom right', () => {
  assert.match(source, /screen\.on\('display-removed', restoreDisplayLayout\)/);
  assert.match(source, /displayLayoutChangePending = true;[\s\S]*resetPosition\(\);[\s\S]*displayLayoutChangePending = false;/);
});

test('manual reset targets the preferred display and corrects its position twice', () => {
  const resetSection = section('function getCurrentAssistantDisplay()', 'function setMoveMode(');
  assert.match(resetSection, /getAssistantDisplayAnchor\(bounds, currentDockSide\)/);
  assert.match(resetSection, /screen\.getDisplayNearestPoint\(anchor\)/);
  assert.match(resetSection, /display\?\.workArea \? display : getPreferredAssistantDisplay\(\)/);
  assert.match(source, /screen\.on\('display-metrics-changed'/);
  assert.match(resetSection, /const targetDisplayId = targetDisplay\.id;/);
  assert.match(resetSection, /applyBottomRightBounds\(\);[\s\S]*setTimeout\(\(\) => \{[\s\S]*applyBottomRightBounds\(\);[\s\S]*\}, 200\)/);
});

test('professional knowledge shortcut opens quick-add instead of overview settings', () => {
  const handler = section("ipcMain.handle('laptop-open-action'", '// Open Email Settings Window');
  assert.match(handler, /if \(action === 'knowledge'\) \{\s*openKnowledgeCardWindow\(\);/);
  assert.doesNotMatch(handler, /openSettingsWindow\('panel-knowledge'\)/);
});

test('installation always registers startup and the app exposes no startup toggle', () => {
  const installer = fs.readFileSync(path.join(__dirname, '../build/installer.nsh'), 'utf8');
  assert.match(installer, /WriteRegStr HKCU[^\n]*\n\s*"METechAssistant"/);
  assert.match(installer, /DeleteRegValue HKCU[^\n]*\n\s*"com\.metech\.assistant"/);
  assert.doesNotMatch(source, /get-auto-launch|set-auto-launch|auto-launch-updated/);
  assert.doesNotMatch(source, /getLoginItemSettings|setLoginItemSettings/);
});
