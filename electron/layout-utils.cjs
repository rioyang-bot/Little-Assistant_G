const SIZE_PRESETS = Object.freeze({
  mini: { id: 'mini', labelZh: '微型 (0.75x)', labelEn: 'Mini (0.75x)', width: 280, height: 400, bearSize: 140 },
  std: { id: 'std', labelZh: '標準 (1.0x)', labelEn: 'Standard (1.0x)', width: 330, height: 460, bearSize: 190 },
  lg: { id: 'lg', labelZh: '大型 (1.33x)', labelEn: 'Large (1.33x)', width: 420, height: 560, bearSize: 250 }
});

const STICKY_NOTES_SIZE_PRESETS = Object.freeze({
  sm: { id: 'sm', width: 280, height: 560, boardWidth: 264 },
  std: { id: 'std', width: 330, height: 660, boardWidth: 314 },
  lg: { id: 'lg', width: 420, height: 760, boardWidth: 404 }
});

function getAssistantSizePreset(sizeKey) {
  return SIZE_PRESETS[sizeKey] || SIZE_PRESETS.std;
}

function getStickyNotesSizePreset(sizeKey) {
  return STICKY_NOTES_SIZE_PRESETS[sizeKey] || STICKY_NOTES_SIZE_PRESETS.std;
}

function getCompositeWindowSize(assistantSizeKey, stickyNotesSizeKey) {
  const assistant = getAssistantSizePreset(assistantSizeKey);
  const stickyNotes = getStickyNotesSizePreset(stickyNotesSizeKey);
  return {
    width: Math.max(assistant.width, stickyNotes.width),
    height: Math.max(assistant.height, stickyNotes.height)
  };
}

function clampWindowYToWorkArea(targetY, windowHeight, workArea, margin = 10) {
  const top = workArea.y + margin;
  const bottom = workArea.y + workArea.height - margin;
  // A transparent assistant window can be taller than a laptop display. In
  // that case keep its bottom (where the bear lives) visible and allow only
  // the unused transparent area above it to extend off-screen.
  if (windowHeight > workArea.height - margin * 2) return bottom - windowHeight;
  return Math.max(top, Math.min(bottom - windowHeight, targetY));
}

function getMonitorFittedWindowHeight(workAreaHeight, bearSize, margin = 10) {
  return Math.max(bearSize + 20, workAreaHeight - margin);
}

function getBottomRightWindowBounds(windowSize, workArea, rightMargin = 20, bottomMargin = 10) {
  const width = Math.max(1, Number(windowSize?.width) || 1);
  const height = Math.max(1, Number(windowSize?.height) || 1);
  const x = Math.max(workArea.x, workArea.x + workArea.width - width - rightMargin);
  const targetY = workArea.y + workArea.height - height - bottomMargin;
  return {
    x: Math.round(x),
    y: Math.round(clampWindowYToWorkArea(targetY, height, workArea, bottomMargin)),
    width: Math.round(width),
    height: Math.round(height)
  };
}

function getDisplayLayoutKey(displays = []) {
  return displays
    .map(display => {
      const bounds = display?.bounds || {};
      const scale = Number(display?.scaleFactor) || 1;
      return [bounds.x || 0, bounds.y || 0, bounds.width || 0, bounds.height || 0, scale].join(':');
    })
    .sort()
    .join('|');
}

function centerWindowInWorkArea(windowSize, workArea, margin = 12) {
  const width = Math.max(1, Number(windowSize?.width) || 1);
  const height = Math.max(1, Number(windowSize?.height) || 1);
  const horizontalSpace = Math.max(0, Number(workArea.width) - margin * 2);
  const verticalSpace = Math.max(0, Number(workArea.height) - margin * 2);
  return {
    x: Math.round(width >= horizontalSpace
      ? workArea.x + margin
      : workArea.x + (workArea.width - width) / 2),
    y: Math.round(height >= verticalSpace
      ? workArea.y + margin
      : workArea.y + (workArea.height - height) / 2)
  };
}

module.exports = {
  SIZE_PRESETS,
  STICKY_NOTES_SIZE_PRESETS,
  getAssistantSizePreset,
  getStickyNotesSizePreset,
  getCompositeWindowSize,
  clampWindowYToWorkArea,
  getMonitorFittedWindowHeight,
  getBottomRightWindowBounds,
  getDisplayLayoutKey,
  centerWindowInWorkArea
};
