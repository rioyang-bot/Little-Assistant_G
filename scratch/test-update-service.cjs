const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { UpdateService } = require('../electron/update-service.cjs');

function createService(isPackaged = true, options = {}) {
  const updater = new EventEmitter();
  const sent = [];
  let checks = 0;
  let installs = 0;
  const installArguments = [], notifications = [];
  updater.checkForUpdates = async () => { checks += 1; };
  updater.quitAndInstall = (...args) => { installs += 1; installArguments.push(args); };
  const service = new UpdateService({
    app: { isPackaged, getVersion: () => '1.6.0' },
    autoUpdater: updater,
    getWindow: () => ({ isDestroyed: () => false, webContents: { send: (...args) => sent.push(args) } }),
    getLanguage: () => 'zh-TW',
    notifyDownloaded: detail => notifications.push(detail),
    ...options
  });
  return { service, updater, sent, notifications, installArguments, get checks() { return checks; }, get installs() { return installs; } };
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
  assert.deepEqual(fixture.sent.at(-1), ['update-status', { status: 'downloaded', version: '1.7.0', autoInstallInSeconds: 5 }]);
  assert.equal(fixture.service.install().success, true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fixture.installs, 1);
  assert.deepEqual(fixture.installArguments, [[true, true]], 'silent installer must force relaunch');
  fixture.service.stop();
});

test('automatic installation waits five seconds after notification and runs once', async t => {
  t.mock.timers.enable({ apis:['setTimeout'] });
  const fixture=createService();
  fixture.updater.emit('update-downloaded',{version:'1.7.0'});
  assert.deepEqual(fixture.notifications,[{version:'1.7.0',autoInstallInSeconds:5}]);
  t.mock.timers.tick(4999);
  await new Promise(resolve=>setImmediate(resolve)); assert.equal(fixture.installs,0);
  fixture.updater.emit('update-downloaded',{version:'1.7.0'});
  assert.equal(fixture.notifications.length,1,'duplicate download completion must not reset the countdown');
  t.mock.timers.tick(1);
  fixture.service.install();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(fixture.installs,1); assert.deepEqual(fixture.installArguments,[[true,true]]);
  assert.equal(fixture.service.getStatus().status,'installing');
  fixture.service.stop();
});

test('updates notify assistant and settings, tolerate closing windows and retain state for reopening', () => {
  const messages=[[],[]];
  const windows=messages.map(sent=>({isDestroyed:()=>false,webContents:{send:(...args)=>sent.push(args)}}));
  const fixture=createService(true,{getWindows:()=>[...windows,windows[0],null,{isDestroyed:()=>false,webContents:{send(){throw new Error('Window closed');}}}]});
  fixture.updater.emit('update-downloaded',{version:'1.7.0'});
  assert.equal(messages[0].length,1); assert.deepEqual(messages[1],messages[0]);
  assert.deepEqual(fixture.service.getStatus(),{status:'downloaded',version:'1.7.0',autoInstallInSeconds:5});
  fixture.service.stop();
});

test('active file drags delay installation until saved state is ready', async t => {
  t.mock.timers.enable({apis:['setTimeout']});
  let dragging=true,saves=0;
  const fixture=createService(true,{beforeInstall:()=>{if(dragging)return false;saves++;return true;}});
  fixture.updater.emit('update-downloaded',{version:'1.7.0'});
  t.mock.timers.tick(5000);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(fixture.installs,0); assert.equal(fixture.service.getStatus().status,'waiting');
  dragging=false;t.mock.timers.tick(1000);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(saves,1);assert.equal(fixture.installs,1);fixture.service.stop();
});

test('stopping, disabling automatic updates or download errors cancel the install countdown', async t => {
  t.mock.timers.enable({apis:['setTimeout']});
  for(const action of ['stop','disable','error']) {
    const fixture=createService();fixture.updater.emit('update-downloaded',{version:'1.7.0'});
    if(action==='stop')fixture.service.stop();
    else if(action==='disable')fixture.service.setEnabled(false);
    else fixture.updater.emit('error',new Error('Download failed'));
    t.mock.timers.tick(10000);await new Promise(resolve=>setImmediate(resolve));
    assert.equal(fixture.installs,0,action);fixture.service.stop();
  }
});

test('errors during pending preparation prevent installation, and failed saves can be retried', async () => {
  let finish;
  const fixture=createService(true,{beforeInstall:()=>new Promise(resolve=>{finish=resolve;})});
  fixture.updater.emit('update-downloaded',{version:'1.7.0'});fixture.service.install();
  await new Promise(resolve=>setImmediate(resolve));fixture.updater.emit('error',new Error('Installer error'));finish(true);
  await new Promise(resolve=>setImmediate(resolve));assert.equal(fixture.installs,0);fixture.service.stop();
  let failed=true;
  const retry=createService(true,{beforeInstall:()=>{if(failed)throw new Error('State save failed');return true;}});
  retry.updater.emit('update-downloaded',{version:'1.7.0'});retry.service.install();
  await new Promise(resolve=>setImmediate(resolve));assert.equal(retry.installs,0);assert.equal(retry.service.getStatus().status,'error');
  failed=false;retry.service.install();await new Promise(resolve=>setImmediate(resolve));assert.equal(retry.installs,1);retry.service.stop();
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

test('download promise failures are handled without an uncaught rejection', async () => {
  const fixture=createService();
  fixture.updater.checkForUpdates=async()=>({downloadPromise:Promise.reject(new Error('Network interrupted'))});
  assert.equal((await fixture.service.check()).success,true);
  await new Promise(resolve=>setImmediate(resolve));fixture.service.stop();
});
