const test = require('node:test');
const assert = require('node:assert/strict');
const { parseNaturalLanguageTask } = require('../electron/natural-language-task.cjs');

const now = new Date(2026, 8, 12, 10, 0, 0).getTime();

test('parses a Traditional Chinese reminder with priority and time', () => {
  const result = parseNaturalLanguageTask('明天下午 3點提醒我緊急回覆客戶', now);
  assert.equal(result.success, true);
  assert.equal(result.title, '回覆客戶');
  assert.equal(result.color, 'red');
  assert.equal(result.alarmAt, new Date(2026, 8, 13, 15, 0, 0).getTime());
});

test('parses relative reminder durations locally', () => {
  const result = parseNaturalLanguageTask('30分鐘後提醒我休息', now);
  assert.equal(result.title, '休息');
  assert.equal(result.alarmAt, now + 30 * 60000);
});

test('creates a normal note when no date is provided', () => {
  const result = parseNaturalLanguageTask('新增待辦 整理報價單', now);
  assert.equal(result.title, '整理報價單');
  assert.equal(result.color, 'blue');
  assert.equal(result.alarmAt, null);
});

test('parses an English tomorrow PM reminder', () => {
  const result = parseNaturalLanguageTask('Remind me tomorrow at 3 PM to reply urgently', now);
  assert.equal(result.title, 'reply');
  assert.equal(result.color, 'red');
  assert.equal(result.alarmAt, new Date(2026, 8, 13, 15, 0, 0).getTime());
});
