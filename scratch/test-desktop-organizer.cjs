const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DesktopOrganizer, normalizeBoard } = require('../electron/desktop-organizer.cjs');

test('late desktop visibility failures reach open organizer windows and clear after retry', async () => {
  let finish;
  const service = new DesktopOrganizer({ organizerDesktopIcons: { sync: () => new Promise(resolve => { finish = resolve; }) } }, path.join(os.tmpdir(), 'organizer-startup-icons-' + process.pid));
  const board = normalizeBoard({ title: '桌面項目' });
  service.boards.push(board);
  const messages = [];
  service.windows.set(board.id, { webContents: { send: (channel, data) => messages.push({ channel, data }) } });
  const pending = service.syncDesktopIcons();
  assert.equal(messages.length, 0);
  finish(['管理員確認未完成']);
  await pending;
  assert.equal(messages[0].channel, 'organizer-view-updated');
  assert.equal(messages[0].data.statusOnly, true, 'icon status must not rebuild file nodes during dragging');
  assert.deepEqual(messages[0].data.migrationErrors, ['管理員確認未完成']);
  service.iconVisibility.sync = async () => [];
  await service.syncDesktopIcons();
  assert.deepEqual(messages[1].data.migrationErrors, []);
  service.quitting = true;
  await service.syncDesktopIcons();
  assert.equal(messages.length, 2, 'late native responses must not reach windows during shutdown');
});

test('image previews cache content and fall back for unsupported or damaged images', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'organizer-thumbnails-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'photo.PNG'); fs.writeFileSync(file, 'first');
  let calls = 0, mode = 'preview', fallbackCalls = 0;
  const service = new DesktopOrganizer({
    nativeImage: { async createThumbnailFromPath(filePath, size) {
      assert.equal(filePath, file); assert.deepEqual(size, { width: 96, height: 96 }); calls++;
      if (mode === 'error') throw new Error('Unsupported format');
      return { isEmpty: () => mode === 'empty', toDataURL: () => 'image-content' };
    } },
    app: { async getFileIcon() { fallbackCalls++; return { toDataURL: () => 'type-icon' }; } },
    organizerDesktopIcons: false, organizerDrag: {}
  }, dir);
  const item = { path: file };
  assert.equal(await service.getIcon(item), 'image-content');
  assert.equal(await service.getIcon(item), 'image-content');
  assert.equal(calls, 1); assert.equal(fallbackCalls, 0);
  mode = 'error'; fs.writeFileSync(file, 'changed contents');
  assert.equal(await service.getIcon(item), 'type-icon');
  mode = 'empty'; fs.writeFileSync(file, 'another updated picture');
  assert.equal(await service.getIcon(item), 'type-icon');
  assert.equal(calls, 3); assert.equal(fallbackCalls, 2);
});

test('organizer validates stored appearance, geometry and paths', () => {
  const board = normalizeBoard({ title: 'a'.repeat(100), bounds: { width: 1, height: 99999 }, color: 'red; color:white', pattern: 'bad', opacity: -1, image: 'javascript:alert(1)', items: [{ path: 'relative' }, { path: path.join(os.tmpdir(), 'file.txt') }, null] });
  assert.equal(board.title.length, 60);
  assert.equal(board.bounds.width, 220);
  assert.equal(board.bounds.height, 1200);
  assert.equal(board.opacity, 0);
  assert.equal(board.color, '#171c2a');
  assert.equal(board.textColor, '#f7f7fb');
  assert.equal(board.headerColorMode, 'follow');
  assert.equal(board.headerColor, '#171c2a');
  assert.equal(board.headerTextColor,'#f7f7fb');
  assert.equal(normalizeBoard({headerTextColor:'#abcdef'}).headerTextColor,'#abcdef');
  assert.equal(normalizeBoard({headerTextColor:'red; background:url(test)'}).headerTextColor,'#f7f7fb');
  const customHeader = normalizeBoard({headerColorMode:'custom',headerColor:'#234567'});
  assert.equal(customHeader.headerColorMode,'custom'); assert.equal(customHeader.headerColor,'#234567');
  const invalidHeader = normalizeBoard({headerColorMode:'bad',headerColor:'red; background:url(test)'});
  assert.equal(invalidHeader.headerColorMode,'follow'); assert.equal(invalidHeader.headerColor,'#171c2a');
  assert.equal(normalizeBoard({textColor:'red; background:url(test)'}).textColor,'#f7f7fb');
  assert.equal(board.pattern, 'none');
  assert.equal(board.image, '');
  assert.equal(board.items.length, 1);
  assert.equal('arrangement' in board, false, 'organizers always use free placement');
});

test('showing a retained organizer restores minimization and recovers off-screen bounds', () => {
  const service = new DesktopOrganizer({ screen: { getDisplayMatching: () => ({ workArea: { x:0,y:0,width:800,height:600 } }) } }, path.join(os.tmpdir(), 'organizer-show-fixture-' + process.pid));
  const board = normalizeBoard({ title: '設備文件' });
  let minimized = true, visible = false, bounds = { x:2000,y:-800,width:503,height:377 };
  const calls = [];
  service.windows.set(board.id, {
    isDestroyed: () => false, isMinimized: () => minimized,
    restore() { minimized=false; calls.push('restore'); },
    getBounds: () => bounds, setBounds(value) { bounds=value; calls.push('fit'); },
    showInactive() { visible=true; calls.push('show'); }, moveTop() { calls.push('raise'); }
  });
  service.show(board);
  assert.equal(visible,true); assert.equal(minimized,false);
  assert.deepEqual(bounds,{ x:297,y:0,width:503,height:377 });
  assert.deepEqual(calls,['restore','fit','show','raise']);
  calls.length=0;
  service.show(board);
  assert.deepEqual(calls,['show','raise'],'showing an existing window must also reveal a hidden, correctly positioned window');
});

test('free placement keeps hand-placed positions, fills vacant slots, keeps gaps and survives restart', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'organizer-arrange-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const files = Array.from({ length: 7 }, (_, i) => path.join(dir, `item${i}.txt`));
  files.forEach(file => fs.writeFileSync(file, 'original contents'));
  const handlers = {};
  const service = new DesktopOrganizer({
    ipcMain: { handle: (name, fn) => { handlers[name] = fn; } },
    organizerDrag: { async drag() { return 'Desktop'; } }
  }, dir);
  service.register();
  const board = normalizeBoard(); service.boards.push(board);
  const sender = {}, event = { sender };
  service.windows.set(board.id, { webContents: sender, setMovable() {}, setTitle() {} });
  handlers['organizer-add'](event, files.slice(0, 6));
  assert.deepEqual(board.items.map(item => item.position), [{ x: 8, y: 12 }, { x: 96, y: 12 }, { x: 184, y: 12 }, { x: 8, y: 116 }, { x: 96, y: 116 }, { x: 184, y: 116 }], 'new items fill slots in reading order');
  handlers['organizer-position'](event, { id: board.items[0].id, x: 170, y: 180 });
  const placed = board.items.map(item => ({ ...item.position }));
  handlers['organizer-layout'](event, { width: 280, height: 240 });
  assert.deepEqual(board.items.map(item => item.position), placed, 'resizing never repacks hand-placed icons');
  handlers['organizer-update'](event, { arrangement: 'grid' });
  assert.deepEqual(board.items.map(item => item.position), placed, 'the retired arrangement setting is ignored');
  assert.equal('arrangement' in board, false);
  handlers['organizer-remove'](event, board.items[1].id);
  assert.deepEqual(board.items.map(item => item.position), [placed[0], ...placed.slice(2)], 'removal keeps the gap');
  handlers['organizer-add'](event, [files[6]]);
  assert.deepEqual(board.items.at(-1).position, { x: 8, y: 12 }, 'a new item takes the first vacant slot');
  const restored = new DesktopOrganizer({}, dir).boards[0];
  assert.deepEqual(JSON.parse(JSON.stringify(restored.items)), JSON.parse(JSON.stringify(board.items)));
  assert.throws(() => handlers['organizer-layout']({ sender: {} }, { width: 280, height: 240 }), /無法存取/);
  assert.throws(() => handlers['organizer-layout'](event, { width: NaN, height: 240 }), /無效/);
  for (const file of files) assert.equal(fs.readFileSync(file, 'utf8'), 'original contents');
  assert.equal(fs.existsSync(service.filesRoot), false);
});

test('boards saved with the retired grid arrangement keep their positions as free placement', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'organizer-grid-migration-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'item.txt'); fs.writeFileSync(file, 'original');
  const board = normalizeBoard({ arrangement: 'grid', items: [{ path: file, position: { x: 96, y: 220 } }] });
  assert.equal('arrangement' in board, false);
  assert.deepEqual(board.items[0].position, { x: 96, y: 220 });
});

test('batch selection translates groups, clamps at the edge without changing their shape and persists', t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'organizer-batch-position-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const files=Array.from({length:6},(_,i)=>path.join(dir,`item-${i}.txt`));files.forEach(file=>fs.writeFileSync(file,'original'));
  const handlers={},service=new DesktopOrganizer({ipcMain:{handle:(name,fn)=>handlers[name]=fn},organizerDrag:{}},dir);service.register();
  const board=normalizeBoard({items:files.map((file,index)=>({path:file,position:{x:8+(index%3)*88,y:12+Math.floor(index/3)*104}}))});service.boards.push(board);
  const sender={};service.windows.set(board.id,{webContents:sender});const event={sender};
  const moving=board.items.slice(3),ids=moving.map(item=>item.id),others=board.items.slice(0,3).map(item=>({...item.position}));
  handlers['organizer-position'](event,{id:ids[0],ids,x:37,y:45});
  assert.deepEqual(moving.map(item=>item.position),[{x:37,y:45},{x:125,y:45},{x:213,y:45}]);
  assert.deepEqual(board.items.slice(0,3).map(item=>item.position),others,'unselected items stay where they are');
  handlers['organizer-position'](event,{id:ids[2],ids,x:0,y:0});
  assert.deepEqual(moving.map(item=>item.position),[{x:0,y:0},{x:88,y:0},{x:176,y:0}],'edge clamping retains the whole group shape');
  assert.throws(()=>handlers['organizer-position'](event,{id:ids[0],ids:[...ids,'unknown'],x:8,y:12}),/無效/);
  assert.deepEqual(new DesktopOrganizer({},dir).boards[0].items.map(item=>item.position),board.items.map(item=>item.position));
  for(const file of files)assert.equal(fs.readFileSync(file,'utf8'),'original');
});

test('batch drag authenticates the full selection, transfers three items and retains unaccepted originals', async t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'organizer-batch-transfer-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const files=Array.from({length:3},(_,i)=>path.join(dir,`item-${i}.txt`));files.forEach(file=>fs.writeFileSync(file,'original'));
  const handlers={};let finish,payload;
  const service=new DesktopOrganizer({ipcMain:{handle:(name,fn)=>handlers[name]=fn},organizerDesktopIcons:false,organizerDrag:{drag(input){payload=input;return new Promise(resolve=>finish=resolve);}}},dir);service.register();
  t.after(()=>{for(const session of service.dragSessions.values())clearTimeout(session.timer);});
  const source=normalizeBoard({items:files.map(file=>({path:file}))}),target=normalizeBoard();service.boards.push(source,target);
  const a={},b={};service.windows.set(source.id,{webContents:a});service.windows.set(target.id,{webContents:b});
  const ids=source.items.map(item=>item.id),pending=handlers['organizer-drag-out']({sender:a},ids);await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(payload,files);const token=service.activeDrag.token;
  assert.throws(()=>handlers['organizer-add']({sender:b},files.slice(0,2),{},token),/拖曳項目/);
  assert.throws(()=>handlers['organizer-add']({sender:b},[files[0],files[0],files[2]],{},token),/拖曳項目/);
  finish('None');await pending;
  await handlers['organizer-add']({sender:b},files,{x:8,y:12},token);
  assert.equal(source.items.length,0);assert.deepEqual(target.items.map(item=>item.id),ids);
  assert.equal(new Set(target.items.map(item=>item.path)).size,3);
  const restored=new DesktopOrganizer({},dir);assert.equal(restored.boards[0].items.length,0);assert.equal(restored.boards[1].items.length,3);
  const partial=handlers['organizer-drag-out']({sender:b},ids);await new Promise(resolve=>setImmediate(resolve));
  fs.unlinkSync(files[1]);finish({effect:'Desktop',restored:[files[0]]});await partial;
  assert.deepEqual(target.items.map(item=>item.path),[files[2]],'failed members remain after mixed desktop restoration and filesystem-confirmed moves');
  assert.equal(fs.readFileSync(files[0],'utf8'),'original');assert.equal(fs.readFileSync(files[2],'utf8'),'original');
});

test('organizer keeps original paths and contents when adding, opening, removing and restarting', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'organizer-unit-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'example.txt');
  fs.writeFileSync(file, 'original');
  const handlers = {};
  let opened;
  const service = new DesktopOrganizer({
    ipcMain: { handle: (channel, handler) => { handlers[channel] = handler; } },
    shell: { openPath: async target => { opened = target; return ''; } },
    screen: { getDisplayMatching: () => ({ workArea: { x: -1000, y: 0, width: 1000, height: 700 } }) }
  }, dir);
  service.register();
  const board = normalizeBoard(); service.boards.push(board);
  const sender = {};
  let movable;
  service.windows.set(board.id, { webContents: sender, setMovable: value => { movable = value; }, setTitle() {} });
  const event = { sender };
  assert.throws(() => handlers['organizer-get']({ sender: {} }), /無法存取/);
  const added = handlers['organizer-add'](event, [file, file, 'relative', path.join(dir, 'missing')]);
  assert.equal(added.skipped, 2);
  assert.equal(board.items.length, 1);
  assert.equal(fs.existsSync(file), true);
  assert.equal(board.items[0].path, file);
  assert.equal(fs.existsSync(service.filesRoot), false);
  assert.equal(path.basename(board.items[0].path), 'example.txt');
  assert.equal(fs.readFileSync(board.items[0].path, 'utf8'), 'original');
  assert.equal(board.items[0].originalPath, undefined);
  await handlers['organizer-open'](event, board.items[0].id);
  assert.equal(opened, board.items[0].path);
  assert.match((await handlers['organizer-open'](event, 'unknown')).error, /找不到/);
  handlers['organizer-update'](event, { title: '常用文件', locked: true, opacity: 0, color: '#123456', textColor:'#ffc878', headerColorMode:'custom',headerColor:'#234567',headerTextColor:'#80eeaa', pattern: 'grid' });
  handlers['organizer-update'](event, {headerColorMode:'bad',headerColor:'red; background:url(test)',headerTextColor:'red; background:url(test)'});
  assert.equal(movable, false);
  const restored = new DesktopOrganizer({}, dir).boards[0];
  assert.equal(restored.title, '常用文件'); assert.equal(restored.locked, true);
  assert.equal(restored.opacity, 0); assert.equal(restored.color, '#123456'); assert.equal(restored.pattern, 'grid');
  assert.equal(restored.textColor,'#ffc878');
  assert.equal(restored.headerColorMode,'custom'); assert.equal(restored.headerColor,'#234567');
  assert.equal(restored.headerTextColor,'#80eeaa');
  assert.equal(restored.items[0].path, file);
  assert.equal(restored.items[0].originalPath, undefined);
  assert.equal(fs.existsSync(restored.items[0].path), true);
  handlers['organizer-remove'](event, board.items[0].id);
  assert.equal(board.items.length, 0);
  assert.equal(fs.readFileSync(file, 'utf8'), 'original');
  assert.deepEqual(service.fitBounds({ x: 9000, y: 9000, width: 360, height: 300 }), { x: -360, y: 400, width: 360, height: 300 });
});

test('duplicate references are not duplicated and folders remain at their original paths', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'organizer-move-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const folder = path.join(dir, '資料夾'); fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder, '筆記.txt'), 'contents');
  const file = path.join(dir, 'old.txt'); fs.writeFileSync(file, 'legacy');
  const handlers = {};
  const service = new DesktopOrganizer({ ipcMain: { handle: (name, fn) => { handlers[name] = fn; } } }, dir);
  service.register();
  const board = normalizeBoard({ items: [{ path: file }] }); service.boards.push(board);
  const sender = {}; service.windows.set(board.id, { webContents: sender });
  const result = handlers['organizer-add']({ sender }, [file, folder, folder]);
  assert.equal(result.skipped, 0);
  assert.equal(board.items.length, 2);
  assert.equal(fs.existsSync(file), true); assert.equal(fs.existsSync(folder), true);
  assert.equal(board.items[0].path, file); assert.equal(board.items[1].path, folder);
  assert.equal(fs.readFileSync(path.join(board.items[1].path, '筆記.txt'), 'utf8'), 'contents');
  handlers['organizer-remove']({ sender }, board.items[1].id);
  assert.equal(fs.readFileSync(path.join(folder, '筆記.txt'), 'utf8'), 'contents');
});

function legacyFixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'organizer-reference-migration-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const original = path.join(dir, 'Desktop', '文件.txt');
  const stored = path.join(dir, 'desktop-organizer-files', 'board', 'item', '文件.txt');
  fs.mkdirSync(path.dirname(stored), { recursive: true });
  fs.writeFileSync(stored, 'stored contents');
  const board = normalizeBoard({ id: 'board', title: '文件', items: [{ id: 'item', path: stored, originalPath: original, position: { x: 137, y: 211 } }] });
  const file = path.join(dir, 'desktop-organizer.json');
  fs.writeFileSync(file, JSON.stringify({ boards: [board] }));
  return { dir, original, stored, file };
}

test('previously moved files return to original paths while their organizer entries and positions remain', t => {
  const { dir, original, stored, file } = legacyFixture(t);
  const service = new DesktopOrganizer({}, dir);
  const item = service.boards[0].items[0];
  assert.equal(item.path, original);
  assert.equal(item.originalPath, undefined);
  assert.deepEqual(item.position, { x: 137, y: 211 });
  assert.equal(fs.readFileSync(original, 'utf8'), 'stored contents');
  assert.equal(fs.existsSync(stored), false);
  assert.equal(JSON.parse(fs.readFileSync(file)).boards[0].items[0].path, original);
  assert.equal(JSON.parse(fs.readFileSync(file + '.before-references.json')).boards[0].items[0].path, stored);
  assert.equal(new DesktopOrganizer({}, dir).boards[0].items[0].path, original);
});

test('migration conflicts preserve both files, explain the conflict and retry safely after it is resolved', t => {
  const { dir, original, stored } = legacyFixture(t);
  fs.mkdirSync(path.dirname(original), { recursive: true }); fs.writeFileSync(original, 'new original contents');
  const handlers = {};
  const service = new DesktopOrganizer({ ipcMain: { handle: (channel, handler) => { handlers[channel] = handler; } } }, dir);
  service.register();
  const board = service.boards[0], sender = {};
  service.windows.set(board.id, { webContents: sender });
  assert.match(handlers['organizer-get']({ sender }).migrationErrors[0], /同名/);
  assert.equal(fs.readFileSync(original, 'utf8'), 'new original contents');
  assert.equal(fs.readFileSync(stored, 'utf8'), 'stored contents');
  assert.throws(() => handlers['organizer-remove']({ sender }, board.items[0].id), /同名/);
  assert.equal(board.items.length, 1);
  fs.renameSync(original, original + '.preserved');
  const restored = new DesktopOrganizer({}, dir);
  assert.equal(restored.boards[0].items[0].path, original);
  assert.equal(fs.readFileSync(original, 'utf8'), 'stored contents');
  assert.equal(fs.readFileSync(original + '.preserved', 'utf8'), 'new original contents');
});

test('migration recovers a move completed before the updated inventory was saved', t => {
  const { dir, original, stored } = legacyFixture(t);
  fs.mkdirSync(path.dirname(original), { recursive: true }); fs.renameSync(stored, original);
  const service = new DesktopOrganizer({}, dir);
  assert.equal(service.boards[0].items[0].path, original);
  assert.equal(service.migrationWarnings.size, 0);
  assert.equal(fs.readFileSync(original, 'utf8'), 'stored contents');
});

test('deleting a reference board or removing a missing entry leaves original files alone', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'organizer-reference-delete-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'keep.txt'); fs.writeFileSync(file, 'keep');
  const handlers = {}, sender = {};
  const service = new DesktopOrganizer({ ipcMain: { handle: (channel, handler) => { handlers[channel] = handler; } }, dialog: { showMessageBox: async () => ({ response: 1 }) } }, dir);
  service.register(); const board = normalizeBoard(); service.boards.push(board);
  service.windows.set(board.id, { webContents: sender, destroy() {} });
  handlers['organizer-add']({ sender }, [file]);
  board.items.push({ id: 'missing', path: path.join(dir, 'missing.txt') });
  handlers['organizer-remove']({ sender }, 'missing');
  await handlers['organizer-delete']({ sender });
  assert.equal(service.boards.length, 0);
  assert.equal(fs.readFileSync(file, 'utf8'), 'keep');
});

test('desktop visibility respects shared references and restores flags before drag-out and removal', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'organizer-icons-unit-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'file.txt'); fs.writeFileSync(file, 'keep');
  const handlers = {}, calls = [];
  const service = new DesktopOrganizer({
    ipcMain: { handle: (name, handler) => { handlers[name] = handler; } },
    organizerDesktopIcons: { async sync(paths) { calls.push(['sync', paths]); return []; }, async reveal(file) { calls.push(['reveal', file]); }, dispose() {} },
    organizerDrag: { async drag(file) { calls.push(['drag', file]); return 'None'; } }
  }, dir);
  service.register();
  const first = normalizeBoard(), second = normalizeBoard(); service.boards.push(first, second);
  const sender = {}, otherSender = {};
  service.windows.set(first.id, { webContents: sender }); service.windows.set(second.id, { webContents: otherSender });
  await handlers['organizer-add']({ sender }, [file]); await handlers['organizer-add']({ sender: otherSender }, [file]);
  assert.deepEqual(calls.at(-1), ['sync', [file]]);
  await handlers['organizer-drag-out']({ sender }, first.items[0].id);
  assert.deepEqual(calls.slice(-3), [['reveal', file], ['drag', file], ['sync', [file]]]);
  await handlers['organizer-remove']({ sender }, first.items[0].id);
  assert.deepEqual(calls.at(-1), ['sync', [file]], 'other board continues to hide the same desktop file');
  await handlers['organizer-remove']({ sender: otherSender }, second.items[0].id);
  assert.deepEqual(calls.at(-1), ['sync', []]);
  assert.equal(fs.readFileSync(file, 'utf8'), 'keep');
  await handlers['organizer-add']({ sender }, [file]);
  service.nativeDrag.drag = async () => 'Desktop';
  await handlers['organizer-drag-out']({ sender }, first.items[0].id);
  assert.equal(first.items.length, 0, 'dropping back onto desktop restores the icon without moving the original');
  assert.deepEqual(calls.at(-1), ['sync', []]);
  assert.equal(fs.readFileSync(file, 'utf8'), 'keep');
});

test('cross-board drops transfer ownership without changing files, including queued drops and existing targets', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'organizer-transfer-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, '設備文件.txt'); fs.writeFileSync(file, 'unchanged bytes');
  const handlers = {}, messages = [], syncs = [];
  let finish;
  const service = new DesktopOrganizer({
    ipcMain: { handle: (name, fn) => { handlers[name] = fn; } },
    organizerDesktopIcons: { async sync(paths) { syncs.push(paths); return []; }, async reveal() {} },
    organizerDrag: { drag: () => new Promise(resolve => { finish = resolve; }) }
  }, dir);
  t.after(() => { for (const session of service.dragSessions.values()) clearTimeout(session.timer); });
  service.register();
  const source = normalizeBoard({ items: [{ path: file }] });
  const target = normalizeBoard();
  service.boards.push(source, target);
  const sourceSender = { send: (channel, value) => messages.push([channel, value]) }, targetSender = { send() {} };
  service.windows.set(source.id, { webContents: sourceSender }); service.windows.set(target.id, { webContents: targetSender });
  const sourceEvent = { sender: sourceSender }, targetEvent = { sender: targetSender };
  for (const delayed of [false, true]) {
    const original = source.items[0];
    const pending = handlers['organizer-drag-out'](sourceEvent, original.id);
    const token = service.activeDrag.token;
    await new Promise(resolve => setImmediate(resolve));
    if (delayed) { finish('None'); await pending; }
    const added = await handlers['organizer-add'](targetEvent, [file], { x: 123, y: 145 }, token);
    assert.equal(added.skipped, 0); assert.equal(source.items.length, 0); assert.equal(target.items.length, 1);
    assert.equal(target.items[0].id, original.id); assert.equal(target.items[0].path, file);
    assert.deepEqual(target.items[0].position, { x:123, y:145 });
    if (!delayed) { finish('None'); await pending; }
    assert.deepEqual(syncs.at(-1), [file], 'transfer must retain desktop hiding for the destination');
    assert.ok(messages.some(([channel, items]) => channel === 'organizer-items-updated' && items.length === 0), 'source renderer must remove its icon immediately');
    assert.equal(fs.readFileSync(file, 'utf8'), 'unchanged bytes');
    assert.equal(new DesktopOrganizer({}, dir).boards[0].items.length, 0, 'source removal persists across restart');
    source.items = target.items; target.items = [];
  }
  target.items = [{ id:'already-present', path:file }];
  const pending = handlers['organizer-drag-out'](sourceEvent, source.items[0].id);
  const token = service.activeDrag.token;
  await new Promise(resolve => setImmediate(resolve));
  await handlers['organizer-add'](targetEvent, [file], { x:33,y:44 }, token);
  finish('None'); await pending;
  assert.equal(source.items.length, 0); assert.equal(target.items.length, 1);
  assert.equal(target.items[0].id, 'already-present');
  assert.deepEqual(target.items[0].position, { x:33,y:44 });
  assert.throws(() => handlers['organizer-add'](targetEvent, [file], {}, token), /拖曳項目已變更/);
  assert.throws(() => handlers['organizer-add']({ sender:{} }, [file], {}, token), /無法存取/);
});

test('cancelled cross-board drags and full destinations retain the source item', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'organizer-transfer-full-'));
  t.after(() => fs.rmSync(dir, { recursive:true, force:true }));
  const file = path.join(dir, 'original.txt'); fs.writeFileSync(file, 'original bytes');
  const handlers = {}; let finish;
  const service = new DesktopOrganizer({
    ipcMain: { handle: (name, fn) => { handlers[name]=fn; } },
    organizerDesktopIcons:false, organizerDrag:{ drag: () => new Promise(resolve => {finish=resolve;}) }
  }, dir);
  t.after(() => { for (const session of service.dragSessions.values()) clearTimeout(session.timer); });
  service.register();
  const source = normalizeBoard({ items:[{path:file}] }), target = normalizeBoard();
  target.items = Array.from({length:300}, (_, i) => ({id:'other-'+i, path:path.join(dir,'other-'+i)}));
  service.boards.push(source,target);
  const a={}, b={}; service.windows.set(source.id,{webContents:a}); service.windows.set(target.id,{webContents:b});
  const original = source.items[0];
  let pending = handlers['organizer-drag-out']({sender:a},original.id);
  await new Promise(resolve => setImmediate(resolve));
  const token = service.activeDrag.token;
  const rejected = handlers['organizer-add']({sender:b},[file],{},token);
  assert.equal(rejected.skipped,1); assert.equal(source.items[0],original); assert.equal(target.items.length,300);
  assert.throws(() => handlers['organizer-add']({sender:b},[path.join(dir,'different')],{},token), /拖曳項目已變更/);
  finish('None'); await pending;
  assert.equal(source.items[0],original);
  pending = handlers['organizer-drag-out']({sender:a},original.id);
  await new Promise(resolve => setImmediate(resolve)); finish('None'); await pending;
  assert.equal(source.items[0],original); assert.equal(fs.readFileSync(file,'utf8'),'original bytes');
});

test('native context commands authenticate items, retain copy attributes and reconcile filesystem changes', async t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'organizer-context-unit-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'文件.txt');fs.writeFileSync(file,'original');
  const handlers={},calls=[];let action='copy-path',copied,request;
  const menu={async show(input,before){
    request=input;
    if(action==='copy'){await before('copy');assert.equal(calls.at(-1)[0],'reveal');return {action:'shell',verb:'copy',clipboardSequence:42};}
    if(action==='delete'){await before('delete');fs.unlinkSync(file);return {action:'shell',verb:'delete'};}
    return {action};
  }};
  const service=new DesktopOrganizer({
    ipcMain:{handle:(name,fn)=>handlers[name]=fn},organizerContextMenu:menu,organizerDrag:{},
    clipboard:{writeText:value=>copied=value},shell:{showItemInFolder:target=>calls.push(['reveal-folder',target])},
    screen:{dipToScreenPoint:point=>({x:point.x*2,y:point.y*2})},
    organizerDesktopIcons:{async reveal(target){calls.push(['reveal',target]);},async sync(paths){calls.push(['sync',paths]);return [];}}
  },dir);
  t.after(()=>{for(const close of service.contextWatchers)close();});
  service.register();const board=normalizeBoard({items:[{path:file}]});service.boards.push(board);
  const sender={send(){}},event={sender};let modal=0;
  service.windows.set(board.id,{webContents:sender,getBounds:()=>({x:100,y:200,width:400,height:300}),getNativeWindowHandle:()=>{const buffer=Buffer.alloc(8);buffer.writeBigUInt64LE(17n);return buffer;}});
  service.layers.set(board.id,{async withModal(task){modal++;try{return await task();}finally{modal--;}}});
  await assert.rejects(handlers['organizer-context-menu']({sender:{}},board.items[0].id,{}),/無法存取/);
  await assert.rejects(handlers['organizer-context-menu'](event,'missing',{}),/找不到/);
  await handlers['organizer-context-menu'](event,board.items[0].id,{x:30,y:40});
  assert.equal(request.file,file);assert.equal(request.x,260);assert.equal(request.y,480);assert.equal(copied,'"'+file+'"');assert.equal(modal,0);
  action='copy';await handlers['organizer-context-menu'](event,board.items[0].id,{});
  assert.deepEqual(service.desktopPaths(),[],'clipboard sources retain their original attributes until the clipboard is replaced');
  menu.onClipboardChanged(42);assert.deepEqual(service.desktopPaths(),[]);
  menu.onClipboardChanged(43);assert.deepEqual(service.desktopPaths(),[file]);
  action='delete';await handlers['organizer-context-menu'](event,board.items[0].id,{});
  for(let attempt=0;attempt<50 && board.items.length;attempt++)await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(board.items.length,0,'Shell deletion removes the missing reference and persists it');
  assert.equal(new DesktopOrganizer({},dir).boards[0].items.length,0);
});

test('rename updates shared references and storage without overwriting files or escaping their folder', async t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'organizer-rename-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'原始.txt'),existing=path.join(dir,'已存在.txt');fs.writeFileSync(file,'original');fs.writeFileSync(existing,'other');
  const handlers={};const service=new DesktopOrganizer({ipcMain:{handle:(name,fn)=>handlers[name]=fn},organizerDrag:{}},dir);service.register();
  const a=normalizeBoard({items:[{path:file}]}),b=normalizeBoard({items:[{path:file}]});service.boards.push(a,b);
  const sender={};service.windows.set(a.id,{webContents:sender});service.windows.set(b.id,{webContents:{}});
  const event={sender},id=a.items[0].id;
  for(const name of ['../outside.txt','a/b.txt','CON.txt','NUL','bad?.txt','ending.',''])await assert.rejects(handlers['organizer-rename'](event,id,name),/名称|名稱/);
  await assert.rejects(handlers['organizer-rename'](event,id,'已存在.txt'),/同名/);
  await assert.rejects(handlers['organizer-rename']({sender:{}},id,'new.txt'),/無法存取/);
  await handlers['organizer-rename'](event,id,'新名稱.txt');
  const next=path.join(dir,'新名稱.txt');assert.equal(a.items[0].path,next);assert.equal(b.items[0].path,next);
  assert.equal(fs.readFileSync(next,'utf8'),'original');assert.equal(fs.readFileSync(existing,'utf8'),'other');assert.equal(fs.existsSync(file),false);
  assert.deepEqual(new DesktopOrganizer({},dir).boards.map(board=>board.items[0].path),[next,next]);
});

test('cross-volume transfer only removes the source after a complete copy', () => {
  const { moveFile } = require('../electron/organizer-files.cjs');
  const calls = [];
  const io = {
    existsSync: () => false, mkdirSync() {},
    renameSync() { throw Object.assign(new Error(), { code: 'EXDEV' }); },
    cpSync() { calls.push('copy'); }, rmSync() { calls.push('remove'); }
  };
  assert.equal(moveFile('source', 'destination', io).sourceRetained, false);
  assert.deepEqual(calls, ['copy', 'remove']);
  calls.length = 0;
  io.cpSync = () => { throw new Error('copy failed'); };
  assert.throws(() => moveFile('source', 'destination', io), /copy failed/);
  assert.deepEqual(calls, []);
  io.cpSync = () => {}; io.rmSync = () => { throw new Error('locked'); };
  assert.equal(moveFile('source', 'destination', io).sourceRetained, true);
});

test('packaged Windows helpers use the unpacked archive directory', () => {
  const { getNativeScriptPath } = require('../electron/organizer-files.cjs');
  const folder = path.join(os.tmpdir(), 'application', 'app.asar', 'electron');
  assert.equal(getNativeScriptPath('windows-file-drag.ps1', folder), path.join(os.tmpdir(), 'application', 'app.asar.unpacked', 'electron', 'windows-file-drag.ps1'));
});

test('corrupt organizer storage does not prevent startup', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'organizer-corrupt-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'desktop-organizer.json'), '{');
  assert.deepEqual(new DesktopOrganizer({}, dir).boards, []);
});

test('free positions survive restart and native drag cancellation preserves the file', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'organizer-drag-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const source = path.join(dir, 'file.txt'); fs.writeFileSync(source, 'contents');
  const dropped = path.join(dir, 'outside.txt');
  const handlers = {};
  let dragEffect = 'None'; let invoked = 0;
  const service = new DesktopOrganizer({
    ipcMain: { handle: (name, fn) => { handlers[name] = fn; } },
    organizerDrag: { async drag(file) { invoked++; if (dragEffect === 'Move') fs.renameSync(file, dropped); return dragEffect; } }
  }, dir);
  service.register();
  const board = normalizeBoard(); service.boards.push(board);
  const sender = {}; service.windows.set(board.id, { webContents: sender });
  handlers['organizer-add']({ sender }, [source]);
  const item = board.items[0];
  handlers['organizer-position']({ sender }, { id: item.id, x: 137, y: 211 });
  assert.deepEqual(new DesktopOrganizer({}, dir).boards[0].items[0].position, { x: 137, y: 211 });
  assert.throws(() => handlers['organizer-position']({ sender: {} }, { id: item.id, x: 0, y: 0 }), /無法存取/);
  assert.throws(() => handlers['organizer-position']({ sender }, { id: item.id, x: NaN, y: 0 }), /無效/);
  await assert.rejects(handlers['organizer-drag-out']({ sender: {} }, item.id), /無法存取/);
  assert.equal(invoked, 0);
  await handlers['organizer-drag-out']({ sender }, item.id);
  assert.equal(board.items.length, 1); assert.equal(fs.existsSync(item.path), true);
  dragEffect = 'Move';
  await handlers['organizer-drag-out']({ sender }, item.id);
  assert.equal(board.items.length, 0); assert.equal(fs.readFileSync(dropped, 'utf8'), 'contents');
  assert.equal(new DesktopOrganizer({}, dir).boards[0].items.length, 0);
});
