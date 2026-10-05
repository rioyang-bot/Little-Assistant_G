const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const { WindowLayerController } = require('../electron/window-layer-controller.cjs');

// Capture the helper script the controller would launch for a bottom-mode window.
function helperScript() {
  let script = '';
  const window = { on() {}, removeListener() {}, isDestroyed: () => false, setAlwaysOnTop() {}, getNativeWindowHandle: () => Buffer.alloc(8) };
  const child = { on() {}, once() {}, stderr: { on() {} }, stdin: { on() {}, end() {} }, kill() {} };
  new WindowLayerController(window, 'bottom', { platform: 'win32', spawn: (file, args) => { script = Buffer.from(args.at(-1), 'base64').toString('utf16le'); return child; } });
  return script;
}

test('bottom windows rise above the desktop during Show desktop and settle just above it', () => {
  const script = helperScript();
  // Show desktop raises the icon host (Progman/WorkerW with SHELLDLL_DefView) above ordinary windows.
  assert.match(script, /FindWindowEx\(window, IntPtr\.Zero, "SHELLDLL_DefView", null\)/);
  // A real Win+D makes the desktop the foreground window, where HWND_TOP is ignored.
  assert.match(script, /if \(CoveredByDesktop\(window\)\)[\s\S]*?SetWindowPos\(window, new IntPtr\(-1\),[\s\S]*?SetWindowPos\(window, new IntPtr\(-2\),/, 'raises via TOPMOST then NOTOPMOST when covered');
  assert.match(script, /if \(IsDesktopHost\(current\)\) return false;/, 'windows hidden below the desktop never force lowering');
  assert.match(script, /IntPtr after = above != IntPtr\.Zero && above != window \? above : new IntPtr\(1\);/, 'lowering stops directly above the desktop');
});

test('the layer helper C# compiles', { skip: process.platform !== 'win32' }, () => {
  const source = helperScript().match(/@'\r?\n([\s\S]*?)\r?\n'@/)[1];
  const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    'Add-Type -TypeDefinition $env:LAYER_SOURCE; [AssistantWindowLayer].Name'],
  { env: { ...process.env, LAYER_SOURCE: source }, encoding: 'utf8', windowsHide: true }).trim();
  assert.equal(output, 'AssistantWindowLayer');
});
