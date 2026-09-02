const assert = require('node:assert/strict');
const test = require('node:test');
const {
  isNewerVersion,
  formatDisplayVersion,
  getReleaseNotes
} = require('../electron/version-utils.cjs');

test('formats the current internal version as Ver.1.2.0', () => {
  assert.equal(formatDisplayVersion('1.2.0'), 'Ver.1.2.0');
  assert.equal(formatDisplayVersion('1.2'), 'Ver.1.2.0');
  assert.equal(formatDisplayVersion('1.2.3'), 'Ver.1.2.3');
});

test('detects upgrades without treating equal versions or downgrades as updates', () => {
  assert.equal(isNewerVersion('1.1.0', '1.0.0'), true);
  assert.equal(isNewerVersion('2.0.0', '1.9.9'), true);
  assert.equal(isNewerVersion('1.0.0', '1.0.0'), false);
  assert.equal(isNewerVersion('1.0.0', '1.1.0'), false);
});

test('provides localized release notes and a fallback for future versions', () => {
  assert.ok(getReleaseNotes('1.2.0', 'zh-TW').length > 1);
  assert.ok(getReleaseNotes('1.2.0', 'en').length > 1);
  assert.ok(getReleaseNotes('1.1.0', 'zh-TW').length > 1);
  assert.ok(getReleaseNotes('1.1.0', 'en').length > 1);
  assert.ok(getReleaseNotes('1.0.0', 'zh-TW').length > 1);
  assert.ok(getReleaseNotes('1.0.0', 'en').length > 1);
  assert.equal(getReleaseNotes('9.9.9', 'zh-TW').length, 1);
});
