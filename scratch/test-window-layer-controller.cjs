const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { WindowLayerController, normalizeWindowLayerMode } = require('../electron/window-layer-controller.cjs');

function setup(mode) {
  const window = new EventEmitter();
  window.isDestroyed = () => false;
  window.setAlwaysOnTop = top => { window.top = top; };
  window.getNativeWindowHandle = () => Buffer.from([123, 0, 0, 0, 0, 0, 0, 0]);
  const children = [];
  const controller = new WindowLayerController(window, mode, {
    platform: 'win32',
    spawn: (file, args, options) => {
      assert.equal(options.windowsHide, true);
      const child = new EventEmitter();
      child.stdin = new EventEmitter();
      child.stdin.end = () => { child.ended = true; };
      child.kill = () => { child.killed = true; };
      children.push(child);
      return child;
    }
  });
  return { window, controller, children };
}

test('layer preferences restore all modes and migrate the legacy toggle', () => {
  for (const mode of ['top', 'bottom', 'bottom-notify']) assert.equal(normalizeWindowLayerMode(mode), mode);
  assert.equal(normalizeWindowLayerMode(undefined, false), 'bottom');
  assert.equal(normalizeWindowLayerMode(undefined, true), 'top');
  assert.equal(normalizeWindowLayerMode('invalid'), 'top');
});

test('always bottom stays bottom during notifications without spawning duplicate helpers', () => {
  const { window, controller, children } = setup('bottom');
  controller.setNotificationActive(true);
  window.emit('show');
  window.emit('restore');
  assert.equal(window.top, false);
  assert.equal(children.length, 1);
  controller.dispose();
  assert.equal(children[0].killed, true);
});

test('always top never starts a bottom helper', () => {
  const { window, controller, children } = setup('top');
  controller.setNotificationActive(true);
  controller.resetNotifications();
  assert.equal(window.top, true);
  assert.equal(children.length, 0);
  controller.dispose();
});

test('notification mode raises and returns to bottom after dismissal or renderer reload', () => {
  const { window, controller, children } = setup('bottom-notify');
  assert.equal(window.top, false);
  controller.setNotificationActive(true);
  assert.equal(window.top, true);
  assert.equal(children[0].killed, true);
  controller.resetNotifications();
  assert.equal(window.top, false);
  assert.equal(children.length, 2);
  children[0].emit('exit', 1);
  assert.equal(window.top, false);
  controller.dispose();
});

test('mode switches take effect during active notifications and ignore stale helper exits', () => {
  const { window, controller, children } = setup('bottom');
  controller.setNotificationActive(true);
  controller.setMode('bottom-notify');
  assert.equal(window.top, true);
  window.top = false; // Simulate an old native SetWindowPos finishing late.
  children[0].emit('exit', 1);
  assert.equal(window.top, true);
  controller.setMode('bottom');
  assert.equal(window.top, false);
  controller.setMode('top');
  controller.resetNotifications();
  assert.equal(window.top, true);
  controller.dispose();
});

test('closing the window stops the owned helper and prevents further window access', () => {
  const { window, controller, children } = setup('bottom');
  window.emit('closed');
  assert.equal(children[0].killed, true);
  window.setAlwaysOnTop = () => assert.fail('accessed disposed window');
  children[0].emit('exit', 1);
  controller.setMode('top');
  controller.dispose();
});

test('context menu stays above bottom windows and restores the current preference when dismissed', () => {
  const { window, controller, children } = setup('bottom');
  controller.setMenuActive(true);
  assert.equal(window.top, true);
  assert.equal(children[0].killed, true);
  controller.setMenuActive(true);
  controller.setMode('bottom-notify');
  controller.setNotificationActive(true);
  controller.setMenuActive(false);
  assert.equal(window.top, true, 'active notification retains topmost after menu dismissal');
  controller.resetNotifications();
  assert.equal(window.top, false);
  assert.equal(children.length, 2);
  controller.setMenuActive(true);
  window.top = false;
  children[1].emit('exit', 1);
  assert.equal(window.top, true, 'late native lowering cannot cover an open menu');
  controller.setMode('bottom');
  controller.setMenuActive(false);
  assert.equal(window.top, false);
  assert.equal(children.length, 3);
  controller.dispose();
});

test('native modal freezes layer changes, waits for helper exit and restores the latest preference', async () => {
  const { window, controller, children } = setup('bottom');
  let finish, opened = false;
  const result = controller.withModal(async () => {
    opened = true;
    assert.equal(controller.helper,null);
    assert.equal(window.top,false,'opening the dialog must not pin its owner above applications');
    await new Promise(resolve => { finish=resolve; });
    return 'cancelled';
  });
  assert.equal(children[0].killed,true); assert.equal(opened,false,'dialog waits until native lowering stops');
  children[0].emit('exit',0);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(opened,true);
  window.emit('show'); window.emit('restore');
  controller.setMode('top'); controller.setMenuActive(true);
  assert.equal(window.top,false,'mode changes must not reorder an open modal owner');
  assert.equal(children.length,1);
  controller.setMode('bottom'); controller.setMenuActive(false);
  finish(); assert.equal(await result,'cancelled');
  assert.equal(window.top,false); assert.equal(children.length,2,'bottom control resumes after cancellation');
  controller.dispose();
});

test('nested modal failure releases suspension and closing the owner does not restart its helper', async () => {
  const { controller, children } = setup('bottom');
  const failed = controller.withModal(() => controller.withModal(() => { throw new Error('dialog failed'); }));
  children[0].emit('exit',0);
  await assert.rejects(failed,/dialog failed/);
  assert.equal(controller.modalDepth,0); assert.equal(children.length,2);
  const disposed = controller.withModal(async () => { controller.dispose(); return 'closed'; });
  children[1].emit('exit',0);
  assert.equal(await disposed,'closed'); assert.equal(children.length,2);
});
