const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const yaml = require('js-yaml');
const { verifyDownloadedUpdate, signedUpdateMessage, PUBLIC_KEY_FILE } = require('../electron/update-signature.cjs');
const { signUpdate } = require('../build/sign-update.cjs');
const { UpdateService } = require('../electron/update-service.cjs');

const root = path.join(__dirname, '..');
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const publicPem = publicKey.export({ type: 'spki', format: 'pem' });

// A throwaway release folder with a fake installer, signed by a test key.
function fixtureRelease(t, version = '1.8.0') {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'metech-sign-workspace-'));
  const keyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metech-sign-key-'));
  t.after(() => { fs.rmSync(workspace, { recursive: true, force: true }); fs.rmSync(keyDir, { recursive: true, force: true }); });
  const name = `METech-desktop-assistant-Setup-${version}.exe`;
  const installer = path.join(workspace, 'release', name);
  fs.mkdirSync(path.dirname(installer));
  fs.writeFileSync(installer, crypto.randomBytes(4096));
  const sha512 = crypto.createHash('sha512').update(fs.readFileSync(installer)).digest('base64');
  fs.writeFileSync(path.join(workspace, 'release', 'latest.yml'),
    `version: ${version}\nfiles:\n  - url: ${name}\n    sha512: ${sha512}\n    size: 4096\n    isAdminRightsRequired: true\npath: ${name}\nsha512: ${sha512}\nreleaseDate: '2026-10-05T00:00:00.000Z'\n`);
  const keyFile = path.join(keyDir, 'update-signing-private.pem');
  fs.writeFileSync(keyFile, privateKey.export({ type: 'pkcs8', format: 'pem' }));
  return { workspace, installer, keyFile, info: () => ({ ...yaml.load(fs.readFileSync(path.join(workspace, 'release', 'latest.yml'), 'utf8')), downloadedFile: installer }) };
}

test('a signed release verifies and keeps the electron-builder metadata intact', async t => {
  const release = fixtureRelease(t);
  await signUpdate({ workspace: release.workspace, keyFile: release.keyFile, publicKey: publicPem });
  const info = release.info();
  assert.equal(info.files[0].isAdminRightsRequired, true);
  assert.equal(await verifyDownloadedUpdate(info, publicPem), true);
  await signUpdate({ workspace: release.workspace, keyFile: release.keyFile, publicKey: publicPem });
  assert.equal(fs.readFileSync(path.join(release.workspace, 'release', 'latest.yml'), 'utf8').match(/metechSignature/g).length, 1, 're-signing replaces the signature');
});

test('tampered, unsigned, re-labelled or foreign-key updates are rejected', async t => {
  const release = fixtureRelease(t);
  await signUpdate({ workspace: release.workspace, keyFile: release.keyFile, publicKey: publicPem });
  const signed = release.info();
  await assert.rejects(verifyDownloadedUpdate({ ...signed, metechSignature: undefined }, publicPem), /not signed/);
  await assert.rejects(verifyDownloadedUpdate({ ...signed, version: '9.9.9' }, publicPem), /signature is invalid/);
  const other = crypto.generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' });
  await assert.rejects(verifyDownloadedUpdate(signed, other), /signature is invalid/);
  // An attacker who controls the release can replace both the installer and its hash.
  fs.writeFileSync(release.installer, 'malicious installer');
  const forgedHash = crypto.createHash('sha512').update('malicious installer').digest('base64');
  await assert.rejects(verifyDownloadedUpdate({ ...signed, sha512: forgedHash, files: [{ ...signed.files[0], sha512: forgedHash }] }, publicPem), /signature is invalid/);
  await assert.rejects(verifyDownloadedUpdate(signed, publicPem), /does not match/);
  await assert.rejects(verifyDownloadedUpdate({ ...signed, path: 'other.exe' }, publicPem), /inconsistent/);
});

test('signing refuses keys inside the repository and keys that do not match the shipped public key', async t => {
  const release = fixtureRelease(t);
  await assert.rejects(signUpdate({ workspace: release.workspace, keyFile: path.join(release.workspace, 'key.pem') }), /inside the repository/);
  const before = fs.readFileSync(path.join(release.workspace, 'release', 'latest.yml'), 'utf8');
  await assert.rejects(signUpdate({ workspace: release.workspace, keyFile: release.keyFile }), /signature is invalid/);
  assert.equal(fs.readFileSync(path.join(release.workspace, 'release', 'latest.yml'), 'utf8'), before, 'latest.yml is untouched on failure');
});

function createService(verifyDownloadedUpdate) {
  const handlers = {}, statuses = [], installs = [];
  const autoUpdater = { on: (event, fn) => { handlers[event] = fn; }, quitAndInstall: () => installs.push(true) };
  const service = new UpdateService({
    app: { isPackaged: true, getVersion: () => '1.7.0' }, autoUpdater, restartDelayMs: 5,
    getWindows: () => [{ isDestroyed: () => false, webContents: { send: (channel, status) => statuses.push(status) } }],
    verifyDownloadedUpdate
  });
  return { service, autoUpdater, handlers, statuses, installs };
}
const settle = ms => new Promise(resolve => setTimeout(resolve, ms));

test('an update that fails verification is never installed, not even on quit', async () => {
  const fixture = createService(async () => { throw new Error('Update signature is invalid.'); });
  assert.equal(fixture.autoUpdater.autoInstallOnAppQuit, false);
  fixture.handlers['update-downloaded']({ version: '1.8.0' });
  await settle(30);
  assert.equal(fixture.service.downloaded, false);
  assert.equal(fixture.installs.length, 0);
  assert.equal(fixture.statuses.at(-1).status, 'error');
  assert.equal(fixture.service.install().success, false);
});

test('a verified update follows the normal countdown and installs', async () => {
  const fixture = createService(async () => true);
  fixture.handlers['update-downloaded']({ version: '1.8.0' });
  await settle(60);
  assert.equal(fixture.statuses.some(status => status.status === 'downloaded'), true);
  assert.equal(fixture.installs.length, 1);
});

test('the app ships a valid Ed25519 public key, always verifies updates, and no private key is committed', () => {
  assert.equal(crypto.createPublicKey(fs.readFileSync(PUBLIC_KEY_FILE, 'utf8')).asymmetricKeyType, 'ed25519');
  assert.match(fs.readFileSync(path.join(root, 'electron/main.cjs'), 'utf8'), /verifyDownloadedUpdate\s*\n\s*\}\);/);
  assert.match(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts.postdist, /sign-update\.cjs/);
  const offenders = [];
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (['node_modules', '.git', 'release', 'dist', '.snapshots'].includes(entry.name)) continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (/\.(pem|key|cjs|js|json|yml)$/.test(entry.name) && fs.statSync(file).size < 2e6 && /-----BEGIN (?:\w+ )?PRIVATE KEY-----/.test(fs.readFileSync(file, 'utf8'))) offenders.push(file);
    }
  };
  visit(root);
  assert.deepEqual(offenders, []);
  assert.ok(signedUpdateMessage({ version: '1', file: 'a.exe', sha512: 'x' }).toString().startsWith('METech-update-v1\n'));
});
