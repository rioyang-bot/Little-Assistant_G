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
