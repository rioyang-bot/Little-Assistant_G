const assert = require('node:assert/strict');
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let snapshot = { active: [] };
let noteSequence = 0;
let menuRequestCount = 0;
let ignoreMouseEventStates = [];

function cloneSnapshot() {
  return JSON.parse(JSON.stringify(snapshot));
}

app.whenReady().then(async () => {
  let win;
  try {
    ipcMain.handle('get-language', () => 'zh-TW');
    ipcMain.handle('get-bubble-font-size', () => 'std');
    ipcMain.handle('get-sticky-notes-size', () => 'std');
    ipcMain.on('show-context-menu', () => {
      menuRequestCount += 1;
    });
    ipcMain.on('set-ignore-mouse-events', (event, ignore) => {
      ignoreMouseEventStates.push(ignore);
    });
    ipcMain.handle('sticky-notes-list', () => cloneSnapshot());
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
    assert.equal(smallStickyLayout.boardWidth, 264);
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

    const saveButtonLayout = await win.webContents.executeJavaScript(`
      (() => {
        document.getElementById('laptop-notes-trigger').click();
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
        document.getElementById('laptop-notes-trigger').click();
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
