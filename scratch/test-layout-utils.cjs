const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getStickyNotesSizePreset,
  getCompositeWindowSize,
  clampWindowYToWorkArea,
  getMonitorFittedWindowHeight
} = require('../electron/layout-utils.cjs');

test('large sticky notes reserve enough window space for a mini assistant', () => {
  assert.deepEqual(getCompositeWindowSize('mini', 'lg'), { width: 420, height: 760 });
  assert.equal(getStickyNotesSizePreset('lg').boardWidth, 404);
});

test('small sticky notes do not shrink or change a large assistant', () => {
  assert.deepEqual(getCompositeWindowSize('lg', 'sm'), { width: 420, height: 560 });
  assert.equal(getStickyNotesSizePreset('sm').boardWidth, 264);
});

test('assistant and sticky-note size presets remain independently selectable', () => {
  assert.deepEqual(getCompositeWindowSize('mini', 'sm'), { width: 280, height: 560 });
  assert.deepEqual(getCompositeWindowSize('std', 'sm'), { width: 330, height: 560 });
  assert.deepEqual(getCompositeWindowSize('mini', 'std'), { width: 330, height: 660 });
});

test('an assistant taller than a small monitor keeps its bottom visible', () => {
  const workArea = { y: 0, height: 680 };
  assert.equal(clampWindowYToWorkArea(100, 760, workArea, 10), -90);
});

test('an assistant that fits remains fully inside the monitor work area', () => {
  const workArea = { y: 100, height: 900 };
  assert.equal(clampWindowYToWorkArea(950, 500, workArea, 10), 490);
  assert.equal(clampWindowYToWorkArea(0, 500, workArea, 10), 110);
});

test('transparent host height follows each monitor while retaining the bear', () => {
  assert.equal(getMonitorFittedWindowHeight(680, 190), 670);
  assert.equal(getMonitorFittedWindowHeight(1600, 190), 1590);
  assert.equal(getMonitorFittedWindowHeight(180, 190), 210);
});
