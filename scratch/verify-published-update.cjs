const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const { SemVer, gt } = require('semver');
const { httpExecutor } = require('builder-util/out/nodeHttpExecutor');
const { GitHubProvider } = require('electron-updater/out/providers/GitHubProvider');
const { NsisUpdater } = require('electron-updater/out/NsisUpdater');
const pkg = require('../package.json');
const local = yaml.load(fs.readFileSync(path.join(__dirname, '../release/latest.yml'), 'utf8'));
const provider = new GitHubProvider(pkg.build.publish[0], {
  currentVersion: new SemVer('1.6.0'), allowPrerelease: false, fullChangelog: false, channel: null
}, { executor: httpExecutor, platform: 'win32' });
(async () => {
  const info = await provider.getLatestVersion();
  assert.equal(info.version, pkg.version);
  assert.ok(gt(info.version, '1.6.0'));
  assert.equal(info.files[0].sha512, local.files[0].sha512);
  assert.equal(info.files[0].size, local.files[0].size);
  const files = provider.resolveFiles(info);
  assert.ok(files[0].url.href.endsWith(`/v${pkg.version}/METech-desktop-assistant-Setup-${pkg.version}.exe`));
  const previous = new NsisUpdater(null, { version:'1.6.0' }); previous.logger=null;
  const same = new NsisUpdater(null, { version:'1.7.0' }); same.logger=null;
  assert.equal(await previous.isUpdateAvailable(info),true);
  assert.equal(await same.isUpdateAvailable(info),false,'original 1.7.0 needs a one-time replacement install');
  console.log(`Existing 1.6.0 Windows update provider resolves ${info.version}: ${files[0].url.href}`);
  console.log('Actual updater version comparison: 1.6.0 detects replacement; same 1.7.0 correctly requires a one-time replacement install.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
