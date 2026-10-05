const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const asar = require('@electron/asar');
const root = path.join(__dirname, '..');
const archive = path.resolve(process.argv[2] || path.join(root, 'release/win-unpacked/resources/app.asar'));
const names = asar.listPackage(archive).map(name => name.replace(/^[\\/]+/, '').replace(/\\/g, '/'));
const pkg = JSON.parse(asar.extractFile(archive, 'package.json'));
assert.equal(pkg.version, require('../package.json').version);
const expectedVersion = require('../package.json').version;
assert.equal(pkg.version, expectedVersion);
assert.equal(pkg.main, 'electron/main.cjs');
for (const name of names) {
  assert.ok(!/^(scratch|\.snapshots|\.git)(\/|$)/.test(name), `Development artifact: ${name}`);
  assert.ok(!/^(email-config|calendar-config|pet-preferences|sticky-notes|sticky-notes-view|desktop-organizer|desktop-icon-visibility)\.json$/.test(name), `User data: ${name}`);
  assert.ok(!/^\.env($|\.)/.test(name), `Environment file: ${name}`);
}
function files(dir) {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(entry => {
    const name = `${dir}/${entry.name}`;
    return entry.isDirectory() ? files(name) : [name];
  });
}
const checked = [...files('electron'), ...files('dist'), ...files('assets')];
for (const name of checked) {
  assert.ok(names.includes(name), `Missing runtime file: ${name}`);
  assert.ok(asar.extractFile(archive, path.normalize(name)).equals(fs.readFileSync(path.join(root, name))), `Outdated packaged file: ${name}`);
}
const settings = asar.extractFile(archive, 'dist/email-settings.html').toString();
assert.ok(settings.includes(`Ver.${expectedVersion}`));
assert.ok(!settings.includes('Ver.1.6.0'));
for (const name of files('electron').filter(name => name.endsWith('.ps1'))) {
  assert.ok(fs.existsSync(path.join(archive + '.unpacked', name)), `Native helper must be unpacked: ${name}`);
}
console.log(`Verified version ${pkg.version}, ${checked.length} runtime/build/asset files and exclusion of user data: ${archive}`);
