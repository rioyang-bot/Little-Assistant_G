const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DesktopOrganizer, normalizeBoard } = require('../electron/desktop-organizer.cjs');

// Board three columns wide, a fake desktop folder and a scripted native menu.
function fixture(t, pick = () => null) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'organizer-background-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const desktop = path.join(dir, 'Desktop'); fs.mkdirSync(desktop);
  const handlers = {}, menus = [];
  const service = new DesktopOrganizer({
    ipcMain: { handle: (name, fn) => { handlers[name] = fn; } },
    app: { getPath: () => desktop },
    organizerDesktopIcons: false, organizerDrag: {}, organizerContextMenu: { async show() { return {}; } },
    Menu: { buildFromTemplate: template => ({ popup: ({ callback }) => { menus.push(template); pick(template); callback(); } }) }
  }, dir);
  service.register();
  const board = normalizeBoard(); service.boards.push(board);
  const sender = {}, event = { sender };
  service.windows.set(board.id, { webContents: sender, setMovable() {}, setTitle() {}, getBounds: () => ({ x: 0, y: 0, width: 16 + 88 * 3, height: 400 }) });
  return { service, handlers, board, event, desktop, dir, menus };
}
const click = (template, ...labels) => {
  let entries = template;
  for (const label of labels.slice(0, -1)) entries = entries.find(entry => entry.label === label).submenu;
  entries.find(entry => entry.label === labels.at(-1)).click();
};

test('menu actions sort (folders first, natural order, missing last), refresh and create items', async t => {
  let next = null;
  const { handlers, board, event, desktop, menus } = fixture(t, template => { if (next) click(template, ...next); });
  const make = (name, folder, size = 1, mtime) => {
    const file = path.join(desktop, name);
    if (folder) fs.mkdirSync(file); else fs.writeFileSync(file, 'x'.repeat(size));
    if (mtime) fs.utimesSync(file, mtime, mtime);
    return file;
  };
  const files = [make('file10.txt', false, 30, new Date('2026-01-03')), make('B資料夾', true), make('file2.md', false, 10, new Date('2026-01-01')),
    make('A資料夾', true), make('file3.txt', false, 20, new Date('2026-01-02')), make('gone.txt')];
  handlers['organizer-add'](event, files);
  fs.rmSync(files[5]);
  const order = () => board.items.map(item => path.basename(item.path));

  next = null;
  assert.deepEqual(await handlers['organizer-background-menu'](event, {}), { action: null }, 'closing the menu changes nothing');

  next = ['排序方式', '名稱'];
  await handlers['organizer-background-menu'](event, {});
  assert.deepEqual(order(), ['A資料夾', 'B資料夾', 'file2.md', 'file3.txt', 'file10.txt', 'gone.txt']);
  assert.deepEqual(board.items.slice(0, 4).map(item => item.position), [{ x: 8, y: 12 }, { x: 96, y: 12 }, { x: 184, y: 12 }, { x: 8, y: 116 }], 'reading order, three columns');

  next = ['排序方式', '大小'];
  await handlers['organizer-background-menu'](event, {});
  assert.deepEqual(order().slice(2, 5), ['file2.md', 'file3.txt', 'file10.txt']);
  next = ['排序方式', '修改日期'];
  await handlers['organizer-background-menu'](event, {});
  assert.deepEqual(order().slice(2, 5), ['file10.txt', 'file3.txt', 'file2.md'], 'newest first');
  next = ['排序方式', '項目類型'];
  await handlers['organizer-background-menu'](event, {});
  assert.deepEqual(order().slice(2, 5), ['file2.md', 'file3.txt', 'file10.txt'], '.md before .txt, then by name');

  assert.equal(menus.at(-1).some(entry => entry.label === '檢視'), false, 'no view/arrangement submenu');

  next = ['重新整理'];
  const refreshed = await handlers['organizer-background-menu'](event, {});
  assert.equal(refreshed.removed, 1);
  assert.equal(order().includes('gone.txt'), false);

  next = ['新增', '資料夾'];
  const folder = await handlers['organizer-background-menu'](event, { itemX: 200, itemY: 150 });
  assert.equal(fs.statSync(path.join(desktop, '新增資料夾')).isDirectory(), true);
  assert.equal(board.items.find(item => item.id === folder.newId).path, path.join(desktop, '新增資料夾'));
  const second = await handlers['organizer-background-menu'](event, {});
  assert.equal(board.items.find(item => item.id === second.newId).path, path.join(desktop, '新增資料夾 (2)'), 'unique names like Windows');
  next = ['新增', '文字文件'];
  const text = await handlers['organizer-background-menu'](event, {});
  assert.equal(fs.readFileSync(path.join(desktop, '新增文字文件.txt'), 'utf8'), '');
  assert.ok(board.items.some(item => item.id === text.newId));
});

test('a locked board can still refresh, sort and create items', async t => {
  let next = null;
  const { handlers, board, event, desktop, menus } = fixture(t, template => { if (next) click(template, ...next); });
  for (const name of ['b.txt', 'a.txt']) fs.writeFileSync(path.join(desktop, name), name);
  handlers['organizer-add'](event, ['b.txt', 'a.txt'].map(name => path.join(desktop, name)));
  board.locked = true;
  next = ['排序方式', '名稱'];
  await handlers['organizer-background-menu'](event, {});
  assert.deepEqual(board.items.map(item => path.basename(item.path)), ['a.txt', 'b.txt']);
  const template = menus.at(-1);
  for (const label of ['重新整理', '排序方式', '新增', '整理視窗設定…', '解鎖整理視窗', '隱藏整理視窗']) assert.notEqual(template.find(entry => entry.label === label).enabled, false, label);
  assert.equal(template.some(entry => /（已鎖定）/.test(entry.label || '')), false, 'no lock labels');
  assert.equal(template.find(entry => entry.label === '重新整理').accelerator, undefined, 'no F5 text; the menu shows the ↻ icon');
  next = ['新增', '資料夾'];
  const created = await handlers['organizer-background-menu'](event, {});
  assert.ok(board.items.some(item => item.id === created.newId));
  assert.equal(board.locked, true, 'the board stays locked');
});

test('the refresh menu icon is a 32 px ↻ drawn for a 16 px menu', () => {
  const { PNG } = require('pngjs');
  const { refreshIconPng } = require('../electron/menu-icons.cjs');
  const image = PNG.sync.read(refreshIconPng([255, 255, 255]));
  assert.deepEqual([image.width, image.height], [32, 32]);
  const alpha = (x, y) => image.data[(y * 32 + x) * 4 + 3];
  assert.equal(alpha(16, 16), 0, 'open centre');
  assert.ok(alpha(16, 26) > 200, 'ring at the bottom');
  assert.ok(alpha(6, 16) > 200, 'ring on the left');
  assert.ok(alpha(24, 9) < 60, 'gap at the upper right');
});

test('title bar display mode defaults to always, accepts never/hover/always and is saved', async t => {
  const { handlers, board, event } = fixture(t);
  assert.equal(normalizeBoard().headerMode, 'always');
  assert.equal(normalizeBoard({ headerMode: 'sometimes' }).headerMode, 'always');
  for (const mode of ['never', 'hover', 'always']) {
    handlers['organizer-update'](event, { headerMode: mode });
    assert.equal(board.headerMode, mode);
  }
  handlers['organizer-update'](event, { headerMode: 'bogus' });
  assert.equal(board.headerMode, 'always', 'invalid values are ignored');
});

test('the background menu keeps title-bar actions reachable: settings, lock/unlock and hide', async t => {
  let next = null;
  const { service, handlers, board, event, menus } = fixture(t, template => { if (next) click(template, ...next); });
  const modes = [], opened = [];
  let hidden = false;
  service.layers.set(board.id, { setMode: mode => modes.push(mode), withModal: task => task() });
  service.windows.get(board.id).hide = () => { hidden = true; };
  service.openSettings = async target => { opened.push(target.id); };

  next = null;
  await handlers['organizer-background-menu'](event, {});
  const labels = menus.at(-1).map(entry => entry.label).filter(Boolean);
  assert.deepEqual(labels, ['重新整理', '排序方式', '新增', '整理視窗設定…', '鎖定整理視窗', '隱藏整理視窗']);

  next = ['整理視窗設定…'];
  await handlers['organizer-background-menu'](event, {});
  assert.deepEqual(opened, [board.id]);

  next = ['鎖定整理視窗'];
  await handlers['organizer-background-menu'](event, {});
  assert.equal(board.locked, true);
  assert.deepEqual(modes, ['bottom'], 'locking keeps the window at the bottom');
  next = null;
  await handlers['organizer-background-menu'](event, {});
  assert.notEqual(menus.at(-1).find(entry => entry.label === '整理視窗設定…').enabled, false, 'settings are available while locked');
  assert.ok(menus.at(-1).some(entry => entry.label === '解鎖整理視窗'));

  next = ['解鎖整理視窗'];
  await handlers['organizer-background-menu'](event, {});
  assert.equal(board.locked, false);
  assert.deepEqual(modes, ['bottom', 'normal']);

  next = ['隱藏整理視窗'];
  await handlers['organizer-background-menu'](event, {});
  assert.equal(hidden, true);
});

test('menu icons render at 32 px and the organizer list badges show both states', () => {
  const { PNG } = require('pngjs');
  const { iconPng } = require('../electron/menu-icons.cjs');
  const read = name => PNG.sync.read(iconPng(name, [255, 255, 255]));
  const alpha = (image, x, y) => image.data[(y * 32 + x) * 4 + 3];
  const names = ['refresh', 'locked', 'unlocked', 'visible', 'hidden', 'board:visible:unlocked', 'board:visible:locked', 'board:hidden:unlocked', 'board:hidden:locked'];
  const images = Object.fromEntries(names.map(name => [name, read(name)]));
  for (const name of names) assert.deepEqual([images[name].width, images[name].height], [32, 32], name);
  assert.throws(() => iconPng('unknown'), /Unknown menu icon/);
  // Padlock badge in the lower right appears only for locked boards.
  assert.ok(alpha(images['board:visible:locked'], 20, 27) > 200, 'locked badge (solid part of the padlock body)');
  assert.ok(alpha(images['board:visible:unlocked'], 20, 27) < 40, 'no badge when unlocked');
  // The open padlock leaves a gap above the left side of the body.
  assert.ok(alpha(images.locked, 10, 14) > 200 && alpha(images.unlocked, 10, 13) < 40, 'open and closed shackles differ');
  // Visible eyes have a pupil; hidden eyes do not.
  assert.ok(alpha(images.visible, 16, 16) > 200 && alpha(images.hidden, 18, 14) < 40);
  assert.notDeepEqual(images['board:visible:unlocked'].data, images['board:hidden:unlocked'].data);
});
