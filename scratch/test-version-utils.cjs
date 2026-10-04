const assert = require('node:assert/strict');
const test = require('node:test');
const {
  isNewerVersion,
  formatDisplayVersion,
  getReleaseNotes
} = require('../electron/version-utils.cjs');

test('formats internal versions for display', () => {
  assert.equal(formatDisplayVersion('1.7.0'), 'Ver.1.7.0');
  assert.equal(formatDisplayVersion('1.2.0'), 'Ver.1.2.0');
  assert.equal(formatDisplayVersion('1.2'), 'Ver.1.2.0');
  assert.equal(formatDisplayVersion('1.2.3'), 'Ver.1.2.3');
  assert.equal(formatDisplayVersion('1.4.0'), 'Ver.1.4.0');
});

test('version 1.7 release notes describe desktop organizers in both languages', () => {
  const zh = getReleaseNotes('1.7.0', 'zh-TW').join('\n');
  const en = getReleaseNotes('1.7.0', 'en').join('\n');
  assert.match(zh, /桌面整理/); assert.match(zh, /保留原檔案名稱與路徑/);
  assert.match(zh, /彈出視窗/); assert.match(zh, /鎖定/);
  assert.match(en, /desktop organizers/i); assert.match(en, /preserving original names and paths/i);
});

test('version 1.4 release notes include bear visibility, shortcut layout, Logo upload, and the total limit', () => {
  const zhNotes = getReleaseNotes('1.4.0', 'zh-TW').join('\n');
  const enNotes = getReleaseNotes('1.4.0', 'en').join('\n');
  assert.match(zhNotes, /隱藏小熊/);
  assert.match(zhNotes, /每欄最多五個/);
  assert.match(zhNotes, /每欄最多九個/);
  assert.match(zhNotes, /20 個/);
  assert.match(zhNotes, /Logo/);
  assert.match(enNotes, /Hide Bear/i);
  assert.match(enNotes, /five shortcuts per column/i);
  assert.match(enNotes, /20 entries/i);
  assert.match(enNotes, /Logo/i);
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

test('version 1.3 release notes include shortcuts, per-item browsers, transparency, and same-monitor settings', () => {
  const zhNotes = getReleaseNotes('1.3.0', 'zh-TW').join('\n');
  const enNotes = getReleaseNotes('1.3.0', 'en').join('\n');
  assert.match(zhNotes, /快捷.*拖曳|拖曳.*快捷/);
  assert.match(zhNotes, /自動偵測.*瀏覽器/);
  assert.match(zhNotes, /透明度/);
  assert.match(zhNotes, /同一台螢幕/);
  assert.match(zhNotes, /手指游標/);
  assert.match(zhNotes, /展開按鈕/);
  assert.match(enNotes, /transparency/i);
  assert.match(enNotes, /detected automatically/i);
  assert.match(enNotes, /same-monitor/i);
  assert.match(enNotes, /pointer cursor/i);
  assert.match(enNotes, /arrow button/i);
});
