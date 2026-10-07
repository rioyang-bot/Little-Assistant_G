const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DesktopOrganizer, normalizeBoard } = require('../electron/desktop-organizer.cjs');

// Laptop 1920x1080 at 125% (1536x864 DIP) with a 1920x1080 monitor at 100%
// above it, the external monitor alone, and the laptop alone.
const laptop = { id: 1, bounds: { x: 0, y: 0, width: 1536, height: 864 }, workArea: { x: 0, y: 0, width: 1536, height: 816 }, scaleFactor: 1.25 };
const external = { id: 2, bounds: { x: 91, y: -1080, width: 1920, height: 1080 }, workArea: { x: 91, y: -1080, width: 1920, height: 1032 }, scaleFactor: 1 };
const externalOnly = { ...external, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1032 } };
const boundsOf = ({ x, y, width, height }) => ({ x, y, width, height });
const intersects = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

function fixture(t, displays) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'organizer-displays-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const state = { displays };
  const screen = {
    getAllDisplays: () => state.displays,
    getDisplayMatching: rect => state.displays.find(display => intersects(rect, display.bounds)) || state.displays[0]
  };
  const service = new DesktopOrganizer({ screen, organizerDesktopIcons: false, organizerDrag: {} }, dir);
  t.after(() => clearTimeout(service.displaySettleTimer));
  return { service, state, dir };
}

// Native window stand-in: records setBounds and can emulate a DPI change
// that applies the previous display's scale to the first call.
function fakeWindow(bounds) {
  const listeners = {};
  const win = {
    bounds: { ...bounds }, calls: [], scaleOnce: 0, invalidated: 0, visible: true,
    getBounds: () => ({ ...win.bounds }),
    setBounds: next => {
      win.calls.push({ ...next });
      win.bounds = win.scaleOnce ? { ...next, width: Math.round(next.width * win.scaleOnce), height: Math.round(next.height * win.scaleOnce) } : { ...next };
      win.scaleOnce = 0;
    },
    minimized: false, shownInactive: 0,
    isDestroyed: () => false, isVisible: () => win.visible && !win.minimized, isMinimized: () => win.minimized,
    showInactive: () => { win.shownInactive++; win.minimized = false; },
    on: (name, fn) => { listeners[name] = fn; },
    emit: name => listeners[name]?.(),
    sent: [],
    webContents: { invalidate: () => { win.invalidated++; }, send: (channel, payload) => win.sent.push([channel, JSON.parse(JSON.stringify(payload))]) }
  };
  return win;
}

function attach(service, board, bounds) {
  const win = fakeWindow(bounds);
  service.windows.set(board.id, win);
  win.on('moved', () => service.rememberWindow(board, win));
  return win;
}

test('saved layouts are validated and capped', () => {
  const layouts = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`key${i}`, { x: i, y: i, width: 300, height: 200 }]));
  layouts.bad = 'nope';
  const board = normalizeBoard({ layouts });
  assert.equal(Object.keys(board.layouts).length, 8);
  assert.deepEqual(Object.keys(board.layouts).at(-1), 'key11', 'the most recent layouts are kept');
  assert.deepEqual(normalizeBoard({ layouts: { k: { x: 'a', width: 99999 } } }).layouts.k, { x: 40, y: 40, width: 1400, height: 300 });
  assert.deepEqual(normalizeBoard({ layouts: [1, 2] }).layouts, {});
  assert.deepEqual(normalizeBoard().layouts, {});
});

test('switching to the external monitor and back restores the laptop arrangement', async t => {
  const { service, state } = fixture(t, [laptop, external]);
  const extendedKey = service.displayKey();
  const board = normalizeBoard({ bounds: { x: 926, y: 5, width: 587, height: 369 } });
  service.boards.push(board);
  const win = attach(service, board, board.bounds);
  service.rememberLayout(board);

  // Display goes away: Windows moves and rescales the window by itself.
  service.displayChanged();
  state.displays = [externalOnly];
  win.bounds = { x: 832, y: 5, width: 392, height: 252 };
  win.emit('moved');
  assert.deepEqual(board.bounds, { x: 926, y: 5, width: 587, height: 369 }, 'system moves are not saved');

  service.reposition();
  assert.deepEqual(win.bounds, { x: 926, y: 5, width: 587, height: 369 }, 'the last arrangement is placed on the remaining monitor');
  assert.equal(win.invalidated, 1, 'the transparent surface is repainted');
  const externalKey = service.displayKey();
  assert.notEqual(externalKey, extendedKey);
  assert.deepEqual(boundsOf(board.layouts[externalKey]), { x: 926, y: 5, width: 587, height: 369 });
  assert.equal(board.layouts[externalKey].auto, true, "copied, not arranged by the user");

  // The user rearranges the external-only screen.
  clearTimeout(service.displaySettleTimer); service.displayChanging = false;
  win.bounds = { x: 1200, y: 600, width: 600, height: 400 };
  win.emit('moved');
  assert.deepEqual(boundsOf(board.layouts[externalKey]), { x: 1200, y: 600, width: 600, height: 400 });
  assert.equal(board.layouts[externalKey].auto, undefined, "arranged by the user");

  // Back to both screens: the extended arrangement is restored exactly.
  service.displayChanged();
  state.displays = [laptop, external];
  win.bounds = { x: 1500, y: 750, width: 480, height: 320 };
  win.emit('moved');
  service.reposition();
  assert.deepEqual(win.bounds, { x: 926, y: 5, width: 587, height: 369 });
  assert.deepEqual(boundsOf(board.layouts[extendedKey]), { x: 926, y: 5, width: 587, height: 369 }, 'the laptop layout was never overwritten');

  // Windows moves the window again after the first pass; the settle pass fixes it.
  win.bounds = { x: 10, y: 10, width: 300, height: 200 };
  win.emit('moved');
  assert.equal(service.displayChanging, true);
  await new Promise(resolve => setTimeout(resolve, 2100));
  assert.deepEqual(win.bounds, { x: 926, y: 5, width: 587, height: 369 });
  assert.equal(service.displayChanging, false, 'user moves are remembered again');
  assert.deepEqual(boundsOf(JSON.parse(fs.readFileSync(service.file, "utf8")).boards[0].layouts[externalKey]), { x: 1200, y: 600, width: 600, height: 400 }, 'layouts are saved');
});

test('a scale change applied to the first setBounds is corrected', t => {
  const { service } = fixture(t, [laptop]);
  const win = fakeWindow({ x: 0, y: 0, width: 300, height: 200 });
  win.scaleOnce = 0.8;
  service.applyBounds(win, { x: 100, y: 100, width: 500, height: 400 });
  assert.equal(win.calls.length, 2);
  assert.deepEqual(win.getBounds(), { x: 100, y: 100, width: 500, height: 400 });
  const steady = fakeWindow({ x: 0, y: 0, width: 300, height: 200 });
  service.applyBounds(steady, { x: 1, y: 2, width: 300, height: 200 });
  assert.equal(steady.calls.length, 1, 'no second call when the size is right');
});

test('a monitor without a saved layout receives the last arrangement fitted to it', t => {
  const { service, state } = fixture(t, [laptop, external]);
  const board = normalizeBoard({ bounds: { x: 300, y: -900, width: 500, height: 400 } });
  service.boards.push(board);
  const win = attach(service, board, board.bounds);
  service.rememberLayout(board);
  service.displayChanged();
  state.displays = [laptop];
  service.reposition();
  assert.deepEqual(win.bounds, { x: 300, y: 0, width: 500, height: 400 }, 'moved onto the laptop work area');
});

test('startup uses the layout saved for the current displays', t => {
  const { service } = fixture(t, [externalOnly]);
  const key = service.displayKey();
  const board = normalizeBoard({ bounds: { x: 10, y: 10, width: 300, height: 200 }, layouts: { [key]: { x: 1200, y: 600, width: 600, height: 400 } } });
  assert.deepEqual(service.fitBounds(service.savedBounds(board)), { x: 1200, y: 600, width: 600, height: 400 });
  const other = normalizeBoard({ bounds: { x: 10, y: 10, width: 300, height: 200 } });
  assert.deepEqual(service.savedBounds(other), other.bounds, 'falls back to the last bounds');
});

test('organizers minimized by Windows when their monitor is switched off come back', async t => {
  const { service, state } = fixture(t, [laptop, external]);
  const board = normalizeBoard({ bounds: { x: 510, y: 5, width: 409, height: 192 } });
  service.boards.push(board);
  const win = attach(service, board, board.bounds);
  service.rememberLayout(board);

  // "Second screen only": Windows minimizes the window after the first pass.
  service.displayChanged();
  state.displays = [externalOnly];
  service.reposition();
  win.minimized = true; win.bounds = { x: -32000, y: -32000, width: 160, height: 28 };
  service.unminimize(board, win);
  assert.equal(win.minimized, false, 'shown again without activation');
  assert.equal(win.shownInactive, 1);
  assert.deepEqual(win.bounds, { x: 510, y: 5, width: 409, height: 192 }, 'placed at its layout');

  // A pass also restores a window that is still minimized.
  win.minimized = true;
  service.restoreLayouts();
  assert.equal(win.minimized, false);
  assert.equal(win.shownInactive, 2);

  // Hidden organizers (not minimized) stay hidden.
  win.visible = false;
  service.unminimize(board, win);
  service.restoreLayouts();
  assert.equal(win.shownInactive, 2);
});

test('icon positions are remembered per display configuration', async t => {
  const { service, state, dir } = fixture(t, [laptop, external]);
  const item = (id, x, y) => ({ id, path: path.join(dir, id + '.txt'), position: { x, y } });
  const board = normalizeBoard({ bounds: { x: 11, y: 2, width: 500, height: 466 }, items: [item('a', 8, 12), item('b', 96, 12)] });
  service.boards.push(board);
  const win = attach(service, board, board.bounds);
  service.save();
  const laptopKey = service.displayKey();
  assert.deepEqual(board.layouts[laptopKey].items, { a: { x: 8, y: 12 }, b: { x: 96, y: 12 } });

  // On the external monitor the user spreads the icons out and adds one.
  service.displayChanged();
  state.displays = [externalOnly];
  service.reposition();
  assert.deepEqual(board.items.map(entry => entry.position), [{ x: 8, y: 12 }, { x: 96, y: 12 }], 'a new display starts from the last arrangement');
  clearTimeout(service.displaySettleTimer); service.displayChanging = false;
  board.items[1].position = { x: 600, y: 12 };
  board.items.push(item('c', 700, 12));
  service.save();
  const externalKey = service.displayKey();
  assert.deepEqual(board.layouts[laptopKey].items, { a: { x: 8, y: 12 }, b: { x: 96, y: 12 } }, 'the laptop arrangement is untouched');

  // Back on the laptop: its icon arrangement returns; the new icon gets a free slot.
  service.displayChanged();
  state.displays = [laptop, external];
  service.save();   // saving during the change must not record into either layout
  assert.deepEqual(board.layouts[laptopKey].items.b, { x: 96, y: 12 });
  service.reposition();
  const positions = Object.fromEntries(board.items.map(entry => [entry.id, entry.position]));
  assert.deepEqual(positions.a, { x: 8, y: 12 });
  assert.deepEqual(positions.b, { x: 96, y: 12 });
  assert.ok(positions.c && !(positions.c.x === 8 && positions.c.y === 12) && !(positions.c.x === 96 && positions.c.y === 12), 'free slot for the new icon');
  const update = win.sent.filter(([channel]) => channel === 'organizer-items-updated').at(-1);
  assert.ok(update, 'the window re-renders the icons');
  assert.deepEqual(update[1].find(entry => entry.id === 'b').position, { x: 96, y: 12 });
  assert.deepEqual(board.layouts[externalKey].items.b, { x: 600, y: 12 }, 'the external arrangement is kept for next time');

  // Starting on the external monitor uses its arrangement.
  clearTimeout(service.displaySettleTimer); service.displayChanging = false;
  service.save();
  const restarted = new DesktopOrganizer({ screen: { getAllDisplays: () => [externalOnly] }, organizerDesktopIcons: false, organizerDrag: {} }, dir);
  assert.deepEqual(restarted.boards[0].items.find(entry => entry.id === 'b').position, { x: 600, y: 12 });
});

test('saved icon positions are validated', () => {
  const board = normalizeBoard({ layouts: { k: { x: 1, y: 2, width: 300, height: 200, items: { ok: { x: 5, y: 6 }, 'bad id!': { x: 1, y: 1 }, nan: { x: 'a', y: 1 }, far: { x: 99999, y: -5 } } } } });
  assert.deepEqual(board.layouts.k.items, { ok: { x: 5, y: 6 }, far: { x: 40000, y: 0 } });
  assert.equal('items' in normalizeBoard({ layouts: { k: { x: 1, y: 2, width: 300, height: 200, items: [1] } } }).layouts.k, false);
});

test('"PC screen only" after "Second screen only" returns to the laptop arrangement from "Extend"', async t => {
  const laptopOnly = laptop;
  const fourK = { ...externalOnly, bounds: { x: 0, y: 0, width: 2560, height: 1440 }, workArea: { x: 0, y: 0, width: 2560, height: 1392 }, scaleFactor: 1.5 };
  const { service, state, dir } = fixture(t, [laptop, external]);
  const item = (id, x, y) => ({ id, path: path.join(dir, id + '.txt'), position: { x, y } });
  const board = normalizeBoard({ bounds: { x: 11, y: 2, width: 500, height: 466 }, items: [item('a', 8, 12), item('b', 96, 12), item('c', 8, 116)] });
  service.boards.push(board);
  const win = attach(service, board, board.bounds);
  service.rememberLayout(board);   // arranged on the laptop while extended
  const settle = () => { clearTimeout(service.displaySettleTimer); service.displayChanging = false; };

  // Second screen only (4K at 150%): the user widens the window and lines the icons up.
  service.displayChanged(); state.displays = [fourK]; service.reposition(); settle();
  win.bounds = { x: 134, y: 7, width: 866, height: 254 }; win.emit('moved');
  board.items[2].position = { x: 184, y: 12 };
  service.save();

  // PC screen only: no layout arranged there yet; the laptop part of "Extend" wins.
  service.displayChanged(); state.displays = [laptopOnly]; service.reposition();
  assert.deepEqual(win.bounds, { x: 11, y: 2, width: 500, height: 466 });
  assert.deepEqual(board.items.find(entry => entry.id === 'c').position, { x: 8, y: 116 }, 'icons as arranged on the laptop');
  const laptopKey = service.displayKey();
  assert.equal(board.layouts[laptopKey].auto, true);
  settle();
  service.save();
  assert.equal(board.layouts[laptopKey].auto, true, 'saving without changes keeps it a copy');

  // Arranging on "PC screen only" makes that layout its own.
  board.items[0].position = { x: 300, y: 300 };
  service.save();
  assert.equal(board.layouts[laptopKey].auto, undefined);
  service.displayChanged(); state.displays = [fourK]; service.reposition(); settle();
  assert.deepEqual(win.bounds, { x: 134, y: 7, width: 866, height: 254 }, 'the 4K arrangement returns');
  assert.deepEqual(board.items.find(entry => entry.id === 'c').position, { x: 184, y: 12 });
  service.displayChanged(); state.displays = [laptopOnly]; service.reposition(); settle();
  assert.deepEqual(board.items.find(entry => entry.id === 'a').position, { x: 300, y: 300 }, 'its own arrangement now wins');

  // After a restart on the laptop alone, its own arrangement is used.
  const restarted = new DesktopOrganizer({ screen: { getAllDisplays: () => [laptopOnly] }, organizerDesktopIcons: false, organizerDrag: {} }, dir);
  assert.deepEqual(restarted.boards[0].items.find(entry => entry.id === 'a').position, { x: 300, y: 300 });
});
