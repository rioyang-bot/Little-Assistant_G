const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const { WindowLayerController } = require('../electron/window-layer-controller.cjs');
const { DesktopOrganizer, normalizeBoard } = require('../electron/desktop-organizer.cjs');

function fixture(mode, options = {}) {
  const spawned = [];
  const window = Object.assign(new EventEmitter(), {
    destroyed: false, isDestroyed() { return this.destroyed; }, setAlwaysOnTop() {},
    getNativeWindowHandle: () => { const b = Buffer.alloc(8); b.writeBigUInt64LE(4242n); return b; }
  });
  const spawn = (file, args) => {
    const child = Object.assign(new EventEmitter(), { stdin: { on() {}, end() {} }, stderr: new EventEmitter(), killed: false, kill() { this.killed = true; } });
    child.script = Buffer.from(args.at(-1), 'base64').toString('utf16le');
    spawned.push(child);
    return child;
  };
  const errors = [];
  const controller = new WindowLayerController(window, mode, { platform: 'win32', spawn, restartDelayMs: 5, logError: message => errors.push(message), ...options });
  return { controller, window, spawned, errors };
}
const tick = ms => new Promise(resolve => setTimeout(resolve, ms));
const runArgs = child => child.script.match(/\[AssistantWindowLayer\]::Run\(([^)]*)\)/)[1];

test('locked (bottom) helpers lower the window; unlocked (normal) helpers only handle Show desktop', () => {
  assert.equal(runArgs(fixture('bottom', { desktopOrganizer: true }).spawned[0]), `4242, ${process.pid}, $true, $true`);
  assert.equal(runArgs(fixture('normal', { desktopOrganizer: true }).spawned[0]), `4242, ${process.pid}, $true, $false`);
});

test('switching modes replaces the helper with one for the new mode', () => {
  const { controller, spawned } = fixture('normal', { desktopOrganizer: true });
  controller.setMode('bottom');
  assert.equal(spawned[0].killed, true);
  assert.equal(spawned.length, 2);
  assert.match(runArgs(spawned[1]), /\$true, \$true$/);
  controller.setMode('bottom');
  assert.equal(spawned.length, 2, 'the same mode does not restart the helper');
});

test('an unexpectedly exited helper is restarted; deliberate stops are not', async () => {
  const { controller, window, spawned, errors } = fixture('bottom');
  spawned[0].stderr.emit('data', 'boom');
  spawned[0].emit('exit', 1);
  await tick(30);
  assert.equal(spawned.length, 2, 'restarted after a crash');
  assert.match(errors[0], /exited \(1\): boom/);
  spawned[1].emit('exit', 0);
  await tick(30);
  assert.equal(spawned.length, 3, 'a silent exit is restarted too');

  controller.setMode('normal');                     // deliberate stop + new helper
  const replaced = spawned.at(-2);
  replaced.emit('exit', 0);
  await tick(30);
  assert.equal(spawned.length, 4, 'a helper stopped on purpose is not restarted');

  await controller.withModal(async () => { spawned.at(-1).emit('exit', 0); await tick(20); });
  assert.equal(spawned.length, 5, 'only the post-modal apply starts a helper');

  window.destroyed = true;
  controller.dispose();
  spawned.at(-1).emit('exit', 1);
  await tick(30);
  assert.equal(spawned.length, 5, 'no restart after the window closed');
});

test('a helper that keeps crashing is restarted at most five times a minute until the window is shown again', async () => {
  const { window, spawned, errors } = fixture('bottom');
  for (let i = 0; i < 7; i++) { spawned.at(-1).emit('exit', 1); await tick(20); }
  assert.equal(spawned.length, 6, 'initial helper plus five restarts');
  assert.ok(errors.some(message => /restart paused/.test(message)));
  window.emit('show');
  assert.equal(spawned.length, 7, 'showing the window starts a helper again');
});

test('the helper keeps running when a reorder fails and clears a stray topmost flag', () => {
  const script = fixture('bottom').spawned[0].script;
  assert.doesNotMatch(script, /throw new/, 'no failure path ends the helper');
  assert.match(script, /if \(\(GetWindowLong\(window, -20\) & 0x8\) != 0\) SetWindowPos\(window, new IntPtr\(-2\)/);
  assert.match(script, /if \(!SetWindowPos\(window, after, 0, 0, 0, 0, 0x13\) && after != new IntPtr\(1\)\)\s*SetWindowPos\(window, new IntPtr\(1\)/, 'falls back to HWND_BOTTOM');
  assert.match(script, /else if \(lower && NeedsLowering\(window\)\)/);
});

test('locking an organizer keeps it at the bottom; unlocking lets it come forward', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'organizer-layer-mode-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const handlers = {};
  const service = new DesktopOrganizer({ ipcMain: { handle: (name, fn) => { handlers[name] = fn; } }, organizerDrag: {} }, dir);
  service.register();
  const board = normalizeBoard(); service.boards.push(board);
  const sender = {}, modes = [];
  service.windows.set(board.id, { webContents: sender, setMovable() {}, setTitle() {} });
  service.layers.set(board.id, { setMode: mode => modes.push(mode) });
  assert.equal(service.layerMode(board), 'normal');
  handlers['organizer-update']({ sender }, { locked: true });
  handlers['organizer-update']({ sender }, { locked: false });
  assert.deepEqual(modes, ['bottom', 'normal']);
  assert.equal(service.layerMode({ locked: true }), 'bottom');
});
