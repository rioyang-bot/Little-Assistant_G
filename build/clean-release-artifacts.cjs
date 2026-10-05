const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const yaml = require('js-yaml');

function cleanReleaseArtifacts(workspaceRoot = path.resolve(__dirname, '..')) {
  const workspace = fs.realpathSync(workspaceRoot);
  const root = path.join(workspace, 'release');
  assert.ok(!fs.lstatSync(root).isSymbolicLink(), 'Release directory must not be a link');
  const releaseRoot = fs.realpathSync(root);
  const relativeRoot = path.relative(workspace, releaseRoot);
  assert.equal(relativeRoot, 'release', 'Release directory must stay inside this workspace');
  const pkg = JSON.parse(fs.readFileSync(path.join(workspace, 'package.json'), 'utf8'));
  const name = `METech-desktop-assistant-Setup-${pkg.version}.exe`;
  const current = path.join(releaseRoot, name);
  assert.ok(fs.lstatSync(current).isFile() && !fs.lstatSync(current).isSymbolicLink(), 'Current installer must be a regular file');
  const metadata = yaml.load(fs.readFileSync(path.join(releaseRoot, 'latest.yml'), 'utf8'));
  const bytes = fs.readFileSync(current);
  const digest = crypto.createHash('sha512').update(bytes).digest('base64');
  assert.equal(metadata.version, pkg.version);
  assert.equal(metadata.path, name);
  assert.equal(metadata.files.length, 1);
  assert.equal(metadata.files[0].url, name);
  assert.equal(metadata.files[0].size, bytes.length);
  assert.equal(metadata.sha512, digest);
  assert.equal(metadata.files[0].sha512, digest);
  assert.ok(fs.statSync(current + '.blockmap').size > 0, 'Current update blockmap must exist');
  const keep = new Set([current, current + '.blockmap']);
  const artifactPattern = /^METech(?:-desktop-assistant|小助手)[- ](?:Setup|Portable)[- ]\d[\w.+-]*\.(?:exe|zip|7z)(?:\.(?:blockmap|incomplete|staged-[\w-]+|previous-[\w-]+))?$/i;
  const intermediatePattern = /^METech-desktop-assistant-\d[\w.+-]*\.nsis\.7z$/i;
  const removed = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, {withFileTypes:true})) {
      const file = path.join(directory, entry.name);
      if (fs.lstatSync(file).isSymbolicLink()) continue;
      const relative = path.relative(releaseRoot, fs.realpathSync(file));
      assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'Cleanup target must remain inside release');
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile() && !keep.has(file) && (artifactPattern.test(entry.name) || intermediatePattern.test(entry.name))) {
        fs.unlinkSync(file);
        removed.push(relative);
      }
    }
  }
  visit(releaseRoot);
  return {installer:current, removed};
}

module.exports = {cleanReleaseArtifacts};
if (require.main === module) {
  const result = cleanReleaseArtifacts();
  console.log(`Kept one distribution installer; removed ${result.removed.length} obsolete or duplicate release artifacts.`);
  console.log(result.installer);
}
