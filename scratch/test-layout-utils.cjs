const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getStickyNotesSizePreset,
  getCompositeWindowSize,
  clampWindowYToWorkArea,
  getMonitorFittedWindowHeight,
  getBottomRightWindowBounds,
  getAssistantDisplayAnchor,
  getDisplayLayoutKey,
  centerWindowInWorkArea
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

test('a removed second monitor relocates the assistant above the primary taskbar', () => {
  const workArea = { x: 0, y: 0, width: 1920, height: 1040 };
  const height = getMonitorFittedWindowHeight(workArea.height, 190);
  assert.deepEqual(
    getBottomRightWindowBounds({ width: 330, height }, workArea),
    { x: 1570, y: 0, width: 330, height: 1030 }
  );
});

test('bottom-right relocation respects an offset work area', () => {
  const workArea = { x: -1280, y: 40, width: 1280, height: 680 };
  assert.deepEqual(
    getBottomRightWindowBounds({ width: 330, height: 670 }, workArea),
    { x: -350, y: 40, width: 330, height: 670 }
  );
});

test('assistant display detection anchors near the visible bear at the window bottom', () => {
  const bounds = { x: 1920, y: -300, width: 420, height: 1050 };
  assert.deepEqual(getAssistantDisplayAnchor(bounds, 'right'), { x: 2320, y: 730 });
  assert.deepEqual(getAssistantDisplayAnchor(bounds, 'left'), { x: 1940, y: 730 });
});

test('display layout keys are stable and distinguish monitor configurations', () => {
  const primary = { bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 };
  const secondary = { bounds: { x: 1920, y: 0, width: 2560, height: 1440 }, scaleFactor: 1.25 };
  assert.equal(getDisplayLayoutKey([primary, secondary]), getDisplayLayoutKey([secondary, primary]));
  assert.notEqual(getDisplayLayoutKey([primary]), getDisplayLayoutKey([primary, secondary]));
});

test('settings window is centered inside the assistant display work area', () => {
  assert.deepEqual(
    centerWindowInWorkArea({ width: 720, height: 760 }, { x: 1920, y: 40, width: 1920, height: 1040 }),
    { x: 2520, y: 180 }
  );
  assert.deepEqual(
    centerWindowInWorkArea({ width: 780, height: 760 }, { x: -1280, y: 0, width: 1280, height: 720 }),
    { x: -1030, y: 12 }
  );
});


test('preferred monitor follows primary setting and falls back after unplugging', () => {
  const { selectAssistantDisplay } = require('../electron/layout-utils.cjs');
  const primary = { id: 1, internal: true };
  const external = { id: 2, internal: false };
  const other = { id: 3, internal: true };
  assert.equal(selectAssistantDisplay([primary, external], primary, 'primary'), primary);
  assert.equal(selectAssistantDisplay([primary, other, external], primary, 'external'), external);
  assert.equal(selectAssistantDisplay([primary], primary, 'external'), primary);
  assert.equal(selectAssistantDisplay([external, primary], external, 'primary'), external);
});

test('corner placement respects negative monitor coordinates and updated work area', () => {
  const area = { x: -2560, y: -100, width: 2560, height: 1400 };
  const height = getMonitorFittedWindowHeight(area.height, 190);
  const bounds = getBottomRightWindowBounds({ width: 330, height }, area);
  assert.equal(bounds.x + bounds.width, area.x + area.width - 20);
  assert.equal(bounds.y + bounds.height, area.y + area.height - 10);
});
