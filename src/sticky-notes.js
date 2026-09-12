const TEXT = {
  'zh-TW': {
    boardTitle: '待辦便利貼',
    add: '新增便利貼',
    closeBoard: '收合便利貼',
    reopen: '顯示已收合的便利貼',
    empty: '點小熊的筆電，快速新增第一張便利貼',
    formTitle: '新增便利貼',
    editFormTitle: '編輯便利貼',
    subject: '主旨',
    subjectPlaceholder: '例如：今天回覆客戶',
    content: '事項',
    contentPlaceholder: '輸入待辦事項',
    addItem: '新增事項',
    removeItem: '移除事項',
    color: '顏色／緊急程度',
    red: '緊急',
    amber: '重要',
    blue: '一般',
    save: '儲存便利貼',
    update: '儲存修改',
    editNote: '編輯便利貼',
    alarm: '設定鬧鐘',
    alarmLabel: '鬧鐘日期與時間',
    alarmPast: '鬧鐘時間必須晚於現在',
    required: '請輸入便利貼主旨',
    saveFailed: '便利貼儲存失敗',
    expand: '展開內容與完成選項',
    collapse: '收合便利貼',
    completeItem: '標示此事項完成',
    deleteNote: '整張便利貼已完成，直接刪除',
    deleteConfirm: '確定刪除整張便利貼？',
    deleteAction: '確定刪除',
    cancel: '取消',
    laptop: '快速新增待辦便利貼',
    naturalPlaceholder: '例如：明天下午 3 點提醒我緊急回覆客戶',
    naturalCreate: '✨ 解析並新增',
    naturalRequired: '請輸入自然語言事項',
    naturalFailed: '無法解析或新增這筆事項'
  },
  en: {
    boardTitle: 'To-do Notes',
    add: 'Add note',
    closeBoard: 'Collapse notes',
    reopen: 'Show collapsed sticky notes',
    empty: 'Click the laptop to add your first note',
    formTitle: 'New Sticky Note',
    editFormTitle: 'Edit Sticky Note',
    subject: 'Subject',
    subjectPlaceholder: 'Example: Reply to the client',
    content: 'Items',
    contentPlaceholder: 'Enter a to-do item',
    addItem: 'Add item',
    removeItem: 'Remove item',
    color: 'Color / Priority',
    red: 'Urgent',
    amber: 'Important',
    blue: 'Normal',
    save: 'Save note',
    update: 'Save changes',
    editNote: 'Edit note',
    alarm: 'Set alarm',
    alarmLabel: 'Alarm date and time',
    alarmPast: 'Alarm time must be in the future',
    required: 'Please enter a subject',
    saveFailed: 'Could not save the note',
    expand: 'Expand details and completion option',
    collapse: 'Collapse note',
    completeItem: 'Mark this item complete',
    deleteNote: 'Complete and delete this entire note',
    deleteConfirm: 'Delete this entire note?',
    deleteAction: 'Delete',
    cancel: 'Cancel',
    laptop: 'Quickly add a to-do note',
    naturalPlaceholder: 'Example: Remind me tomorrow at 3 PM to reply to the client urgently',
    naturalCreate: '✨ Parse & Add',
    naturalRequired: 'Enter a natural-language task',
    naturalFailed: 'Could not parse or add this task'
  }
};

export class StickyNotesController {
  constructor(ipc, getLanguage) {
    this.ipc = ipc;
    this.getLanguage = getLanguage;
    this.snapshot = { active: [] };
    this.dismissed = false;
    this.expandedNoteIds = new Set();
    this.viewStateLoaded = false;
    this.viewStateChanges = new Set();
    this.alarmHighlightIds = new Set();
    this.editingNoteId = null;

    this.board = document.getElementById('sticky-notes-board');
    this.list = document.getElementById('sticky-notes-list');
    this.emptyState = document.getElementById('sticky-empty-state');
    this.emptyText = document.getElementById('sticky-empty-text');
    this.boardTitle = document.getElementById('sticky-board-title-text');
    this.activeCount = document.getElementById('sticky-active-count');
    this.addButton = document.getElementById('sticky-add-button');
    this.boardClose = document.getElementById('sticky-board-close');
    this.reopenTab = document.getElementById('sticky-reopen-tab');
    this.reopenCount = document.getElementById('sticky-reopen-count');
    this.form = document.getElementById('sticky-note-form');
    this.formClose = document.getElementById('sticky-form-close');
    this.subject = document.getElementById('sticky-subject');
    this.itemsEditor = document.getElementById('sticky-items-editor');
    this.addItemButton = document.getElementById('sticky-add-item');
    this.formError = document.getElementById('sticky-form-error');
    this.alarmToggle = document.getElementById('sticky-alarm-toggle');
    this.alarmField = document.getElementById('sticky-alarm-field');
    this.alarmAt = document.getElementById('sticky-alarm-at');
    this.trigger = document.getElementById('laptop-notes-trigger');
    this.naturalInput = document.getElementById('sticky-natural-input');
    this.naturalCreateButton = document.getElementById('sticky-natural-create');
  }

  text() {
    return TEXT[this.getLanguage()] || TEXT['zh-TW'];
  }

  async init() {
    if (!this.board || !this.form || !this.trigger) return;
    this.bindEvents();
    this.applyLanguage();

    if (!this.ipc) {
      this.render();
      return;
    }

    try {
      const snapshot = await this.ipc.invoke('sticky-notes-list');
      const view = snapshot?.viewState;
      // A delayed startup response must not undo clicks made while loading.
      if (!this.viewStateChanges.has('dismissed')) this.dismissed = view?.dismissed === true;
      if (!this.viewStateChanges.has('expandedNoteIds')) {
        this.expandedNoteIds = new Set(Array.isArray(view?.expandedNoteIds) ? view.expandedNoteIds : []);
      }
      this.viewStateLoaded = true;
      this.setSnapshot(snapshot);
      if (this.viewStateChanges.size) this.persistViewState();
    } catch (error) {
      console.error('Failed to load sticky notes:', error);
      this.render();
    }
  }

  persistViewState(field) {
    if (field) this.viewStateChanges.add(field);
    if (!this.ipc || !this.viewStateLoaded) return;
    this.ipc.invoke('sticky-notes-save-view', {
      dismissed: this.dismissed,
      expandedNoteIds: [...this.expandedNoteIds]
    }).then(result => {
      if (result?.success === false) console.error(result.error);
    }).catch(error => console.error('Failed to save sticky note view state:', error));
  }

  bindEvents() {
    this.addButton.addEventListener('click', () => this.openComposer());
    this.boardClose.addEventListener('click', () => {
      this.dismissed = true;
      this.persistViewState('dismissed');
      this.closeComposer();
    });
    this.reopenTab.addEventListener('click', () => {
      this.dismissed = false;
      this.persistViewState('dismissed');
      this.board.classList.remove('composing');
      this.form.classList.remove('visible');
      this.render();
    });
    this.formClose.addEventListener('click', () => this.closeComposer());
    this.form.addEventListener('submit', event => {
      event.preventDefault();
      this.createNote();
    });
    this.addItemButton.addEventListener('click', () => this.addItemEditorRow(null, true));
    this.naturalCreateButton?.addEventListener('click', () => this.createNaturalNote());
    this.naturalInput?.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.createNaturalNote();
      }
    });
    this.alarmToggle.addEventListener('click', () => {
      const active = this.alarmToggle.classList.toggle('active');
      this.alarmToggle.setAttribute('aria-pressed', String(active));
      this.alarmField.classList.toggle('visible', active);
      if (active && !this.alarmAt.value) {
        const date = new Date(Date.now() + 3600000);
        date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
        this.alarmAt.value = date.toISOString().slice(0, 16);
      }
    });
    this.itemsEditor.addEventListener('keydown', event => this.handleItemEditorKeydown(event));
    this.itemsEditor.addEventListener('click', event => {
      const removeButton = event.target.closest('button[data-action="remove-item-editor"]');
      if (removeButton) this.removeItemEditorRow(removeButton.closest('.sticky-item-editor-row'));
    });
    this.list.addEventListener('click', event => this.handleListClick(event));
    this.list.addEventListener('change', event => this.handleListChange(event));
  }

  applyLanguage() {
    const text = this.text();
    document.getElementById('sticky-form-title').textContent = text.formTitle;
    document.getElementById('sticky-subject-label').textContent = text.subject;
    document.getElementById('sticky-content-label').textContent = text.content;
    document.getElementById('sticky-color-label').textContent = text.color;
    document.getElementById('sticky-color-red').textContent = text.red;
    document.getElementById('sticky-color-amber').textContent = text.amber;
    document.getElementById('sticky-color-blue').textContent = text.blue;
    document.getElementById('sticky-save-button').textContent = text.save;
    document.getElementById('sticky-alarm-label').textContent = text.alarmLabel;
    this.applyComposerText();
    this.alarmToggle.title = text.alarm;
    this.subject.placeholder = text.subjectPlaceholder;
    if (this.naturalInput) this.naturalInput.placeholder = text.naturalPlaceholder;
    if (this.naturalCreateButton) this.naturalCreateButton.textContent = text.naturalCreate;
    this.addItemButton.textContent = `＋ ${text.addItem}`;
    for (const editor of this.itemsEditor.querySelectorAll('[data-role="item-editor"]')) {
      editor.dataset.placeholder = text.contentPlaceholder;
    }
    this.addButton.title = text.add;
    this.boardClose.title = text.closeBoard;
    this.reopenTab.title = text.reopen;
    this.reopenTab.setAttribute('aria-label', text.reopen);
    this.render();
  }

  setSnapshot(snapshot) {
    const priority = { red: 0, amber: 1, blue: 2 };
    const active = Array.isArray(snapshot && snapshot.active) ? [...snapshot.active] : [];
    active.sort((a, b) =>
      (priority[a.color] ?? priority.blue) - (priority[b.color] ?? priority.blue)
      || Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
    this.snapshot = {
      active
    };
    this.render();
  }

  highlightAlarmNotes(noteIds = []) {
    this.alarmHighlightIds = new Set(noteIds.map(String).filter(Boolean));
    if (!this.alarmHighlightIds.size) return;
    this.dismissed = false;
    this.render();
    requestAnimationFrame(() => {
      const firstId = [...this.alarmHighlightIds][0];
      const card = [...this.list.querySelectorAll('.sticky-note-card')]
        .find(candidate => candidate.dataset.id === firstId);
      card?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }

  clearAlarmHighlights() {
    if (!this.alarmHighlightIds.size) return;
    this.alarmHighlightIds.clear();
    this.render();
  }

  openComposer() {
    this.editingNoteId = null;
    this.dismissed = false;
    this.persistViewState('dismissed');
    this.reopenTab.classList.remove('visible');
    this.board.classList.add('visible', 'composing');
    this.form.classList.add('visible');
    this.form.reset();
    this.resetItemEditors();
    const normalColor = this.form.querySelector('input[name="sticky-color"][value="blue"]');
    if (normalColor) normalColor.checked = true;
    this.formError.textContent = '';
    this.alarmToggle.classList.remove('active');
    this.alarmToggle.setAttribute('aria-pressed', 'false');
    this.alarmField.classList.remove('visible');
    setTimeout(() => this.subject.focus(), 30);
    this.applyComposerText();
  }

  async createNaturalNote() {
    const text = this.text();
    const input = this.naturalInput?.value.trim() || '';
    if (!input) {
      this.formError.textContent = text.naturalRequired;
      this.naturalInput?.focus();
      return;
    }
    if (!this.ipc) {
      this.formError.textContent = text.naturalFailed;
      return;
    }
    this.naturalCreateButton.disabled = true;
    this.formError.textContent = '';
    try {
      const result = await this.ipc.invoke('natural-language-create', input);
      if (!result || result.success === false) {
        this.formError.textContent = result?.error || text.naturalFailed;
        return;
      }
      this.setSnapshot(result.snapshot);
      this.closeComposer();
    } catch (error) {
      this.formError.textContent = text.naturalFailed;
    } finally {
      this.naturalCreateButton.disabled = false;
    }
  }

  applyComposerText() {
    const text = this.text();
    document.getElementById('sticky-form-title').textContent = this.editingNoteId ? text.editFormTitle : text.formTitle;
    document.getElementById('sticky-save-button').textContent = this.editingNoteId ? text.update : text.save;
  }

  openEditor(noteId) {
    const note = this.snapshot.active.find(candidate => candidate.id === noteId);
    if (!note) return;
    this.openComposer();
    this.editingNoteId = note.id;
    this.subject.value = note.title || '';
    this.itemsEditor.replaceChildren();
    const items = Array.isArray(note.items) && note.items.length ? note.items : [{ text: '' }];
    for (const item of items) {
      const editor = this.addItemEditorRow();
      editor.textContent = item.text || '';
      editor.dataset.itemId = item.id || '';
      editor.dataset.completed = String(item.completed === true);
    }
    const color = this.form.querySelector(`input[name="sticky-color"][value="${note.color || 'blue'}"]`);
    if (color) color.checked = true;
    const futureAlarm = Number(note.alarmAt) > Date.now() ? Number(note.alarmAt) : null;
    this.alarmToggle.classList.toggle('active', !!futureAlarm);
    this.alarmToggle.setAttribute('aria-pressed', String(!!futureAlarm));
    this.alarmField.classList.toggle('visible', !!futureAlarm);
    this.alarmAt.value = futureAlarm ? this.toLocalDateTimeValue(futureAlarm) : '';
    this.applyComposerText();
    setTimeout(() => this.subject.focus(), 30);
  }

  toLocalDateTimeValue(timestamp) {
    const date = new Date(timestamp);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
  }

  resetItemEditors() {
    this.itemsEditor.replaceChildren();
    this.addItemEditorRow();
  }

  addItemEditorRow(afterRow = null, focus = false) {
    const row = document.createElement('div');
    row.className = 'sticky-item-editor-row';

    const bullet = document.createElement('span');
    bullet.className = 'sticky-item-editor-bullet';
    bullet.textContent = '•';
    bullet.setAttribute('aria-hidden', 'true');

    const editor = document.createElement('div');
    editor.className = 'sticky-item-rich-editor';
    editor.contentEditable = 'plaintext-only';
    editor.dataset.role = 'item-editor';
    editor.dataset.placeholder = this.text().contentPlaceholder;
    editor.setAttribute('role', 'textbox');
    editor.setAttribute('aria-label', this.text().contentPlaceholder);
    editor.setAttribute('spellcheck', 'true');

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'sticky-remove-item';
    remove.dataset.action = 'remove-item-editor';
    remove.textContent = '×';
    remove.title = this.text().removeItem;
    remove.setAttribute('aria-label', this.text().removeItem);

    row.append(bullet, editor, remove);
    if (afterRow && afterRow.parentElement === this.itemsEditor) {
      afterRow.insertAdjacentElement('afterend', row);
    } else {
      this.itemsEditor.appendChild(row);
    }

    if (focus) {
      setTimeout(() => editor.focus(), 0);
    }
    return editor;
  }

  removeItemEditorRow(row) {
    if (!row) return;
    const rows = [...this.itemsEditor.querySelectorAll('.sticky-item-editor-row')];
    if (rows.length <= 1) {
      const editor = row.querySelector('[data-role="item-editor"]');
      editor.replaceChildren();
      editor.focus();
      return;
    }
    const index = rows.indexOf(row);
    const nextFocus = rows[index - 1] || rows[index + 1];
    row.remove();
    nextFocus?.querySelector('[data-role="item-editor"]')?.focus();
  }

  handleItemEditorKeydown(event) {
    const editor = event.target.closest('[data-role="item-editor"]');
    if (!editor) return;
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.form.requestSubmit();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.addItemEditorRow(editor.closest('.sticky-item-editor-row'), true);
      return;
    }
    if (event.key === 'Backspace' && !editor.textContent && this.itemsEditor.children.length > 1) {
      event.preventDefault();
      this.removeItemEditorRow(editor.closest('.sticky-item-editor-row'));
    }
  }

  collectItems() {
    return [...this.itemsEditor.querySelectorAll('[data-role="item-editor"]')]
      .map(editor => ({
        id: editor.dataset.itemId || undefined,
        text: editor.textContent.trim(),
        completed: editor.dataset.completed === 'true'
      }))
      .filter(item => item.text);
  }

  closeComposer() {
    this.form.classList.remove('visible');
    this.board.classList.remove('composing');
    this.formError.textContent = '';
    this.editingNoteId = null;
    this.applyComposerText();
    this.render();
  }

  async createNote() {
    const text = this.text();
    const title = this.subject.value.trim();
    if (!title) {
      this.formError.textContent = text.required;
      this.subject.focus();
      return;
    }

    const selectedColor = this.form.querySelector('input[name="sticky-color"]:checked');
    const alarmAt = this.alarmToggle.classList.contains('active') && this.alarmAt.value
      ? new Date(this.alarmAt.value).getTime() : null;
    if (alarmAt && alarmAt <= Date.now()) {
      this.formError.textContent = text.alarmPast;
      this.alarmAt.focus();
      return;
    }
    const input = {
      title,
      items: this.collectItems(),
      color: selectedColor ? selectedColor.value : 'blue',
      alarmAt
    };

    if (!this.ipc) {
      const now = Date.now();
      if (this.editingNoteId) {
        const note = this.snapshot.active.find(candidate => candidate.id === this.editingNoteId);
        if (note) Object.assign(note, input, { updatedAt: now });
      } else {
        this.snapshot.active.unshift({ id: String(now), ...input, status: 'active', createdAt: now, updatedAt: now });
      }
      this.closeComposer();
      return;
    }

    try {
      const result = await this.ipc.invoke(
        this.editingNoteId ? 'sticky-notes-update' : 'sticky-notes-create',
        this.editingNoteId ? { id: this.editingNoteId, ...input } : input
      );
      if (!result || result.success === false) {
        this.formError.textContent = (result && result.error) || text.saveFailed;
        return;
      }
      this.setSnapshot(result.snapshot);
      this.closeComposer();
    } catch (error) {
      this.formError.textContent = text.saveFailed;
    }
  }

  handleListClick(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const card = button.closest('.sticky-note-card');
    if (!card) return;

    if (button.dataset.action === 'expand') {
      this.toggleCardExpansion(card);
      return;
    }

    if (button.dataset.action === 'request-delete-note') {
      card.classList.add('confirming-delete');
      card.querySelector('[data-action="confirm-delete-note"]')?.focus();
      return;
    }

    if (button.dataset.action === 'edit-note') {
      this.openEditor(card.dataset.id);
      return;
    }

    if (button.dataset.action === 'cancel-delete-note') {
      card.classList.remove('confirming-delete');
      card.querySelector('[data-action="request-delete-note"]')?.focus();
      return;
    }

    if (button.dataset.action === 'confirm-delete-note') {
      this.deleteNote(card.dataset.id, button);
    }
  }

  toggleCardExpansion(card) {
    const expanded = card.classList.toggle('expanded');
    if (expanded) this.expandedNoteIds.add(card.dataset.id);
    else this.expandedNoteIds.delete(card.dataset.id);
    this.persistViewState('expandedNoteIds');
    const button = card.querySelector('button[data-action="expand"]');
    if (button) {
      button.textContent = expanded ? '▲' : '▼';
      button.title = expanded ? this.text().collapse : this.text().expand;
      button.setAttribute('aria-label', button.title);
    }
    if (!expanded) card.classList.remove('confirming-delete');
  }

  async deleteNote(noteId, button) {
    button.disabled = true;

    if (!this.ipc) {
      this.expandedNoteIds.delete(noteId);
      this.snapshot.active = this.snapshot.active.filter(note => note.id !== noteId);
      this.render();
      return;
    }

    try {
      const result = await this.ipc.invoke('sticky-notes-complete', noteId);
      if (result && result.success !== false) {
        this.expandedNoteIds.delete(noteId);
        this.setSnapshot(result.snapshot);
      } else {
        button.disabled = false;
      }
    } catch (error) {
      button.disabled = false;
      console.error('Sticky note deletion failed:', error);
    }
  }

  async handleListChange(event) {
    const itemCheckbox = event.target.closest('input[data-action="toggle-item"]');
    if (itemCheckbox) {
      const completed = itemCheckbox.checked;
      itemCheckbox.disabled = true;

      if (!this.ipc) {
        const note = this.snapshot.active.find(candidate => candidate.id === itemCheckbox.dataset.noteId);
        const item = note?.items?.find(candidate => candidate.id === itemCheckbox.dataset.itemId);
        if (item) item.completed = completed;
        this.render();
        return;
      }

      try {
        const result = await this.ipc.invoke('sticky-notes-update-item', {
          noteId: itemCheckbox.dataset.noteId,
          itemId: itemCheckbox.dataset.itemId,
          completed
        });
        if (result && result.success !== false) {
          this.setSnapshot(result.snapshot);
        } else {
          itemCheckbox.disabled = false;
          itemCheckbox.checked = !completed;
        }
      } catch (error) {
        itemCheckbox.disabled = false;
        itemCheckbox.checked = !completed;
        console.error('Sticky note item update failed:', error);
      }
      return;
    }

  }

  render() {
    if (!this.list || !this.board) return;
    const text = this.text();
    const notes = this.snapshot.active;

    this.boardTitle.textContent = text.boardTitle;
    this.activeCount.textContent = notes.length;
    this.emptyText.textContent = text.empty;
    this.emptyState.classList.toggle('visible', notes.length === 0);
    this.reopenCount.textContent = notes.length;

    this.list.replaceChildren();
    for (const note of notes) {
      this.list.appendChild(this.createCard(note));
    }

    if (!this.dismissed && (notes.length > 0 || this.form.classList.contains('visible'))) {
      this.board.classList.add('visible');
    } else if (!this.form.classList.contains('visible')) {
      this.board.classList.remove('visible');
    }

    const showReopenTab = this.dismissed
      && notes.length > 0
      && !this.form.classList.contains('visible');
    this.reopenTab.classList.toggle('visible', showReopenTab);
  }

  createTrashIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('sticky-trash-icon');
    const paths = [
      'M3 6h18',
      'M8 6V4h8v2',
      'M19 6l-1 15H6L5 6',
      'M10 10v7',
      'M14 10v7'
    ];
    for (const d of paths) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      svg.appendChild(path);
    }
    return svg;
  }

  createCard(note) {
    const text = this.text();
    const card = document.createElement('article');
    card.className = `sticky-note-card color-${note.color || 'blue'}`;
    card.dataset.id = note.id;
    if (this.alarmHighlightIds.has(String(note.id))) card.classList.add('alarm-ringing');
    const isExpanded = this.expandedNoteIds.has(note.id);
    if (isExpanded) card.classList.add('expanded');

    const summary = document.createElement('div');
    summary.className = 'sticky-note-summary';

    const subject = document.createElement('div');
    subject.className = 'sticky-note-subject';
    subject.textContent = note.title;
    subject.title = note.title;
    summary.appendChild(subject);

    if (Number(note.alarmAt) > Date.now()) {
      const alarm = document.createElement('span');
      alarm.className = 'sticky-note-alarm';
      alarm.title = new Date(note.alarmAt).toLocaleString();
      alarm.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4 4 7M17 4l3 3M6 13a6 6 0 1 1 12 0c0 3 2 4 2 4H4s2-1 2-4Z"/><path d="M9 21h6M12 9v4l3 2"/></svg>';
      const label = document.createElement('span');
      label.textContent = new Date(note.alarmAt).toLocaleString([], { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' });
      alarm.appendChild(label);
      summary.appendChild(alarm);
    }

    const expand = document.createElement('button');
    expand.type = 'button';
    expand.className = 'sticky-expand-button';
    expand.dataset.action = 'expand';
    expand.textContent = isExpanded ? '▲' : '▼';
    expand.title = isExpanded ? text.collapse : text.expand;
    expand.setAttribute('aria-label', expand.title);
    summary.appendChild(expand);
    card.appendChild(summary);

    const expandedContent = document.createElement('div');
    expandedContent.className = 'sticky-note-content';

    const items = Array.isArray(note.items) && note.items.length
      ? note.items
      : (note.content ? [{ id: `${note.id}-legacy`, text: note.content, completed: false }] : []);
    if (items.length) {
      const itemList = document.createElement('div');
      itemList.className = 'sticky-note-item-list';
      for (const item of items) {
        const itemRow = document.createElement('div');
        itemRow.className = 'sticky-note-item-row';
        itemRow.classList.toggle('completed', item.completed === true);

        const itemCheck = document.createElement('input');
        itemCheck.type = 'checkbox';
        itemCheck.className = 'sticky-item-check';
        itemCheck.dataset.action = 'toggle-item';
        itemCheck.dataset.noteId = note.id;
        itemCheck.dataset.itemId = item.id;
        itemCheck.checked = item.completed === true;
        itemCheck.setAttribute('aria-label', text.completeItem);

        const itemText = document.createElement('span');
        itemText.className = 'sticky-note-item-text';
        itemText.textContent = item.text || (Array.isArray(item.runs)
          ? item.runs.map(run => run && run.text ? run.text : '').join('')
          : '');
        itemRow.append(itemCheck, itemText);
        itemList.appendChild(itemRow);
      }
      expandedContent.appendChild(itemList);
    }

    const footer = document.createElement('div');
    footer.className = 'sticky-note-footer';

    const deleteConfirm = document.createElement('div');
    deleteConfirm.className = 'sticky-delete-confirm';
    const confirmText = document.createElement('span');
    confirmText.textContent = text.deleteConfirm;
    const cancelDelete = document.createElement('button');
    cancelDelete.type = 'button';
    cancelDelete.dataset.action = 'cancel-delete-note';
    cancelDelete.className = 'sticky-delete-cancel';
    cancelDelete.textContent = text.cancel;
    const confirmDelete = document.createElement('button');
    confirmDelete.type = 'button';
    confirmDelete.dataset.action = 'confirm-delete-note';
    confirmDelete.className = 'sticky-delete-confirm-button';
    confirmDelete.textContent = text.deleteAction;
    deleteConfirm.append(confirmText, cancelDelete, confirmDelete);

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.dataset.action = 'request-delete-note';
    deleteButton.className = 'sticky-delete-note-button';
    deleteButton.title = text.deleteNote;
    deleteButton.setAttribute('aria-label', text.deleteNote);
    deleteButton.appendChild(this.createTrashIcon());

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.dataset.action = 'edit-note';
    editButton.className = 'sticky-edit-note-button';
    editButton.title = text.editNote;
    editButton.setAttribute('aria-label', text.editNote);
    editButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg>';

    footer.append(deleteConfirm, editButton, deleteButton);
    expandedContent.appendChild(footer);
    card.appendChild(expandedContent);

    return card;
  }
}
