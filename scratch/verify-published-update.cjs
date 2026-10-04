const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const { SemVer, gt } = require('semver');
const { httpExecutor } = require('builder-util/out/nodeHttpExecutor');
const { GitHubProvider } = require('electron-updater/out/providers/GitHubProvider');
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
  console.log(`Existing 1.6.0 Windows update provider resolves ${info.version}: ${files[0].url.href}`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
