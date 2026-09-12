const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { UpdateService } = require('../electron/update-service.cjs');

function createService(isPackaged = true) {
  const updater = new EventEmitter();
  const sent = [];
  let checks = 0;
  let installs = 0;
  updater.checkForUpdates = async () => { checks += 1; };
  updater.quitAndInstall = () => { installs += 1; };
  const service = new UpdateService({
    app: { isPackaged, getVersion: () => '1.6.0' },
    autoUpdater: updater,
    getWindow: () => ({ isDestroyed: () => false, webContents: { send: (...args) => sent.push(args) } }),
    getLanguage: () => 'zh-TW'
  });
  return { service, updater, sent, get checks() { return checks; }, get installs() { return installs; } };
}

test('installed builds check the configured update provider', async () => {
  const fixture = createService(true);
  assert.equal((await fixture.service.check(true)).success, true);
  assert.equal(fixture.checks, 1);
  fixture.service.stop();
});

test('automatic update check is scheduled once after startup without a repeating interval', () => {
  const fixture = createService(true);
  fixture.service.start(true);
  assert.notEqual(fixture.service.checkTimer, null);
  assert.equal(Object.hasOwn(fixture.service, 'intervalTimer'), false);
  fixture.service.stop();
});

test('development builds skip remote update checks', async () => {
  const fixture = createService(false);
  const result = await fixture.service.check(true);
  assert.equal(result.code, 'development');
  assert.equal(fixture.checks, 0);
  fixture.service.stop();
});

test('downloaded updates notify the UI and can restart to install', async () => {
  const fixture = createService(true);
  fixture.updater.emit('update-downloaded', { version: '1.7.0' });
  assert.deepEqual(fixture.sent.at(-1), ['update-status', { status: 'downloaded', version: '1.7.0' }]);
  assert.equal(fixture.service.install().success, true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fixture.installs, 1);
  fixture.service.stop();
});

test('manual checks are identified for immediate assistant feedback', () => {
  const fixture = createService(true);
  fixture.service.manualCheckPending = true;
  fixture.updater.emit('checking-for-update');
  fixture.updater.emit('update-not-available', { version: '1.6.0' });
  assert.deepEqual(fixture.sent, [
    ['update-status', { status: 'checking', manual: true }],
    ['update-status', { status: 'current', version: '1.6.0', manual: true }]
  ]);
  assert.equal(fixture.service.manualCheckPending, false);
  fixture.service.stop();
});
