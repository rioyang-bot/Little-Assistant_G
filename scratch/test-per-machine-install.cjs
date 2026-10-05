const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const { DesktopIconPermissions, isAdminProtectedDirectory, UNPROTECTED_INSTALL_ERROR } = require('../electron/desktop-icon-permissions.cjs');
const { DesktopIconVisibility, ELEVATION_SETUP_HINT } = require('../electron/desktop-icon-visibility.cjs');
const { UpdateService } = require('../electron/update-service.cjs');
const { WATCHDOG_SCRIPT, buildRelaunchWatchdog } = require('../electron/update-relaunch-watchdog.cjs');

const root = path.join(__dirname, '..');

test('the installer is per-machine under Program Files with a fixed directory', () => {
  const nsis = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).build.nsis;
  assert.equal(nsis.perMachine, true);
  assert.equal(nsis.allowToChangeInstallationDirectory, false, 'a custom folder such as C:\\Apps can be user-writable');
  assert.equal(nsis.packElevateHelper, true, 'latest.yml must carry isAdminRightsRequired so updates start elevate.exe directly');
  const installer = fs.readFileSync(path.join(root, 'build/installer.nsh'), 'utf8');
  assert.match(installer, /StrCpy \$INSTDIR "\$PROGRAMFILES64\\METech-desktop-assistant"/);
  assert.doesNotMatch(installer, /\$LOCALAPPDATA\\Programs/);
});

test('a user-writable directory is not treated as administrator-protected', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metech-writable-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.equal(isAdminProtectedDirectory(dir), false);
  assert.deepEqual(fs.readdirSync(dir), [], 'the write probe is removed');
});

test('Program Files is administrator-protected for the ordinary test process', { skip: process.platform !== 'win32' || !process.env.ProgramFiles }, () => {
  const whoami = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'whoami.exe');
  const groups = execFileSync(whoami, ['/groups'], { encoding: 'utf8' });
  if (/S-1-16-12288|S-1-16-16384/.test(groups)) return; // An elevated shell can write anywhere.
  assert.equal(isAdminProtectedDirectory(process.env.ProgramFiles), true);
});

test('permission setup refuses to elevate scripts from an unprotected installation', async () => {
  const service = new DesktopIconPermissions(os.tmpdir(), () => []);
  service.isProtectedInstall = false;
  for (const mode of ['Setup', 'Install', 'Grant', 'Restore', 'Remove']) {
    await assert.rejects(service.execute(mode), error => error.message === UNPROTECTED_INSTALL_ERROR, mode);
  }
});

test('automatic UAC elevation is refused from an unprotected installation, without prompting', async () => {
  const service = new DesktopIconVisibility(os.tmpdir(), os.tmpdir(), { allowBroker: false });
  service.allowElevation = true;
  service.autoElevate = true;
  service.isProtectedInstall = false;
  let elevatedRequests = 0, stops = 0;
  service.stopWorker = async () => { stops++; };
  service.request = async () => {
    if (service.elevated) elevatedRequests++;
    service.requiresElevation = true;
    return ['Protected item still visible'];
  };
  const errors = await service.sync(['owned-desktop-entry']);
  assert.equal(elevatedRequests, 0);
  assert.equal(stops, 0);
  assert.ok(errors.includes(UNPROTECTED_INSTALL_ERROR));
  await service.sync(['owned-desktop-entry']);
  assert.equal(elevatedRequests, 0, 'no repeated attempts');
});

test('a protected installation still offers the UAC worker', async () => {
  const service = new DesktopIconVisibility(os.tmpdir(), os.tmpdir(), { allowBroker: false });
  service.allowElevation = true;
  service.autoElevate = true;
  service.isProtectedInstall = true;
  service.onStatus = () => {};
  service.stopWorker = async () => {};
  service.request = async () => {
    if (service.elevated) return [];
    service.requiresElevation = true;
    return ['Protected item still visible'];
  };
  assert.deepEqual(await service.sync(['owned-desktop-entry']), []);
  assert.equal(service.elevated, true);
});

function protectedIconService(options = {}) {
  const service = new DesktopIconVisibility(os.tmpdir(), os.tmpdir(), { allowBroker: false, ...options });
  service.allowElevation = true;
  service.isProtectedInstall = true;
  service.onStatus = () => { service.prompted = true; };
  service.stopWorker = async () => {};
  service.request = async () => {
    if (service.elevated) service.elevatedRequests = (service.elevatedRequests || 0) + 1;
    service.requiresElevation = true;
    return ['Protected item still visible'];
  };
  return service;
}

test('startup and automatic syncs never open UAC by default; they point to the one-time setup', async () => {
  for (let boot = 0; boot < 3; boot++) {
    const service = protectedIconService();
    const errors = await service.sync(['owned-desktop-entry']);
    assert.equal(service.elevated, undefined, 'no UAC worker on boot ' + boot);
    assert.equal(service.prompted, undefined);
    assert.ok(errors.includes(ELEVATION_SETUP_HINT));
  }
});

test('with the SYSTEM helper active, protected items never fall back to a UAC prompt', async () => {
  const service = protectedIconService({ autoElevate: true });
  service.useBroker = true;
  const errors = await service.sync(['owned-desktop-entry']);
  assert.equal(service.elevated, undefined);
  assert.equal(service.prompted, undefined);
  assert.deepEqual(errors, ['Protected item still visible']);
});

test('the installer recommends the helper so later boots need no administrator prompt', () => {
  const installer = fs.readFileSync(path.join(root, 'build/installer.nsh'), 'utf8');
  assert.match(installer, /MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON1/);
  assert.match(installer, /-Mode Install'/);
});

test('the update installer starts the relaunch watchdog before quitting', async () => {
  const calls = [];
  const autoUpdater = { on() {}, quitAndInstall: () => calls.push('quitAndInstall') };
  const service = new UpdateService({
    app: { isPackaged: true, getVersion: () => '1.7.0' }, autoUpdater, getWindows: () => [],
    beforeQuitForInstall: () => calls.push('watchdog')
  });
  service.downloaded = true;
  service.install();
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, ['watchdog', 'quitAndInstall']);
});

test('relaunch watchdog passes values by environment and keeps a fixed script', () => {
  const exe = 'C:\\Program Files\\METech-desktop-assistant\\METech-desktop-assistant.exe';
  const launch = buildRelaunchWatchdog(exe, 1234, {});
  assert.equal(launch.env.METECH_RELAUNCH_EXE, exe);
  assert.equal(launch.env.METECH_RELAUNCH_PARENT, '1234');
  assert.equal(launch.args.some(arg => arg.includes('Program Files')), false);
  assert.equal(Buffer.from(launch.args.at(-1), 'base64').toString('utf16le'), WATCHDOG_SCRIPT);
  assert.equal(buildRelaunchWatchdog('relative.exe', 1234, {}), null);
  assert.equal(buildRelaunchWatchdog(exe, 0, {}), null);
});

test('relaunch watchdog script is valid PowerShell', { skip: process.platform !== 'win32' }, () => {
  const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    '$e=$null; $t=$null; [void][System.Management.Automation.Language.Parser]::ParseInput($env:SCRIPT_TEXT,[ref]$t,[ref]$e); $e.Count'],
  { env: { ...process.env, SCRIPT_TEXT: WATCHDOG_SCRIPT }, encoding: 'utf8', windowsHide: true }).trim();
  assert.equal(output, '0');
});
