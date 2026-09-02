const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { getStoragePath } = require('../electron/storage-utils.cjs');

test('getStoragePath uses userData and migrates a legacy config once', (t) => {
  const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'metech-storage-test-'));
  const userDir = path.join(testRoot, 'userData');
  const legacyDir = path.join(testRoot, 'legacy');
  fs.mkdirSync(legacyDir, { recursive: true });
  t.after(() => fs.rmSync(testRoot, { recursive: true, force: true }));

  const filename = 'email-config.json';
  const legacyConfig = { enabled: true, accounts: [{ id: 'fake-test-account' }] };
  fs.writeFileSync(path.join(legacyDir, filename), JSON.stringify(legacyConfig), 'utf8');

  const resolvedPath = getStoragePath(filename, { userDir, legacyDir });

  assert.equal(resolvedPath, path.join(userDir, filename));
  assert.equal(fs.existsSync(resolvedPath), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(resolvedPath, 'utf8')), legacyConfig);

  const currentConfig = { enabled: false, marker: 'keep-current' };
  fs.writeFileSync(resolvedPath, JSON.stringify(currentConfig), 'utf8');
  getStoragePath(filename, { userDir, legacyDir });
  assert.deepEqual(JSON.parse(fs.readFileSync(resolvedPath, 'utf8')), currentConfig);
});

test('different service configs resolve to separate files', (t) => {
  const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'metech-storage-test-'));
  const userDir = path.join(testRoot, 'userData');
  const legacyDir = path.join(testRoot, 'legacy');
  fs.mkdirSync(legacyDir, { recursive: true });
  t.after(() => fs.rmSync(testRoot, { recursive: true, force: true }));

  const paths = [
    getStoragePath('email-config.json', { userDir, legacyDir }),
    getStoragePath('calendar-config.json', { userDir, legacyDir }),
    getStoragePath('trivia-config.json', { userDir, legacyDir })
  ];

  assert.equal(new Set(paths).size, 3);
  assert.ok(paths.every(file => path.dirname(file) === userDir));
});
