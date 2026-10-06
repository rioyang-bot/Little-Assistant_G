const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DesktopOrganizer, normalizeBoard } = require('../electron/desktop-organizer.cjs');

// A board whose first item's file is deleted after it was collected.
function fixture(t, iconVisibility = false) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'organizer-missing-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const kept = path.join(dir, 'kept.txt'), gone = path.join(dir, 'METech小助手.lnk');
  fs.writeFileSync(kept, 'kept'); fs.writeFileSync(gone, 'shortcut');
  const handlers = {};
  const service = new DesktopOrganizer({
    ipcMain: { handle: (name, fn) => { handlers[name] = fn; } },
    organizerDrag: { async drag() { return 'Desktop'; } },
    organizerDesktopIcons: iconVisibility
  }, dir);
  service.register();
  const board = normalizeBoard(); service.boards.push(board);
  const sender = {}, event = { sender };
  service.windows.set(board.id, { webContents: sender, setMovable() {}, setTitle() {} });
  handlers['organizer-add'](event, [gone, kept]);
  fs.rmSync(gone);
  const missing = board.items.find(item => item.path === gone);
  return { service, handlers, board, event, missing, kept };
}

test('a missing file gets a removal menu instead of an error', async t => {
  const { handlers, event, missing } = fixture(t);
  assert.deepEqual(await handlers['organizer-context-menu'](event, missing.id, { x: 10, y: 10 }), { fallback: true, missing: true });
  assert.deepEqual(await handlers['organizer-icon'](event, missing.id), { missing: true });
});

test('a missing file can be removed from the board', async t => {
  const { handlers, board, event, missing, kept } = fixture(t);
  await handlers['organizer-remove'](event, missing.id);
  assert.deepEqual(board.items.map(item => item.path), [kept]);
});

test('a missing legacy item with no file at either location is removed without moving anything', async t => {
  const { service, handlers, board, event, missing } = fixture(t);
  missing.originalPath = path.join(os.tmpdir(), `organizer-missing-original-${process.pid}.lnk`);
  missing.path = path.join(service.filesRoot, 'gone.lnk');
  await handlers['organizer-remove'](event, missing.id);
  assert.equal(board.items.some(item => item.id === missing.id), false);
});

test('errors about other protected shortcuts do not block removal; this entry\'s own error does', async t => {
  const reported = [];
  const iconVisibility = { sync: async () => reported };
  const { handlers, board, event, missing, kept } = fixture(t, iconVisibility);
  reported.push('Protected.lnk：此桌面項目受到權限保護', '部分桌面捷徑受權限保護，請安裝背景輔助程序。');
  await handlers['organizer-remove'](event, missing.id);
  assert.deepEqual(board.items.map(item => item.path), [kept]);
  const keptItem = board.items[0];
  reported.push('kept.txt：無法還原桌面圖示');
  await assert.rejects(handlers['organizer-remove'](event, keptItem.id), /kept\.txt：無法還原桌面圖示/);
  assert.equal(board.items.length, 1, 'an entry whose icon could not be shown again stays');
});

test('refresh removes deleted entries but keeps entries whose location is unavailable', async t => {
  const { service, handlers, board, event, missing, kept } = fixture(t);
  const offline = path.join(service.filesRoot, '..', 'offline-drive');
  fs.mkdirSync(offline, { recursive: true });
  const unavailable = path.join(offline, 'report.docx');
  fs.writeFileSync(unavailable, 'report');
  handlers['organizer-add'](event, [unavailable]);
  fs.rmSync(offline, { recursive: true });   // the whole location disappears, like an unplugged drive
  const result = await handlers['organizer-refresh'](event);
  assert.equal(result.removed, 1);
  assert.deepEqual(board.items.map(item => item.path), [kept, unavailable]);
  assert.equal(board.items.some(item => item.id === missing.id), false);
});

test('refresh lives in F5 and the background menu, and missing items are dimmed', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'desktop-organizer.html'), 'utf8');
  const script = fs.readFileSync(path.join(root, 'src/desktop-organizer.js'), 'utf8');
  assert.doesNotMatch(html, /id="refresh"/, 'the title bar has no separate refresh button');
  assert.match(script, /event\.key === 'F5'[\s\S]*?refresh\(\)/);
  assert.match(script, /icon\.missing[\s\S]*?classList\.add\('missing'\)/);
  assert.match(script, /\$\('open'\)\.hidden = \$\('reveal'\)\.hidden = result\.missing === true/);
  assert.match(script, /api\.invoke\('organizer-refresh'\)/);
  assert.match(script, /allIds\.every\(id=>missingIds\.has\(id\)\)/, 'missing entries move inside the window');
});
