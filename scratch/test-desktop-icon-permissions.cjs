const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readBroker } = require('../electron/desktop-icon-permissions.cjs');
const { DesktopIconVisibility } = require('../electron/desktop-icon-visibility.cjs');

test('broker preferences cannot select arbitrary task names, request paths or program directories', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'assistant-broker-policy-'));
  const saved = Object.fromEntries(['APPDATA', 'LOCALAPPDATA', 'ProgramFiles'].map(key => [key, process.env[key]]));
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
    fs.rmSync(root, { recursive: true, force: true });
  });
  process.env.APPDATA = path.join(root, 'roaming'); process.env.LOCALAPPDATA = path.join(root, 'local'); process.env.ProgramFiles = path.join(root, 'programs');
  const userDir = path.join(process.env.APPDATA, 'METechAssistant');
  const installed = path.join(process.env.ProgramFiles, 'METechAssistant', 'DesktopIconBroker');
  const sid = 'S-1-5-21-111-222-333-1001';
  fs.mkdirSync(path.join(installed, sid), { recursive: true }); fs.mkdirSync(userDir, { recursive: true });
  fs.writeFileSync(path.join(installed, sid, 'config.json'), '{}');
  const manifest = { schema: 1, root: installed, sid, taskName: 'METechAssistant-DesktopIcons-' + sid, requestFile: path.join(process.env.LOCALAPPDATA, 'METechAssistant', 'desktop-icon-broker-request.json'), enabled: false };
  const save = data => fs.writeFileSync(path.join(userDir, 'desktop-icon-broker.json'), JSON.stringify(data));
  save(manifest); assert.equal(readBroker(userDir).enabled, false);
  assert.equal(new DesktopIconVisibility(userDir, root, { allowElevation: false }).broker, null, 'isolated native tests and ordinary mode must not use a privileged task');
  for (const data of [{ ...manifest, taskName: 'cmd.exe /c injected' }, { ...manifest, root: root }, { ...manifest, requestFile: path.join(root, 'other.json') }, { ...manifest, sid: 'S-1-5-18' }]) {
    save(data); assert.equal(readBroker(userDir), null);
  }
  save(manifest);
  fs.writeFileSync(path.join(installed, sid, 'visibility.json'), JSON.stringify([{ path: 'owned-pending-entry' }]));
  assert.equal(new DesktopIconVisibility(userDir, root).useBroker, true, 'an interrupted privileged journal must be restored even after the preference was disabled');
});

test('a failed background task falls back to ordinary hiding without another UAC prompt', async () => {
  const service = new DesktopIconVisibility(fs.mkdtempSync(path.join(os.tmpdir(), 'icon-broker-')), os.tmpdir(), { brokerRetryDelayMs: 0 });
  service.useBroker = true;
  let requests = 0, stops = 0;
  service.stopWorker = async () => { stops++; };
  service.request = async () => {
    requests++;
    if (service.useBroker) { const error = new Error('Task disabled'); error.brokerFailed = true; throw error; }
    service.requiresElevation = true;
    return ['Protected item still visible'];
  };
  const errors = await service.sync(['owned-desktop-entry']);
  assert.equal(requests, 4, 'two retries before the ordinary worker'); assert.equal(stops, 3); assert.equal(service.elevated, undefined);
  assert.equal(service.elevationAttempted, true);
  assert.ok(errors.some(message => message.includes('安裝／修復背景輔助程序') && message.includes('稍後會自動重試')));
  assert.ok(service.brokerRecheckAt > Date.now(), 'the background task is tried again later');
  assert.ok(fs.readFileSync(service.logFile, 'utf8').includes('[broker] falling back to ordinary hiding: Task disabled'), 'the failure is logged');
});

test('a background task that fails once after waking is retried and kept', async () => {
  const service = new DesktopIconVisibility(fs.mkdtempSync(path.join(os.tmpdir(), 'icon-broker-')), os.tmpdir(), { brokerRetryDelayMs: 0 });
  service.useBroker = true; service.broker = {};
  let requests = 0;
  service.stopWorker = async () => {};
  service.request = async () => { requests++; if (requests === 1) { const error = new Error('Task failed once'); error.brokerFailed = true; throw error; } return []; };
  assert.deepEqual(await service.sync(['owned-desktop-entry']), []);
  assert.equal(requests, 2);
  assert.equal(service.useBroker, true, 'still uses the background task');
  assert.equal(service.brokerRecheckAt, 0);
});

test('after falling back, the background task is tried again once the recheck time passes', async () => {
  const service = new DesktopIconVisibility(fs.mkdtempSync(path.join(os.tmpdir(), 'icon-broker-')), os.tmpdir(), { brokerRetryDelayMs: 0, brokerRetries: 0, brokerRecheckMs: 0 });
  service.useBroker = true; service.broker = {};
  let brokerUp = false, stops = 0;
  service.stopWorker = async () => { stops++; };
  service.request = async () => { if (service.useBroker && !brokerUp) { const error = new Error('Task down'); error.brokerFailed = true; throw error; } return []; };
  await service.sync(['owned-desktop-entry']);
  assert.equal(service.useBroker, false, 'ordinary hiding for now');
  brokerUp = true;
  assert.deepEqual(await service.sync(['owned-desktop-entry']), []);
  assert.equal(service.useBroker, true, 'back on the background task');
  assert.equal(service.elevationAttempted, false);
});

test('an explicit ordinary-mode launch cannot start a privileged icon worker', t => {
  const original = process.argv;
  t.after(() => { process.argv = original; });
  process.argv = [...original, '--no-icon-elevation'];
  const service = new DesktopIconVisibility(os.tmpdir(), os.tmpdir(), { allowElevation: true });
  assert.equal(service.allowElevation, false);
  assert.equal(service.broker, null);
  assert.equal(service.useBroker, false);
});
