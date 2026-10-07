const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DesktopOrganizer, normalizeBoard } = require('../electron/desktop-organizer.cjs');

const laptop = { id: 1, internal: true, bounds: { x: 0, y: 0, width: 1536, height: 864 }, workArea: { x: 0, y: 0, width: 1536, height: 816 }, scaleFactor: 1.25 };
const monitor = { id: 2, internal: false, bounds: { x: 0, y: 0, width: 2560, height: 1440 }, workArea: { x: 0, y: 0, width: 2560, height: 1392 }, scaleFactor: 1.5 };

function fixture(t, displays = [laptop]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'organizer-snapshots-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const state = { displays, changes: 0 };
  const screen = { getAllDisplays: () => state.displays, getDisplayMatching: () => state.displays[0] };
  const service = new DesktopOrganizer({ screen, organizerDesktopIcons: false, organizerDrag: {} }, dir, () => { state.changes++; });
  const item = (id, x, y) => ({ id, path: path.join(dir, id + '.txt'), position: { x, y } });
  const windows = {};
  for (const [id, bounds, items] of [['apps', { x: 11, y: 2, width: 500, height: 466 }, [item('a', 8, 12), item('b', 96, 12)]], ['docs', { x: 930, y: 0, width: 590, height: 370 }, [item('c', 8, 12)]]]) {
    const board = normalizeBoard({ id, bounds, items });
    service.boards.push(board);
    const win = {
      bounds: { ...bounds }, visible: true, minimized: false, sent: [],
      getBounds: () => ({ ...win.bounds }), setBounds: next => { win.bounds = { ...next }; },
      isDestroyed: () => false, isVisible: () => win.visible && !win.minimized, isMinimized: () => win.minimized,
      showInactive: () => { win.visible = true; win.minimized = false; }, hide: () => { win.visible = false; },
      webContents: { send: (channel, payload) => win.sent.push([channel, JSON.parse(JSON.stringify(payload))]) }
    };
    service.windows.set(id, win);
    windows[id] = win;
  }
  return { service, state, windows, dir, item };
}
const positions = board => Object.fromEntries(board.items.map(entry => [entry.id, entry.position]));

test('a snapshot records every organizer and is named by date and screen mode', t => {
  const { service, state } = fixture(t);
  const snapshot = service.createSnapshot(new Date(2026, 9, 7, 17, 5));
  assert.equal(snapshot.name, '2026-10-07 17:05（僅電腦螢幕）');
  assert.deepEqual(snapshot.boards.map(board => board.id), ['apps', 'docs']);
  assert.deepEqual(snapshot.boards[0].bounds, { x: 11, y: 2, width: 500, height: 466 });
  assert.deepEqual(snapshot.boards[0].items, { a: { x: 8, y: 12 }, b: { x: 96, y: 12 } });
  assert.equal(snapshot.boards[0].visible, true);
  assert.equal(state.changes, 1, 'the tray menu is refreshed');
  state.displays = [monitor];
  assert.match(service.createSnapshot().name, /（僅第二個螢幕）$/);
  state.displays = [laptop, { ...monitor, bounds: { ...monitor.bounds, y: -1440 } }];
  assert.match(service.createSnapshot().name, /（延伸 2 個螢幕）$/);
  assert.equal(service.snapshots().length, 3, 'snapshots are kept in their own file');
  assert.ok(fs.existsSync(service.snapshotFile));
});

test('restoring a snapshot brings back windows, icons and visibility', t => {
  const { service, windows, item } = fixture(t);
  const snapshot = service.createSnapshot();
  const [apps, docs] = service.boards;

  // The arrangement gets messed up, an icon is added and a window is hidden.
  windows.apps.bounds = { x: 134, y: 7, width: 866, height: 254 };
  apps.items[0].position = { x: 600, y: 12 };
  apps.items.push(item('new', 8, 12));
  windows.docs.visible = false;

  service.restoreSnapshot(snapshot.id);
  assert.deepEqual(windows.apps.bounds, { x: 11, y: 2, width: 500, height: 466 });
  const restored = positions(apps);
  assert.deepEqual(restored.a, { x: 8, y: 12 });
  assert.deepEqual(restored.b, { x: 96, y: 12 });
  assert.ok(restored.new && JSON.stringify(restored.new) !== JSON.stringify(restored.a) && JSON.stringify(restored.new) !== JSON.stringify(restored.b), 'a later icon gets a free slot');
  assert.equal(windows.docs.visible, true, 'shown again as in the snapshot');
  assert.ok(windows.apps.sent.some(([channel]) => channel === 'organizer-items-updated'), 'icons re-render');
  const key = service.displayKey();
  assert.deepEqual({ ...apps.layouts[key], items: undefined }, { x: 11, y: 2, width: 500, height: 466, items: undefined });
  assert.equal(apps.layouts[key].auto, undefined, 'it becomes the layout for these screens');
  const saved = JSON.parse(fs.readFileSync(service.file, 'utf8')).boards.find(board => board.id === 'apps');
  assert.deepEqual(saved.items.find(entry => entry.id === 'a').position, { x: 8, y: 12 }, 'saved');
  assert.ok(docs);
});

test('hidden organizers stay hidden; deleted ones are skipped; minimized ones count as shown', t => {
  const { service, windows } = fixture(t);
  windows.docs.visible = false;
  windows.apps.minimized = true;
  const snapshot = service.createSnapshot();
  assert.deepEqual(snapshot.boards.map(board => board.visible), [true, false]);
  windows.docs.visible = true;
  service.boards = service.boards.filter(board => board.id !== 'apps');
  service.restoreSnapshot(snapshot.id);
  assert.equal(windows.docs.visible, false);
  assert.equal(windows.apps.minimized, true, 'a deleted organizer is not touched');
});

test('a snapshot from a larger screen is fitted onto a smaller one', t => {
  const { service, state, windows } = fixture(t, [monitor]);
  windows.apps.bounds = { x: 1800, y: 1100, width: 700, height: 300 };
  const snapshot = service.createSnapshot();
  state.displays = [laptop];
  service.restoreSnapshot(snapshot.id);
  assert.deepEqual(windows.apps.bounds, { x: 836, y: 516, width: 700, height: 300 });
});

test('snapshots can be deleted, are capped at 20 and are validated', t => {
  const { service } = fixture(t);
  const first = service.createSnapshot();
  for (let i = 0; i < 21; i++) service.createSnapshot();
  const list = service.snapshots();
  assert.equal(list.length, 20);
  assert.equal(list.some(snapshot => snapshot.id === first.id), false, 'the oldest ones are dropped');
  assert.equal(service.deleteSnapshot(list[0].id), true);
  assert.equal(service.snapshots().length, 19);
  assert.equal(service.deleteSnapshot('missing'), false);
  assert.throws(() => service.restoreSnapshot('missing'), /找不到這個快照/);

  fs.writeFileSync(service.snapshotFile, JSON.stringify({ snapshots: [
    { id: 'ok', name: 'x'.repeat(200), createdAt: 1, boards: [{ id: 'apps', bounds: { x: 1, y: 2, width: 99999, height: 300 }, items: { a: { x: 1, y: 2 }, 'bad id!': { x: 1, y: 1 } } }, { id: '../x' }] },
    { id: 'bad id', createdAt: 1, boards: [] },
    'nonsense'
  ] }));
  const [only, ...rest] = service.snapshots();
  assert.equal(rest.length, 0);
  assert.equal(only.name.length, 80);
  assert.deepEqual(only.boards, [{ id: 'apps', visible: true, bounds: { x: 1, y: 2, width: 1400, height: 300 }, items: { a: { x: 1, y: 2 } } }]);
  fs.writeFileSync(service.snapshotFile, '{broken');
  assert.deepEqual(service.snapshots(), []);
});

test('restoring waits for a file drag to finish', t => {
  const { service } = fixture(t);
  const snapshot = service.createSnapshot();
  service.activeDrag = {};
  assert.throws(() => service.restoreSnapshot(snapshot.id), /檔案拖曳/);
});
