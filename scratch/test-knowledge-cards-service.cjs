const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { KnowledgeCardsService, normalizeCard } = require('../electron/knowledge-cards-service.cjs');

function fixture(options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'metech-knowledge-'));
  const storagePath = path.join(directory, 'knowledge-cards.json');
  const sent = [];
  const timers = [];
  const service = new KnowledgeCardsService({
    storagePath,
    random: options.random || (() => 0),
    isBlocked: options.isBlocked || (() => false),
    getWindow: () => ({ isDestroyed: () => false, webContents: { send: (...args) => sent.push(args) } }),
    setTimeoutFn: (callback, delay) => { const timer = { callback, delay }; timers.push(timer); return timer; },
    clearTimeoutFn: () => {}
  });
  return { service, storagePath, sent, timers };
}

test('knowledge cards require a title and content and enforce local size limits', () => {
  assert.equal(normalizeCard({ title: '', content: '內容' }), null);
  assert.equal(normalizeCard({ title: '標題', content: '' }), null);
  const card = normalizeCard({ title: '標'.repeat(80), content: '內'.repeat(700) });
  assert.equal(card.title.length, 60);
  assert.equal(card.content.length, 500);
});

test('knowledge cards are saved locally with an allowed interval', () => {
  const { service, storagePath } = fixture();
  const result = service.saveConfig({ enabled: true, intervalMinutes: 30, cards: [{ title: 'SQL', content: '先查看執行計畫。' }] });
  assert.equal(result.success, true);
  assert.equal(result.config.intervalMinutes, 30);
  assert.equal(JSON.parse(fs.readFileSync(storagePath, 'utf8')).cards[0].title, 'SQL');
  service.stopScheduler();
});

test('quick-add appends one enabled card without changing reminder settings', () => {
  const { service } = fixture();
  service.saveConfig({ enabled: true, intervalMinutes: 40, cards: [{ id: 'existing', title: 'Existing', content: 'Keep me.' }] });
  const result = service.addCard({ title: 'SQL Index', content: 'Check the execution plan first.' });
  assert.equal(result.success, true);
  assert.equal(result.card.enabled, true);
  assert.equal(result.config.enabled, true);
  assert.equal(result.config.intervalMinutes, 40);
  assert.deepEqual(result.config.cards.map(card => card.title), ['Existing', 'SQL Index']);
  assert.equal(service.addCard({ title: '', content: 'Missing title' }).success, false);
  service.stopScheduler();
});

test('automatic cards do not repeat until every enabled card has appeared', () => {
  const { service, sent } = fixture();
  service.saveConfig({ enabled: true, intervalMinutes: 20, cards: [
    { id: 'a', title: 'A', content: 'Alpha' },
    { id: 'b', title: 'B', content: 'Beta' },
    { id: 'c', title: 'C', content: 'Gamma' }
  ] });
  service.trigger(false);
  service.trigger(false);
  service.trigger(false);
  const ids = sent.map(([, payload]) => payload.id);
  assert.equal(new Set(ids).size, 3);
  service.stopScheduler();
});

test('scheduler waits one minute when focus mode or another reminder blocks delivery', () => {
  let blocked = true;
  const { service, timers, sent } = fixture({ isBlocked: () => blocked });
  service.saveConfig({ enabled: true, intervalMinutes: 10, cards: [{ id: 'a', title: 'A', content: 'Alpha' }] });
  assert.equal(timers.at(-1).delay, 10 * 60000);
  timers.at(-1).callback();
  assert.equal(sent.length, 0);
  assert.equal(timers.at(-1).delay, 60000);
  blocked = false;
  timers.at(-1).callback();
  assert.equal(sent.length, 1);
  service.stopScheduler();
});

test('manual preview does not consume the automatic no-repeat cycle', () => {
  const { service, sent } = fixture();
  service.saveConfig({ enabled: true, intervalMinutes: 20, cards: [{ id: 'a', title: 'A', content: 'Alpha' }] });
  service.trigger(true);
  assert.equal(sent[0][1].isManual, true);
  assert.deepEqual(service.getConfig().remainingCardIds, []);
  service.stopScheduler();
});
