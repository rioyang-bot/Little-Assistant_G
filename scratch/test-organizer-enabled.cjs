const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DesktopOrganizer, normalizeBoard } = require('../electron/desktop-organizer.cjs');

const laptop = { id: 1, bounds: { x: 0, y: 0, width: 1536, height: 864 }, workArea: { x: 0, y: 0, width: 1536, height: 816 }, scaleFactor: 1.25 };

function fixture(t, dir = fs.mkdtempSync(path.join(os.tmpdir(), 'organizer-enabled-'))) {
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const state = { changes: 0, synced: [] };
  const screen = { getAllDisplays: () => [laptop], getDisplayMatching: () => laptop };
  const icons = { sync: async paths => { state.synced.push(paths); return []; }, dispose() {} };
  const service = new DesktopOrganizer({ screen, organizerDesktopIcons: icons, organizerDrag: {} }, dir, () => { state.changes++; });
  return { service, state, dir };
}

function addBoard(service, dir, id) {
  const board = normalizeBoard({ id, bounds: { x: 20, y: 20, width: 400, height: 300 }, items: [{ id: id + '-a', path: path.join(dir, id + '.txt'), position: { x: 8, y: 12 } }] });
  service.boards.push(board);
  const win = { destroyed: false, isDestroyed: () => win.destroyed, destroy: () => { win.destroyed = true; } };
  service.windows.set(id, win);
  return { board, win };
}

test('the organizer is on by default', t => {
  const { service } = fixture(t);
  assert.equal(service.enabled, true);
});

test('turning it off closes the windows, shows the items on the desktop and is remembered', async t => {
  const { service, state, dir } = fixture(t);
  const apps = addBoard(service, dir, 'apps');
  const docs = addBoard(service, dir, 'docs');
  assert.deepEqual(service.desktopPaths().sort(), [path.join(dir, 'apps.txt'), path.join(dir, 'docs.txt')].sort());

  assert.equal(await service.setEnabled(false), true);
  assert.equal(service.enabled, false);
  assert.ok(apps.win.destroyed && docs.win.destroyed, 'organizer windows are closed');
  assert.equal(service.windows.size, 0);
  assert.deepEqual(state.synced.at(-1), [], 'no desktop item stays hidden');
  assert.ok(state.changes > 0, 'the tray menu is refreshed');

  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'desktop-organizer.json'), 'utf8'));
  assert.equal(saved.enabled, false);
  assert.deepEqual(saved.boards.map(board => board.id), ['apps', 'docs'], 'boards are kept');
  assert.deepEqual(saved.boards[0].items[0].position, { x: 8, y: 12 }, 'arrangement is kept');

  // Next start (reboot or relaunch): still off, nothing opens or hides.
  const restarted = new DesktopOrganizer({ screen: service.electron.screen, organizerDesktopIcons: false, organizerDrag: {} }, dir);
  assert.equal(restarted.enabled, false);
  assert.equal(restarted.boards.length, 2);
  assert.deepEqual(restarted.desktopPaths(), []);
  assert.equal(restarted.show(restarted.boards[0]), null, 'no window opens while off');
  restarted.restore();
  restarted.create();
  assert.equal(restarted.boards.length, 2, 'no organizer is added while off');
  assert.throws(() => restarted.restoreSnapshot('missing'), /找不到這個快照/);
});

test('turning it on again reopens the organizers and hides their items', async t => {
  const { service, state, dir } = fixture(t);
  addBoard(service, dir, 'apps');
  await service.setEnabled(false);
  const shown = [];
  service.show = board => { shown.push(board.id); return null; };
  await service.setEnabled(true);
  assert.equal(service.enabled, true);
  assert.deepEqual(shown, ['apps']);
  assert.deepEqual(state.synced.at(-1), [path.join(dir, 'apps.txt')]);
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'desktop-organizer.json'), 'utf8'));
  assert.equal(saved.enabled, true);

  // A restart keeps it on.
  const restarted = new DesktopOrganizer({ screen: service.electron.screen, organizerDesktopIcons: false, organizerDrag: {} }, dir);
  assert.equal(restarted.enabled, true);
});

test('switching waits for a file drag or a permission change to finish', async t => {
  const { service, dir } = fixture(t);
  addBoard(service, dir, 'apps');
  service.activeDrag = true;
  await assert.rejects(service.setEnabled(false), /檔案拖曳/);
  assert.equal(service.enabled, true);
  service.activeDrag = false;
  service.permissionOperation = true;
  await assert.rejects(service.setEnabled(false), /權限/);
  service.permissionOperation = false;
  assert.equal(await service.setEnabled(true), true, 'already on: nothing to do');
});
