const assert = require('node:assert/strict');
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let snapshot = { active: [] };
let noteSequence = 0;
let menuRequestCount = 0;
let ignoreMouseEventStates = [];
let savedShortcutOrder = [];
let windowDragStartCount = 0;

function cloneSnapshot() {
  return JSON.parse(JSON.stringify(snapshot));
}

app.whenReady().then(async () => {
  let win;
  try {
    ipcMain.handle('get-language', () => 'zh-TW');
    ipcMain.handle('get-bubble-font-size', () => 'std');
    ipcMain.handle('get-sticky-notes-size', () => 'std');
    ipcMain.handle('get-focus-mode', () => ({ active: false, until: 0 }));
    ipcMain.handle('laptop-get-shortcuts', () => ({
      shortcuts: [
        { id: 'shortcut-1', type: 'website', name: 'Portal', letter: 'P', color: '#7c3aed', logoUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XGZPFAAAAABJRU5ErkJggg==' },
        { id: 'shortcut-2', type: 'website', name: 'Docs', letter: 'D', color: '#2563eb' },
        { id: 'shortcut-3', type: 'app', name: 'Editor', letter: 'E', color: '#16a34a' },
        { id: 'shortcut-4', type: 'app', name: 'Files', letter: 'F', color: '#ea580c' }
      ],
      maxShortcuts: 20,
      emailAccounts: [{ id: 'email-1', name: 'Work Email' }, { id: 'email-2', name: 'Personal Email' }],
      calendars: [{ id: 'cal-1', name: 'Work Calendar' }, { id: 'cal-2', name: 'Home Calendar' }]
    }));
    ipcMain.handle('laptop-open-action', () => ({ ok: true }));
    ipcMain.handle('laptop-save-shortcut-order', (event, order) => {
      savedShortcutOrder = order;
      return { ok: true, order };
    });
    ipcMain.handle('laptop-choose-custom-app', () => ({ canceled: true, shortcuts: [] }));
    ipcMain.handle('laptop-get-shortcut-settings', () => ({ shortcuts: [], maxShortcuts: 20 }));
    ipcMain.handle('laptop-replace-shortcuts', () => ({ ok: true, shortcuts: [] }));
    ipcMain.handle('laptop-open-shortcut', () => ({ ok: true }));
    ipcMain.handle('laptop-open-account', () => ({ ok: true }));
    ipcMain.on('show-context-menu', () => {
      menuRequestCount += 1;
    });
    ipcMain.on('set-ignore-mouse-events', (event, ignore) => {
      ignoreMouseEventStates.push(ignore);
    });
    ipcMain.on('window-drag-start', () => {
      windowDragStartCount += 1;
    });
    ipcMain.handle('sticky-notes-list', () => cloneSnapshot());
    ipcMain.handle('sticky-notes-save-view', () => ({ success: true }));
    ipcMain.handle('sticky-notes-create', (event, input) => {
      const now = Date.now();
      const note = {
        id: `ui-note-${++noteSequence}`,
        title: input.title,
        content: (input.items || []).map(item => item.text).join('\n'),
        items: (input.items || []).map((item, index) => ({
          id: `ui-item-${noteSequence}-${index + 1}`,
          text: item.text,
          completed: false
        })),
        color: input.color,
        status: 'active',
        createdAt: now,
        updatedAt: now
      };
      snapshot.active.unshift(note);
      return { success: true, note, snapshot: cloneSnapshot() };
    });
    ipcMain.handle('sticky-notes-complete', (event, id) => {
      snapshot.active = snapshot.active.filter(note => note.id !== id);
      return { success: true, snapshot: cloneSnapshot() };
    });
    ipcMain.handle('sticky-notes-update-item', (event, input) => {
      const note = snapshot.active.find(candidate => candidate.id === input.noteId);
      const item = note?.items?.find(candidate => candidate.id === input.itemId);
      if (!item) return { success: false, error: 'missing item' };
      item.completed = input.completed === true;
      note.updatedAt = Date.now();
      return { success: true, note, snapshot: cloneSnapshot() };
    });

    win = new BrowserWindow({
      width: 330,
      height: 460,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, '../electron/preload.cjs'),
        nodeIntegration: false,
        contextIsolation: true
      }
    });
    await win.loadFile(path.join(__dirname, '../dist/index.html'));
    await new Promise(resolve => setTimeout(resolve, 250));

    const initial = await win.webContents.executeJavaScript(`
      (() => {
        const trigger = document.getElementById('laptop-notes-trigger');
        const rect = trigger.getBoundingClientRect();
        return {
          triggerExists: !!trigger,
          triggerHasNoPlusText: trigger.textContent.trim() === '',
          outlineExists: !!trigger.querySelector('.laptop-hit-outline'),
          centerX: Math.round(rect.left + rect.width / 2),
          centerY: Math.round(rect.top + rect.height / 2),
          boardVisible: document.getElementById('sticky-notes-board').classList.contains('visible'),
          reopenHiddenWithoutNotes: !document.getElementById('sticky-reopen-tab').classList.contains('visible'),
          colorChoices: document.querySelectorAll('input[name="sticky-color"]').length,
          stickySizeInitialized: document.body.classList.contains('sticky-size-std'),
          toolbarButtonsMatch: (() => {
            const add = document.getElementById('sticky-add-button');
            const close = document.getElementById('sticky-board-close');
            const addStyle = getComputedStyle(add);
            const closeStyle = getComputedStyle(close);
            return add.getBoundingClientRect().width === close.getBoundingClientRect().width &&
              add.getBoundingClientRect().height === close.getBoundingClientRect().height &&
              addStyle.backgroundColor === closeStyle.backgroundColor &&
              addStyle.borderRadius === closeStyle.borderRadius &&
              !!add.querySelector('svg') && !!close.querySelector('svg');
          })()
        };
      })()
    `);
    assert.equal(initial.triggerExists, true);
    assert.equal(initial.triggerHasNoPlusText, true);
    assert.equal(initial.outlineExists, true);
    assert.equal(initial.boardVisible, false);
    assert.equal(initial.reopenHiddenWithoutNotes, true);
    assert.equal(initial.colorChoices, 3);
    assert.equal(initial.stickySizeInitialized, true);
    assert.equal(initial.toolbarButtonsMatch, true);

    win.webContents.send('settings-window-visibility', true);
    await new Promise(resolve => setTimeout(resolve, 100));
    const settingsShortcutPreview = await win.webContents.executeJavaScript(`({
      visible: document.getElementById('laptop-quick-menu').classList.contains('visible'),
      expanded: document.getElementById('laptop-notes-trigger').getAttribute('aria-expanded')
    })`);
    assert.equal(settingsShortcutPreview.visible, true);
    assert.equal(settingsShortcutPreview.expanded, 'true');
    win.webContents.send('settings-window-visibility', false);
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(await win.webContents.executeJavaScript(
      `document.getElementById('laptop-quick-menu').classList.contains('visible')`
    ), false);

    win.webContents.send('size-updated', { sizeKey: 'mini', bearSize: 140, isInit: true });
    win.webContents.send('dock-side-changed', 'left');
    win.webContents.send('assistant-visibility-changed', false);
    await new Promise(resolve => setTimeout(resolve, 250));
    const bearOnlyHidden = await win.webContents.executeJavaScript(`(() => {
      const board = document.getElementById('sticky-notes-board');
      const shortcutMenu = document.getElementById('laptop-quick-menu');
      const shortcutStyle = getComputedStyle(shortcutMenu);
      const shortcutRect = shortcutMenu.getBoundingClientRect();
      const panelsRect = document.getElementById('assistant-panels-stack').getBoundingClientRect();
      board.classList.add('visible');
      const result = {
        hiddenClass: document.body.classList.contains('assistant-hidden'),
        bearVisualHidden: getComputedStyle(document.querySelector('.assistant-visual-layer')).visibility === 'hidden',
        shortcutMenuVisible: document.getElementById('laptop-quick-menu').classList.contains('visible'),
        shortcutCount: document.querySelectorAll('.laptop-quick-action').length,
        shortcutPosition: getComputedStyle(document.getElementById('laptop-quick-menu')).position,
        shortcutParent: document.getElementById('laptop-quick-menu').parentElement?.id,
        shortcutRightGap: Math.round(innerWidth - shortcutRect.right),
        shortcutPanelGap: Math.round(shortcutRect.top - panelsRect.bottom),
        shortcutRect: {
          left: Math.round(shortcutRect.left), top: Math.round(shortcutRect.top),
          right: Math.round(shortcutRect.right), bottom: Math.round(shortcutRect.bottom),
          width: Math.round(shortcutRect.width), height: Math.round(shortcutRect.height)
        },
        shortcutOpacity: shortcutStyle.opacity,
        shortcutDisplay: shortcutStyle.display,
        shortcutPointerEvents: shortcutStyle.pointerEvents,
        viewport: { width: innerWidth, height: innerHeight },
        stickyBoardDisplay: getComputedStyle(board).display,
        hostBodyDisplay: getComputedStyle(document.body).display
      };
      board.classList.remove('visible');
      return result;
    })()`);
    assert.equal(bearOnlyHidden.hiddenClass, true);
    assert.equal(bearOnlyHidden.bearVisualHidden, true);
    assert.equal(bearOnlyHidden.shortcutMenuVisible, true);
    assert.equal(bearOnlyHidden.shortcutCount, 9);
    assert.equal(bearOnlyHidden.shortcutPosition, 'fixed');
    assert.equal(bearOnlyHidden.shortcutParent, 'pet-container');
    assert.ok(bearOnlyHidden.shortcutRightGap >= 9 && bearOnlyHidden.shortcutRightGap <= 11, JSON.stringify(bearOnlyHidden));
    // A visible dialogue now reserves additional space below the panels.
    assert.ok(bearOnlyHidden.shortcutPanelGap >= 6, JSON.stringify(bearOnlyHidden));
    assert.equal(bearOnlyHidden.shortcutOpacity, '1');
    assert.notEqual(bearOnlyHidden.shortcutDisplay, 'none');
    assert.equal(bearOnlyHidden.shortcutPointerEvents, 'auto');
    assert.ok(bearOnlyHidden.shortcutRect.width > 0 && bearOnlyHidden.shortcutRect.height > 0, JSON.stringify(bearOnlyHidden));
    assert.ok(bearOnlyHidden.shortcutRect.top >= 0 && bearOnlyHidden.shortcutRect.bottom <= bearOnlyHidden.viewport.height, JSON.stringify(bearOnlyHidden));
    assert.notEqual(bearOnlyHidden.stickyBoardDisplay, 'none');
    assert.notEqual(bearOnlyHidden.hostBodyDisplay, 'none');

    const shortcutSurvivesDialogue = await win.webContents.executeJavaScript(`(() => {
      const bubble = document.getElementById('speech-bubble');
      bubble.classList.add('show');
      bubble.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      bubble.classList.remove('show');
      document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return document.getElementById('laptop-quick-menu').classList.contains('visible');
    })()`);
    assert.equal(shortcutSurvivesDialogue, true);

    win.webContents.send('assistant-visibility-changed', true);
    win.webContents.send('size-updated', { sizeKey: 'std', bearSize: 190, isInit: true });
    win.webContents.send('dock-side-changed', 'right');
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(await win.webContents.executeJavaScript(
      `document.body.classList.contains('assistant-hidden')`
    ), false);

    const bearClickState = await win.webContents.executeJavaScript(`
      (() => {
        const bear = document.getElementById('bear-character');
        const speech = document.getElementById('speech-text');
        const speechBefore = speech.textContent;
        document.getElementById('bear-body-img').dispatchEvent(new MouseEvent('click', {
          bubbles: true,
          cancelable: true
        }));
        return {
          hasBounce: bear.classList.contains('bounce'),
          speechUnchanged: speech.textContent === speechBefore,
          assistantTitle: bear.title === 'METech小助手'
        };
      })()
    `);
    assert.equal(bearClickState.hasBounce, false);
    assert.equal(bearClickState.speechUnchanged, true);
    assert.equal(bearClickState.assistantTitle, true);

    ignoreMouseEventStates = [];
    await win.webContents.executeJavaScript(`
      document.getElementById('bear-body-img').dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true,
        cancelable: true
      }));
    `);
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(ignoreMouseEventStates.at(-1), true);

    await win.webContents.executeJavaScript(`
      document.getElementById('ball-canvas').dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true,
        cancelable: true
      }));
    `);
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(ignoreMouseEventStates.at(-1), false);

    await win.webContents.executeJavaScript(`
      document.getElementById('bear-body-img').dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true
      }));
      document.getElementById('laptop-notes-trigger').dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true
      }));
    `);
    await new Promise(resolve => setTimeout(resolve, 60));
    assert.equal(menuRequestCount, 0);

    await win.webContents.executeJavaScript(`
      document.getElementById('ball-canvas').dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true
      }));
    `);
    await new Promise(resolve => setTimeout(resolve, 60));
    assert.equal(menuRequestCount, 1);

    win.setContentSize(420, 560);
    win.webContents.send('sticky-size-updated', { sizeKey: 'lg', boardWidth: 404, isInit: true });
    await new Promise(resolve => setTimeout(resolve, 80));
    const largeStickyLayout = await win.webContents.executeJavaScript(`(() => {
      const board = document.getElementById('sticky-notes-board');
      board.style.display = 'flex';
      const boardWidth = Math.round(board.getBoundingClientRect().width);
      board.style.removeProperty('display');
      return {
        boardWidth,
        bearWidth: Math.round(parseFloat(getComputedStyle(document.getElementById('bear-character')).width)),
        largeClass: document.body.classList.contains('sticky-size-lg')
      };
    })()`);
    assert.equal(largeStickyLayout.boardWidth, 404);
    assert.equal(largeStickyLayout.bearWidth, 190);
    assert.equal(largeStickyLayout.largeClass, true);

    win.webContents.send('sticky-size-updated', { sizeKey: 'sm', boardWidth: 264, isInit: true });
    await new Promise(resolve => setTimeout(resolve, 80));
    const smallStickyLayout = await win.webContents.executeJavaScript(`(() => {
      const board = document.getElementById('sticky-notes-board');
      board.style.display = 'flex';
      const boardWidth = Math.round(board.getBoundingClientRect().width);
      board.style.removeProperty('display');
      return {
        boardWidth,
        bearWidth: Math.round(parseFloat(getComputedStyle(document.getElementById('bear-character')).width)),
        smallClass: document.body.classList.contains('sticky-size-sm')
      };
    })()`);
    // The standard assistant is wider than the small sticky preset, so the
    // shared panel keeps the assistant's 314 px minimum width.
    assert.equal(smallStickyLayout.boardWidth, 314);
    assert.equal(smallStickyLayout.bearWidth, 190);
    assert.equal(smallStickyLayout.smallClass, true);

    win.setContentSize(330, 460);
    win.webContents.send('sticky-size-updated', { sizeKey: 'std', boardWidth: 314, isInit: true });
    await new Promise(resolve => setTimeout(resolve, 80));

    win.webContents.sendInputEvent({
      type: 'mouseMove',
      x: initial.centerX,
      y: initial.centerY
    });
    await new Promise(resolve => setTimeout(resolve, 80));
    const hoverStroke = await win.webContents.executeJavaScript(
      `getComputedStyle(document.querySelector('.laptop-outline-screen')).stroke`
    );
    assert.match(hoverStroke, /125, 211, 252/);

    const laptopMenuState = await win.webContents.executeJavaScript(`(() => {
      const trigger = document.getElementById('laptop-notes-trigger');
      trigger.click();
      const menu = document.getElementById('laptop-quick-menu');
      return {
        visible: menu.classList.contains('visible'),
        expanded: trigger.getAttribute('aria-expanded'),
        actions: [...menu.querySelectorAll('[data-laptop-action]')].map(button => button.dataset.laptopAction),
        hasNestedCustomPanel: !!document.getElementById('laptop-custom-panel'),
        customLogoImage: !!menu.querySelector('[data-shortcut-id="shortcut-1"] .laptop-action-icon img')
      };
    })()`);
    assert.equal(laptopMenuState.visible, true);
    assert.equal(laptopMenuState.expanded, 'true');
    assert.deepEqual(laptopMenuState.actions, ['sticky']);
    assert.equal(laptopMenuState.hasNestedCustomPanel, false);
    assert.equal(laptopMenuState.customLogoImage, true);

    await new Promise(resolve => setTimeout(resolve, 100));
    win.webContents.send('panel-opacity-updated', { todo: 1, calendar: 1, email: 1, shortcut: 0.55, assistant: 0.6 });
    await new Promise(resolve => setTimeout(resolve, 250));
    const shortcutPreviewOpacity = await win.webContents.executeJavaScript(
      `getComputedStyle(document.querySelector('.laptop-quick-action')).opacity`
    );
    assert.equal(shortcutPreviewOpacity, '0.55');
    const assistantPreview = await win.webContents.executeJavaScript(`({
      filter: getComputedStyle(document.querySelector('.assistant-visual-layer')).filter,
      inlineFilter: document.querySelector('.assistant-visual-layer').style.filter,
      speechFilter: document.getElementById('speech-bubble').style.filter,
      variable: getComputedStyle(document.documentElement).getPropertyValue('--assistant-opacity').trim()
    })`);
    assert.equal(assistantPreview.variable, '0.6');
    // Hidden Electron windows throttle CSS transitions, so verify the applied
    // inline target value instead of the non-advancing composited frame.
    assert.equal(assistantPreview.inlineFilter, 'opacity(0.6)');
    assert.equal(assistantPreview.speechFilter, 'opacity(0.6)');
    win.webContents.send('panel-opacity-updated', { todo: 1, calendar: 1, email: 1, shortcut: 1, assistant: 1 });

    win.webContents.send('size-updated', { sizeKey: 'mini', bearSize: 140, isInit: true });
    win.webContents.send('dock-side-changed', 'right');
    await new Promise(resolve => setTimeout(resolve, 100));
    const miniShortcutLayout = await win.webContents.executeJavaScript(`(() => {
      const menu = document.getElementById('laptop-quick-menu').getBoundingClientRect();
      const bear = document.getElementById('bear-character').getBoundingClientRect();
      const actions = document.querySelectorAll('.laptop-quick-action');
      const actionRects = [...actions].map(action => action.getBoundingClientRect());
      const visibleBearLeft = bear.left + bear.width * (125 / 720);
      return {
        actionCount: actions.length,
        gridColumns: getComputedStyle(document.getElementById('laptop-quick-menu')).gridTemplateColumns,
        overflowY: getComputedStyle(document.getElementById('laptop-quick-menu')).overflowY,
        menuHeight: Math.round(menu.height),
        bearHeight: Math.round(bear.height),
        gridPositions: actionRects.map((rect, index) => ({ index: index + 1, x: Math.round(rect.left), y: Math.round(rect.top) })),
        actionCursor: getComputedStyle(actions[0]).cursor,
        actionShadow: getComputedStyle(actions[0]).boxShadow,
        iconShadow: getComputedStyle(actions[0].querySelector('.laptop-action-icon')).boxShadow,
        hoverLogoStyle: [...document.styleSheets]
          .flatMap(sheet => [...sheet.cssRules])
          .find(rule => rule.selectorText === '.laptop-quick-action:hover .laptop-action-icon')?.style.cssText || '',
        iconBackground: getComputedStyle(actions[0].querySelector('.laptop-action-icon')).backgroundColor,
        iconWidth: Math.round(parseFloat(getComputedStyle(actions[0].querySelector('.laptop-action-icon')).width)),
        iconBorderWidth: getComputedStyle(actions[0].querySelector('.laptop-action-icon')).borderTopWidth,
        iconOutlineStyle: getComputedStyle(actions[0].querySelector('.laptop-action-icon')).outlineStyle,
        menuLeft: Math.round(menu.left),
        menuRight: Math.round(menu.right),
        bearLeft: Math.round(bear.left),
        visibleBearLeft: Math.round(visibleBearLeft),
        visualGap: Math.round(visibleBearLeft - Math.max(...actionRects.map(rect => rect.right))),
        visibleLabelCharacters: [...document.querySelectorAll('.laptop-action-label')].reduce((sum, label) => sum + label.textContent.length, 0),
        insideViewport: menu.left >= 0 && actionRects.every(rect => rect.left >= 0 && rect.right <= innerWidth),
        actionsContained: actionRects.every(rect => rect.left >= menu.left && rect.right <= menu.right + 1),
        noVisibleBearOverlap: actionRects.every(rect => rect.right <= visibleBearLeft)
      };
    })()`);
    assert.equal(miniShortcutLayout.actionCount, 9);
    assert.match(miniShortcutLayout.gridColumns, /^24px 24px$/);
    assert.equal(miniShortcutLayout.overflowY, 'hidden');
    assert.equal(miniShortcutLayout.actionCursor, 'pointer');
    assert.equal(miniShortcutLayout.actionShadow, 'none');
    assert.equal(miniShortcutLayout.iconShadow, 'none');
    assert.match(miniShortcutLayout.hoverLogoStyle, /transform:\s*scale\(1\.08\)/);
    assert.match(miniShortcutLayout.hoverLogoStyle, /box-shadow:/);
    assert.match(miniShortcutLayout.iconBackground, /^rgb\(/);
    assert.doesNotMatch(miniShortcutLayout.iconBackground, /rgba\(/);
    assert.equal(miniShortcutLayout.iconWidth, 22);
    assert.equal(miniShortcutLayout.iconBorderWidth, '0px');
    assert.equal(miniShortcutLayout.iconOutlineStyle, 'none');
    assert.equal(miniShortcutLayout.visibleLabelCharacters, 0);
    assert.equal(miniShortcutLayout.insideViewport, true, JSON.stringify(miniShortcutLayout));
    assert.equal(miniShortcutLayout.actionsContained, true, JSON.stringify(miniShortcutLayout));
    assert.equal(miniShortcutLayout.noVisibleBearOverlap, true, JSON.stringify(miniShortcutLayout));
    assert.ok(miniShortcutLayout.menuHeight <= miniShortcutLayout.bearHeight, JSON.stringify(miniShortcutLayout));
    assert.ok(miniShortcutLayout.visualGap >= 0 && miniShortcutLayout.visualGap <= 6, JSON.stringify(miniShortcutLayout));
    const positions = miniShortcutLayout.gridPositions;
    assert.equal(positions[0].x, positions[1].x);
    assert.equal(positions[1].x, positions[2].x);
    assert.equal(positions[3].x, positions[0].x);
    assert.equal(positions[4].x, positions[0].x);
    assert.ok(positions[5].x < positions[0].x);
    assert.deepEqual(
      [...positions].sort((a, b) => a.y - b.y || a.x - b.x).map(item => item.index),
      [6, 1, 7, 2, 8, 3, 9, 4, 5]
    );
    win.webContents.send('size-updated', { sizeKey: 'std', bearSize: 190, isInit: true });
    await new Promise(resolve => setTimeout(resolve, 80));
    const standardLabelLengths = await win.webContents.executeJavaScript(
      `[...document.querySelectorAll('.laptop-action-label')].map(label => [...label.textContent].length)`
    );
    const standardGridColumns = await win.webContents.executeJavaScript(
      `getComputedStyle(document.getElementById('laptop-quick-menu')).gridTemplateColumns`
    );
    const standardVisualGap = await win.webContents.executeJavaScript(`(() => {
      const bear = document.getElementById('bear-character').getBoundingClientRect();
      const visibleBearLeft = bear.left + bear.width * (125 / 720);
      const actionRight = Math.max(...[...document.querySelectorAll('.laptop-quick-action')]
        .map(action => action.getBoundingClientRect().right));
      return Math.round(visibleBearLeft - actionRight);
    })()`);
    assert.equal(standardLabelLengths.every(length => length === 0), true);
    assert.match(standardGridColumns, /^25px 25px$/);
    assert.ok(standardVisualGap >= 0 && standardVisualGap <= 6, `standardVisualGap=${standardVisualGap}`);
    win.webContents.send('size-updated', { sizeKey: 'lg', bearSize: 250, isInit: true });
    await new Promise(resolve => setTimeout(resolve, 80));
    const largeLabelLengths = await win.webContents.executeJavaScript(
      `[...document.querySelectorAll('.laptop-action-label')].map(label => [...label.textContent].length)`
    );
    const largeLabels = await win.webContents.executeJavaScript(
      `[...document.querySelectorAll('.laptop-action-label')].map(label => label.textContent)`
    );
    const largeVerticalLayout = await win.webContents.executeJavaScript(`(() => {
      const menu = document.getElementById('laptop-quick-menu').getBoundingClientRect();
      const bear = document.getElementById('bear-character').getBoundingClientRect();
      const offset = menu.top - bear.top;
      const visibleBearLeft = bear.left + bear.width * (125 / 720);
      const actionRight = Math.max(...[...document.querySelectorAll('.laptop-quick-action')]
        .map(action => action.getBoundingClientRect().right));
      return {
        menuTop: Math.round(menu.top),
        bearTop: Math.round(bear.top),
        offset: Math.round(offset),
        visualGap: Math.round(visibleBearLeft - actionRight),
        alignedNearTop: offset >= 8 && offset <= 18
      };
    })()`);
    assert.equal(largeLabelLengths.some(length => length > 6), true);
    assert.equal(largeLabelLengths.every(length => length > 0), true);
    assert.equal(largeLabels[0], '便利貼');
    assert.equal(largeLabels[1], 'Work Email');
    assert.equal(largeLabels[3], 'Work Calendar');
    const labelWidths = await win.webContents.executeJavaScript(`(() => {
      const action = document.querySelector('.laptop-quick-action');
      const label = action.querySelector('.laptop-action-label');
      const icon = action.querySelector('.laptop-action-icon');
      const original = label.textContent;
      const samples = ['iiiiiiiiiiii', '公司內部管理系統入口', 'WWWWWWWWWWWW'].map(text => {
        label.textContent = text;
        const style = getComputedStyle(label);
        return { text, width: label.clientWidth, scrollWidth: label.scrollWidth,
          iconWidth: icon.offsetWidth, buttonWidth: action.offsetWidth,
          overflow: style.overflow, textOverflow: style.textOverflow };
      });
      label.textContent = original;
      return samples;
    })()`);
    assert.ok(labelWidths[0].scrollWidth <= labelWidths[0].width, JSON.stringify(labelWidths));
    assert.ok(labelWidths[1].scrollWidth > labelWidths[1].width, JSON.stringify(labelWidths));
    assert.ok(labelWidths[2].scrollWidth > labelWidths[2].width, JSON.stringify(labelWidths));
    for (const sample of labelWidths) {
      assert.equal(sample.buttonWidth, 104);
      assert.equal(sample.iconWidth, 24);
      assert.equal(sample.width, 63);
      assert.equal(sample.overflow, 'hidden');
      assert.equal(sample.textOverflow, 'ellipsis');
    }
    assert.equal(largeVerticalLayout.alignedNearTop, true, JSON.stringify(largeVerticalLayout));
    assert.ok(largeVerticalLayout.visualGap >= 2 && largeVerticalLayout.visualGap <= 6, JSON.stringify(largeVerticalLayout));
    win.webContents.send('size-updated', { sizeKey: 'std', bearSize: 190, isInit: true });
    await new Promise(resolve => setTimeout(resolve, 80));

    const saveButtonLayout = await win.webContents.executeJavaScript(`
      (() => {
        document.querySelector('[data-laptop-action="sticky"]').click();
        const boardRect = document.getElementById('sticky-notes-board').getBoundingClientRect();
        const saveRect = document.getElementById('sticky-save-button').getBoundingClientRect();
        const subjectRect = document.getElementById('sticky-subject').getBoundingClientRect();
        const blueInput = document.querySelector('input[name="sticky-color"][value="blue"]');
        const blueOption = blueInput.closest('.sticky-color-option');
        const redOption = document.querySelector('input[name="sticky-color"][value="red"]')
          .closest('.sticky-color-option');
        return {
          fullyInsideBoard: saveRect.top >= boardRect.top && saveRect.bottom <= boardRect.bottom,
          aboveSubject: saveRect.bottom <= subjectRect.top,
          nativeRadioHidden: getComputedStyle(blueInput).opacity === '0',
          selectedPriorityLit: getComputedStyle(blueOption).boxShadow !== 'none',
          unselectedPriorityNotLit: getComputedStyle(redOption).boxShadow === 'none',
          formatToolbarRemoved: !document.querySelector('.sticky-format-toolbar')
        };
      })()
    `);
    assert.equal(saveButtonLayout.fullyInsideBoard, true);
    assert.equal(saveButtonLayout.aboveSubject, true);
    assert.equal(saveButtonLayout.nativeRadioHidden, true);
    assert.equal(saveButtonLayout.selectedPriorityLit, true);
    assert.equal(saveButtonLayout.unselectedPriorityNotLit, true);
    assert.equal(saveButtonLayout.formatToolbarRemoved, true);
    await win.webContents.executeJavaScript(`
      document.getElementById('sticky-form-close').click();
    `);

    async function createNote(title, contents, color) {
      await win.webContents.executeJavaScript(`
        document.querySelector('[data-laptop-action="sticky"]').click();
        document.getElementById('sticky-subject').value = ${JSON.stringify(title)};
        (() => {
          const values = ${JSON.stringify(contents)};
          values.forEach((value, index) => {
            if (index > 0) document.getElementById('sticky-add-item').click();
            const editors = document.querySelectorAll('[data-role="item-editor"]');
            const editor = editors[editors.length - 1];
            editor.textContent = value;
          });
        })();
        document.querySelector('input[name="sticky-color"][value="${color}"]').checked = true;
        document.getElementById('sticky-note-form').requestSubmit();
      `);
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    await createNote('回覆重要客戶', ['下午三點前完成報價回覆', '確認報價附件'], 'red');
    await createNote('準備明日會議', ['整理會議資料與議程'], 'blue');

    const composerSeparation = await win.webContents.executeJavaScript(`(() => {
      document.getElementById('sticky-add-button').click();
      const form = document.getElementById('sticky-note-form').getBoundingClientRect();
      const cards = [...document.querySelectorAll('.sticky-note-card')]
        .map(card => card.getBoundingClientRect());
      const result = {
        composerVisible: document.getElementById('sticky-note-form').classList.contains('visible'),
        notesRemainVisible: cards.length === 2 && cards.every(card => card.width > 0 && card.height > 0),
        noOverlap: cards.every(card => card.bottom <= form.top)
      };
      document.getElementById('sticky-form-close').click();
      return result;
    })()`);
    assert.equal(composerSeparation.composerVisible, true);
    assert.equal(composerSeparation.notesRemainVisible, true);
    assert.equal(composerSeparation.noOverlap, true, JSON.stringify(composerSeparation));

    const collapsedState = await win.webContents.executeJavaScript(`(() => {
      document.getElementById('sticky-board-close').click();
      const board = document.getElementById('sticky-notes-board');
      const reopen = document.getElementById('sticky-reopen-tab');
      return {
        boardHidden: !board.classList.contains('visible'),
        reopenVisible: reopen.classList.contains('visible'),
        reopenCount: document.getElementById('sticky-reopen-count').textContent,
        composerHidden: !document.getElementById('sticky-note-form').classList.contains('visible')
      };
    })()`);
    assert.equal(collapsedState.boardHidden, true);
    assert.equal(collapsedState.reopenVisible, true);
    assert.equal(collapsedState.reopenCount, '2');
    assert.equal(collapsedState.composerHidden, true);

    const reopenedState = await win.webContents.executeJavaScript(`(() => {
      document.getElementById('sticky-reopen-tab').click();
      return {
        boardVisible: document.getElementById('sticky-notes-board').classList.contains('visible'),
        reopenHidden: !document.getElementById('sticky-reopen-tab').classList.contains('visible'),
        composerHidden: !document.getElementById('sticky-note-form').classList.contains('visible')
      };
    })()`);
    assert.equal(reopenedState.boardVisible, true);
    assert.equal(reopenedState.reopenHidden, true);
    assert.equal(reopenedState.composerHidden, true);

    win.webContents.send('move-mode-changed', true, true);
    await new Promise(resolve => setTimeout(resolve, 50));
    const moveModeSummaryClick = await win.webContents.executeJavaScript(`(() => {
      const targetCard = [...document.querySelectorAll('.sticky-note-card')]
        .find(card => card.querySelector('.sticky-note-subject').textContent === '回覆重要客戶');
      const subject = targetCard.querySelector('.sticky-note-subject');
      const expandButton = targetCard.querySelector('button[data-action="expand"]');
      subject.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
      subject.click();
      const subjectDidNotExpand = !targetCard.classList.contains('expanded');
      expandButton.click();
      return {
        moveModeClass: document.getElementById('pet-container').classList.contains('move-mode'),
        subjectDidNotExpand,
        expandedFromButton: targetCard.classList.contains('expanded'),
        buttonCursor: getComputedStyle(expandButton).cursor
      };
    })()`);
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(moveModeSummaryClick.moveModeClass, true);
    assert.equal(moveModeSummaryClick.subjectDidNotExpand, true);
    assert.equal(moveModeSummaryClick.expandedFromButton, true);
    assert.equal(moveModeSummaryClick.buttonCursor, 'pointer');
    assert.equal(windowDragStartCount, 0);
    await win.webContents.executeJavaScript(`(() => {
      const targetCard = [...document.querySelectorAll('.sticky-note-card')]
        .find(card => card.querySelector('.sticky-note-subject').textContent === '回覆重要客戶');
      targetCard.querySelector('button[data-action="expand"]').click();
    })()`);
    win.webContents.send('move-mode-changed', false, true);
    await new Promise(resolve => setTimeout(resolve, 30));
    ignoreMouseEventStates = [];
    await win.webContents.executeJavaScript(`(() => {
      document.getElementById('bear-body-img').dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
      const targetCard = [...document.querySelectorAll('.sticky-note-card')]
        .find(card => card.querySelector('.sticky-note-subject').textContent === '回覆重要客戶');
      targetCard.querySelector('.sticky-note-summary').dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    })()`);
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(ignoreMouseEventStates.at(-1), false);

    const beforeExpand = await win.webContents.executeJavaScript(`
      (() => {
        document.getElementById('speech-bubble').classList.remove('show');
        const cards = [...document.querySelectorAll('.sticky-note-card')];
        const targetCard = cards.find(card => card.querySelector('.sticky-note-subject').textContent === '回覆重要客戶');
        const details = targetCard.querySelector('.sticky-note-content');
        const button = targetCard.querySelector('button[data-action="expand"]');
        const rect = button.getBoundingClientRect();
        const topElement = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return {
          cardCount: cards.length,
          completionHidden: getComputedStyle(details).display === 'none',
          expandReceivesPointer: topElement === button || button.contains(topElement)
        };
      })()
    `);
    assert.equal(beforeExpand.cardCount, 2);
    assert.equal(beforeExpand.completionHidden, true);
    assert.equal(beforeExpand.expandReceivesPointer, true);

    const expanded = await win.webContents.executeJavaScript(`
      (() => {
        const cards = [...document.querySelectorAll('.sticky-note-card')];
        const targetCard = cards.find(card => card.querySelector('.sticky-note-subject').textContent === '回覆重要客戶');
        targetCard.querySelector('button[data-action="expand"]').click();
        return {
          expanded: targetCard.classList.contains('expanded'),
          itemCount: targetCard.querySelectorAll('.sticky-note-item-row').length,
          firstItem: targetCard.querySelector('.sticky-note-item-text').textContent,
          secondItem: targetCard.querySelectorAll('.sticky-note-item-text')[1].textContent,
          completionVisible: getComputedStyle(targetCard.querySelector('.sticky-note-content')).display !== 'none',
          itemCheckboxExists: !!targetCard.querySelector('input[data-action="toggle-item"]'),
          deleteButtonExists: !!targetCard.querySelector('button[data-action="request-delete-note"]'),
          deleteConfirmInitiallyHidden: getComputedStyle(targetCard.querySelector('.sticky-delete-confirm')).display === 'none'
        };
      })()
    `);
    assert.equal(expanded.expanded, true);
    assert.equal(expanded.itemCount, 2);
    assert.equal(expanded.firstItem, '下午三點前完成報價回覆');
    assert.equal(expanded.secondItem, '確認報價附件');
    assert.equal(expanded.completionVisible, true);
    assert.equal(expanded.itemCheckboxExists, true);
    assert.equal(expanded.deleteButtonExists, true);
    assert.equal(expanded.deleteConfirmInitiallyHidden, true);

    await win.webContents.executeJavaScript(`(() => {
      const targetCard = [...document.querySelectorAll('.sticky-note-card')]
        .find(card => card.querySelector('.sticky-note-subject').textContent === '回覆重要客戶');
      targetCard.querySelector('.sticky-note-item-text').click();
    })()`);
    await new Promise(resolve => setTimeout(resolve, 100));
    const afterItemTextClick = await win.webContents.executeJavaScript(`(() => {
      const targetCard = [...document.querySelectorAll('.sticky-note-card')]
        .find(card => card.querySelector('.sticky-note-subject').textContent === '回覆重要客戶');
      const row = targetCard.querySelector('.sticky-note-item-row');
      return {
        checkboxChecked: row.querySelector('input[data-action="toggle-item"]').checked,
        itemCompleted: row.classList.contains('completed'),
        textDecoration: getComputedStyle(row.querySelector('.sticky-note-item-text')).textDecorationLine
      };
    })()`);
    assert.equal(afterItemTextClick.checkboxChecked, false);
    assert.equal(afterItemTextClick.itemCompleted, false);
    assert.doesNotMatch(afterItemTextClick.textDecoration, /line-through/);

    await win.webContents.executeJavaScript(`
      (() => {
        const cards = [...document.querySelectorAll('.sticky-note-card')];
        const targetCard = cards.find(card => card.querySelector('.sticky-note-subject').textContent === '回覆重要客戶');
        targetCard.querySelector('input[data-action="toggle-item"]').click();
      })();
    `);
    await new Promise(resolve => setTimeout(resolve, 100));

    const itemCompleted = await win.webContents.executeJavaScript(`(() => {
      const cards = [...document.querySelectorAll('.sticky-note-card')];
      const targetCard = cards.find(card => card.querySelector('.sticky-note-subject').textContent === '回覆重要客戶');
      const row = targetCard.querySelector('.sticky-note-item-row');
      return {
        noteStillExists: !!targetCard,
        remainedExpanded: targetCard.classList.contains('expanded'),
        itemCompleted: row.classList.contains('completed'),
        textDecoration: getComputedStyle(row.querySelector('.sticky-note-item-text')).textDecorationLine,
        secondItemCompleted: targetCard.querySelectorAll('.sticky-note-item-row')[1].classList.contains('completed')
      };
    })()`);
    assert.equal(itemCompleted.noteStillExists, true);
    assert.equal(itemCompleted.remainedExpanded, true);
    assert.equal(itemCompleted.itemCompleted, true);
    assert.match(itemCompleted.textDecoration, /line-through/);
    assert.equal(itemCompleted.secondItemCompleted, false);

    const deleteRequested = await win.webContents.executeJavaScript(`
      (() => {
        const cards = [...document.querySelectorAll('.sticky-note-card')];
        const targetCard = cards.find(card => card.querySelector('.sticky-note-subject').textContent === '回覆重要客戶');
        targetCard.querySelector('button[data-action="request-delete-note"]').click();
        return {
          cardCount: document.querySelectorAll('.sticky-note-card').length,
          confirmationVisible: getComputedStyle(targetCard.querySelector('.sticky-delete-confirm')).display !== 'none'
        };
      })()
    `);
    assert.equal(deleteRequested.cardCount, 2);
    assert.equal(deleteRequested.confirmationVisible, true);

    const deleteCancelled = await win.webContents.executeJavaScript(`(() => {
      const targetCard = [...document.querySelectorAll('.sticky-note-card')]
        .find(card => card.querySelector('.sticky-note-subject').textContent === '回覆重要客戶');
      targetCard.querySelector('button[data-action="cancel-delete-note"]').click();
      return {
        cardStillExists: !!targetCard,
        confirmationClosed: !targetCard.classList.contains('confirming-delete')
      };
    })()`);
    assert.equal(deleteCancelled.cardStillExists, true);
    assert.equal(deleteCancelled.confirmationClosed, true);

    await win.webContents.executeJavaScript(`(() => {
      const targetCard = [...document.querySelectorAll('.sticky-note-card')]
        .find(card => card.querySelector('.sticky-note-subject').textContent === '回覆重要客戶');
      targetCard.querySelector('button[data-action="request-delete-note"]').click();
      targetCard.querySelector('button[data-action="confirm-delete-note"]').click();
    })()`);
    await new Promise(resolve => setTimeout(resolve, 100));

    const completed = await win.webContents.executeJavaScript(`({
      cardCount: document.querySelectorAll('.sticky-note-card').length,
      remainingSubject: document.querySelector('.sticky-note-subject')?.textContent,
      completedStillExists: [...document.querySelectorAll('.sticky-note-subject')]
        .some(element => element.textContent === '回覆重要客戶')
    })`);
    assert.equal(completed.cardCount, 1);
    assert.equal(completed.remainingSubject, '準備明日會議');
    assert.equal(completed.completedStillExists, false);

    const liveDragPreview = await win.webContents.executeJavaScript(`(() => {
      const menu = document.getElementById('laptop-quick-menu');
      const source = menu.querySelector('[data-shortcut-order-key="sticky"]');
      const target = menu.querySelector('[data-shortcut-order-key="email:email-1"]');
      const targetRect = target.getBoundingClientRect();
      const transfer = new DataTransfer();
      window.__shortcutDragTest = { source, target, transfer, targetRect };
      source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: transfer }));
      target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: targetRect.left + targetRect.width / 2, clientY: targetRect.top + targetRect.height / 2 }));
      return { emailTop: target.getBoundingClientRect().top, stickyTop: source.getBoundingClientRect().top };
    })()`);
    assert.ok(liveDragPreview.emailTop < liveDragPreview.stickyTop, JSON.stringify(liveDragPreview));
    await win.webContents.executeJavaScript(`(() => {
      const { source, target, transfer, targetRect } = window.__shortcutDragTest;
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: targetRect.left + targetRect.width / 2, clientY: targetRect.top + targetRect.height / 2 }));
      source.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: transfer }));
      delete window.__shortcutDragTest;
    })()`);
    await new Promise(resolve => setTimeout(resolve, 80));
    assert.equal(savedShortcutOrder.length, 9);
    assert.equal(savedShortcutOrder[0], 'email:email-1');
    assert.equal(savedShortcutOrder[1], 'sticky');
    const largeDragPositions = await win.webContents.executeJavaScript(`(() => ({
      emailTop: document.querySelector('[data-shortcut-order-key="email:email-1"]').getBoundingClientRect().top,
      stickyTop: document.querySelector('[data-shortcut-order-key="sticky"]').getBoundingClientRect().top
    }))()`);
    assert.ok(largeDragPositions.emailTop < largeDragPositions.stickyTop, JSON.stringify(largeDragPositions));

    // The twenty-action menu limit must still stay within the bear's height:
    // five rows for mini/standard and nine rows for large.
    await win.webContents.executeJavaScript(`(() => {
      const menu = document.getElementById('laptop-quick-menu');
      const template = menu.querySelector('.laptop-quick-action');
      for (let index = 1; index <= 11; index += 1) {
        const clone = template.cloneNode(true);
        clone.dataset.shortcutOrderKey = 'custom:layout-' + index;
        clone.dataset.laptopAction = 'custom:layout-' + index;
        clone.title = 'Layout ' + index;
        menu.appendChild(clone);
      }
      menu.classList.add('visible');
    })()`);

    const readDenseShortcutLayout = () => win.webContents.executeJavaScript(`(() => {
      const menu = document.getElementById('laptop-quick-menu');
      const bear = document.getElementById('bear-character').getBoundingClientRect();
      const actions = [...menu.querySelectorAll('.laptop-quick-action')];
      const rowValues = actions.map(action => Number(action.style.gridRow));
      const columnValues = actions.map(action => Number(action.style.gridColumn));
      const countsByColumn = columnValues.reduce((counts, column) => {
        counts[column] = (counts[column] || 0) + 1;
        return counts;
      }, {});
      return {
        actionCount: actions.length,
        maxRow: Math.max(...rowValues),
        columnCount: new Set(columnValues).size,
        maxItemsInColumn: Math.max(...Object.values(countsByColumn)),
        menuHeight: Math.round(menu.getBoundingClientRect().height),
        bearHeight: Math.round(bear.height),
        insideViewport: actions.every(action => {
          const rect = action.getBoundingClientRect();
          return rect.left >= 0 && rect.right <= innerWidth;
        }),
        compactLargeGrid: menu.classList.contains('compact-overflow-actions'),
        visibleLabelCharacters: actions.reduce((total, action) => total + (action.querySelector('.laptop-action-label')?.textContent.length || 0), 0)
      };
    })()`);

    win.webContents.send('size-updated', { sizeKey: 'mini', bearSize: 140, isInit: true });
    await new Promise(resolve => setTimeout(resolve, 80));
    const denseMini = await readDenseShortcutLayout();
    assert.deepEqual(
      { actionCount: denseMini.actionCount, maxRow: denseMini.maxRow, columnCount: denseMini.columnCount, maxItemsInColumn: denseMini.maxItemsInColumn },
      { actionCount: 20, maxRow: 5, columnCount: 4, maxItemsInColumn: 5 }
    );
    assert.ok(denseMini.menuHeight <= denseMini.bearHeight, JSON.stringify(denseMini));

    win.webContents.send('size-updated', { sizeKey: 'std', bearSize: 190, isInit: true });
    await new Promise(resolve => setTimeout(resolve, 80));
    const denseStandard = await readDenseShortcutLayout();
    assert.deepEqual(
      { actionCount: denseStandard.actionCount, maxRow: denseStandard.maxRow, columnCount: denseStandard.columnCount, maxItemsInColumn: denseStandard.maxItemsInColumn },
      { actionCount: 20, maxRow: 5, columnCount: 4, maxItemsInColumn: 5 }
    );
    assert.ok(denseStandard.menuHeight <= denseStandard.bearHeight, JSON.stringify(denseStandard));

    win.webContents.send('size-updated', { sizeKey: 'lg', bearSize: 250, isInit: true });
    await new Promise(resolve => setTimeout(resolve, 80));
    const denseLarge = await readDenseShortcutLayout();
    assert.deepEqual(
      { actionCount: denseLarge.actionCount, maxRow: denseLarge.maxRow, columnCount: denseLarge.columnCount, maxItemsInColumn: denseLarge.maxItemsInColumn },
      { actionCount: 20, maxRow: 9, columnCount: 3, maxItemsInColumn: 9 }
    );
    assert.ok(denseLarge.menuHeight <= denseLarge.bearHeight, JSON.stringify(denseLarge));
    assert.equal(denseLarge.compactLargeGrid, true);
    assert.equal(denseLarge.visibleLabelCharacters, 0);
    assert.equal(denseLarge.insideViewport, true, JSON.stringify(denseLarge));

    console.log('Electron sticky notes interaction assertions passed.');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (win && !win.isDestroyed()) win.destroy();
    app.quit();
  }
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
  app.quit();
});
