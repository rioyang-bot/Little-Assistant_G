const assert = require('node:assert/strict');
const test = require('node:test');
const {
  StickyNotesService,
  normalizeNote,
  sanitizeText
} = require('../electron/sticky-notes-service.cjs');

function createIsolatedService() {
  const service = Object.create(StickyNotesService.prototype);
  service.notes = [];
  service.persistCount = 0;
  service.persist = () => {
    service.persistCount += 1;
  };
  return service;
}

test('sticky note text and priority color input are normalized', () => {
  assert.equal(sanitizeText('  測試主旨  ', 80), '測試主旨');
  assert.equal(sanitizeText('x'.repeat(90), 80).length, 80);

  const normalized = normalizeNote({
    id: 'note-1',
    title: '  主旨  ',
    content: '內容',
    color: 'green',
    status: 'active'
  });
  assert.equal(normalized.title, '主旨');
  assert.equal(normalized.color, 'blue');
  assert.equal(normalized.status, 'active');
  assert.equal(normalized.items.length, 1);
  assert.equal(normalized.items[0].text, '內容');
});

test('multiple items use plain text and migrate earlier formatted runs safely', () => {
  const service = createIsolatedService();
  const created = service.create({
    title: '多事項',
    color: 'amber',
    items: [
      { text: '第一項' },
      { runs: [{ text: '<script>', bold: true }, { text: '第二項', underline: true }] }
    ]
  });
  assert.equal(created.note.items.length, 2);
  assert.equal(created.note.items[0].text, '第一項');
  assert.equal(created.note.items[1].text, '<script>第二項');
  assert.equal('runs' in created.note.items[1], false);
});

test('completing one item adds strike state without deleting its note', () => {
  const service = createIsolatedService();
  const note = service.create({
    title: '今日工作',
    items: [
      { text: '完成報價' },
      { text: '回覆郵件' }
    ]
  }).note;

  const result = service.updateItem(note.id, note.items[0].id, true);
  assert.equal(result.success, true);
  assert.equal(result.snapshot.active.length, 1);
  assert.equal(result.note.items[0].completed, true);
  assert.equal(result.note.items[1].completed, false);
  assert.equal(service.persistCount, 2);
});

test('a subject is required when creating a sticky note', () => {
  const service = createIsolatedService();
  const result = service.create({ title: '   ', content: '內容', color: 'red' });
  assert.equal(result.success, false);
  assert.equal(service.notes.length, 0);
  assert.equal(service.persistCount, 0);
});

test('completing a sticky note permanently removes it', () => {
  const service = createIsolatedService();
  const created = service.create({ title: '回覆客戶', content: '下午三點前完成', color: 'red' });

  assert.equal(created.success, true);
  assert.equal(created.snapshot.active.length, 1);

  const completed = service.complete(created.note.id);
  assert.equal(completed.success, true);
  assert.equal(completed.snapshot.active.length, 0);
  assert.equal(service.notes.length, 0);
  assert.equal(service.persistCount, 2);
});

test('completing one note does not remove other notes', () => {
  const service = createIsolatedService();
  const first = service.create({ title: '第一筆', color: 'red' }).note;
  const second = service.create({ title: '第二筆', color: 'blue' }).note;

  const result = service.complete(first.id);

  assert.equal(result.snapshot.active.length, 1);
  assert.equal(result.snapshot.active[0].id, second.id);
  assert.equal(service.notes.length, 1);
});

test('completing a missing note returns an error', () => {
  const service = createIsolatedService();
  const result = service.complete('missing-id');
  assert.equal(result.success, false);
  assert.equal(service.persistCount, 0);
});

test('a future sticky-note alarm is stored and emitted only once when due', () => {
  const service = createIsolatedService();
  const now = Date.now();
  const created = service.create({ title: '準時開會', alarmAt: now + 5000 });
  assert.equal(created.note.alarmAt, now + 5000);
  assert.equal(created.note.alarmTriggered, false);
  assert.equal(service.getDueAlarms(now).length, 0);
  const due = service.getDueAlarms(now + 5000);
  assert.equal(due.length, 1);
  assert.equal(due[0].title, '準時開會');
  assert.equal(service.getDueAlarms(now + 6000).length, 0);
});

test('past alarm input is discarded when creating a sticky note', () => {
  const service = createIsolatedService();
  const created = service.create({ title: '過期提醒', alarmAt: Date.now() - 1000 });
  assert.equal(created.note.alarmAt, null);
});

test('an existing sticky note can be edited and a past alarm is removed', () => {
  const service = createIsolatedService();
  const created = service.create({ title: '原始標題', items: [{ text: '原始事項' }], alarmAt: Date.now() + 60000 });
  const updated = service.update(created.note.id, {
    title: '修改後標題',
    items: [{ id: created.note.items[0].id, text: '修改後事項', completed: true }],
    color: 'red',
    alarmAt: Date.now() - 1000
  });
  assert.equal(updated.success, true);
  assert.equal(updated.note.title, '修改後標題');
  assert.equal(updated.note.items[0].text, '修改後事項');
  assert.equal(updated.note.items[0].completed, true);
  assert.equal(updated.note.color, 'red');
  assert.equal(updated.note.alarmAt, null);
});

test('sticky notes are sorted by urgent, important, then normal priority', () => {
  const service = createIsolatedService();
  service.create({ title: '一般事項', color: 'blue' });
  service.create({ title: '重要事項', color: 'amber' });
  service.create({ title: '緊急事項', color: 'red' });
  assert.deepEqual(
    service.getSnapshot().active.map(note => note.title),
    ['緊急事項', '重要事項', '一般事項']
  );
});
