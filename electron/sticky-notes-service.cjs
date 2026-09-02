const fs = require('fs');
const crypto = require('crypto');
const { ipcMain } = require('electron');
const { getStoragePath } = require('./storage-utils.cjs');

const ALLOWED_COLORS = ['red', 'amber', 'blue'];
const MAX_NOTES = 500;
const MAX_ITEMS_PER_NOTE = 50;
const MAX_ITEM_TEXT_LENGTH = 500;

function getNotesFilePath() {
  return getStoragePath('sticky-notes.json');
}

function sanitizeText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function getItemText(value) {
  if (!value || typeof value !== 'object') return String(value || '');
  if (typeof value.text === 'string') return value.text;
  // Migrate notes created while rich-text formatting was available into plain text.
  if (Array.isArray(value.runs)) {
    return value.runs.map(run => String((run && run.text) || '')).join('');
  }
  return '';
}

function normalizeItem(item) {
  const value = typeof item === 'string' ? { text: item } : item;
  if (!value || typeof value !== 'object') return null;
  const text = sanitizeText(getItemText(value), MAX_ITEM_TEXT_LENGTH);
  if (!text) return null;
  return {
    id: sanitizeText(value.id, 100) || crypto.randomUUID(),
    text,
    completed: value.completed === true
  };
}

function normalizeItems(items, legacyContent = '') {
  let source = Array.isArray(items) ? items : [];
  if (source.length === 0 && String(legacyContent || '').trim()) {
    source = String(legacyContent).split(/\r?\n/).filter(line => line.trim());
  }
  return source.map(normalizeItem).filter(Boolean).slice(0, MAX_ITEMS_PER_NOTE);
}

function itemsToPlainText(items) {
  return items
    .map(item => item.text)
    .join('\n')
    .slice(0, MAX_ITEMS_PER_NOTE * MAX_ITEM_TEXT_LENGTH);
}

function normalizeNote(note) {
  if (!note || typeof note !== 'object') return null;
  const title = sanitizeText(note.title, 80);
  if (!title) return null;
  const items = normalizeItems(note.items, note.content);
  return {
    id: sanitizeText(note.id, 100) || crypto.randomUUID(),
    title,
    content: itemsToPlainText(items),
    items,
    color: ALLOWED_COLORS.includes(note.color) ? note.color : 'blue',
    alarmAt: Number.isFinite(Number(note.alarmAt)) && Number(note.alarmAt) > Date.now() ? Number(note.alarmAt) : null,
    alarmTriggered: note.alarmTriggered === true,
    status: 'active',
    createdAt: Number.isFinite(note.createdAt) ? note.createdAt : Date.now(),
    updatedAt: Number.isFinite(note.updatedAt) ? note.updatedAt : Date.now()
  };
}

class StickyNotesService {
  constructor() {
    this.notes = this.load();
    // Completed notes from earlier builds are intentionally discarded.
    this.persist();
    this.setupIpc();
  }

  load() {
    try {
      const notesFile = getNotesFilePath();
      if (!fs.existsSync(notesFile)) return [];
      const parsed = JSON.parse(fs.readFileSync(notesFile, 'utf8'));
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(note => note && note.status !== 'archived')
        .map(normalizeNote)
        .filter(Boolean)
        .slice(0, MAX_NOTES);
    } catch (error) {
      console.error('Failed to load sticky notes:', error.message);
      return [];
    }
  }

  persist() {
    const notesFile = getNotesFilePath();
    fs.writeFileSync(notesFile, JSON.stringify(this.notes, null, 2), 'utf8');
  }

  getSnapshot() {
    const priority = { red: 0, amber: 1, blue: 2 };
    const byPriorityThenNewest = (a, b) =>
      (priority[a.color] ?? priority.blue) - (priority[b.color] ?? priority.blue)
      || b.updatedAt - a.updatedAt;
    return {
      active: [...this.notes].sort(byPriorityThenNewest)
    };
  }

  create(input = {}) {
    const title = sanitizeText(input.title, 80);
    if (!title) {
      return { success: false, error: '請輸入便利貼主旨' };
    }

    const now = Date.now();
    const items = normalizeItems(input.items, input.content);
    const note = {
      id: crypto.randomUUID(),
      title,
      content: itemsToPlainText(items),
      items,
      color: ALLOWED_COLORS.includes(input.color) ? input.color : 'blue',
      alarmAt: Number.isFinite(Number(input.alarmAt)) && Number(input.alarmAt) > now ? Number(input.alarmAt) : null,
      alarmTriggered: false,
      status: 'active',
      createdAt: now,
      updatedAt: now
    };

    this.notes.unshift(note);
    if (this.notes.length > MAX_NOTES) {
      this.notes.splice(this.notes.length - 1, 1);
    }
    this.persist();
    return { success: true, note, snapshot: this.getSnapshot() };
  }

  update(id, input = {}) {
    const note = this.notes.find(item => item.id === id);
    if (!note) return { success: false, error: '找不到便利貼' };
    const title = sanitizeText(input.title, 80);
    if (!title) return { success: false, error: '請輸入便利貼主旨' };
    const now = Date.now();
    note.title = title;
    note.items = normalizeItems(input.items, input.content);
    note.content = itemsToPlainText(note.items);
    note.color = ALLOWED_COLORS.includes(input.color) ? input.color : 'blue';
    note.alarmAt = Number.isFinite(Number(input.alarmAt)) && Number(input.alarmAt) > now ? Number(input.alarmAt) : null;
    note.alarmTriggered = false;
    note.updatedAt = now;
    this.persist();
    return { success: true, note, snapshot: this.getSnapshot() };
  }

  complete(id) {
    const index = this.notes.findIndex(item => item.id === id);
    if (index < 0) return { success: false, error: '找不到便利貼' };
    this.notes.splice(index, 1);
    this.persist();
    return { success: true, snapshot: this.getSnapshot() };
  }

  updateItem(noteId, itemId, completed) {
    const note = this.notes.find(item => item.id === noteId);
    if (!note) return { success: false, error: '找不到便利貼' };
    const item = Array.isArray(note.items)
      ? note.items.find(candidate => candidate.id === itemId)
      : null;
    if (!item) return { success: false, error: '找不到便利貼事項' };
    item.completed = completed === true;
    note.updatedAt = Date.now();
    this.persist();
    return { success: true, note, snapshot: this.getSnapshot() };
  }

  getDueAlarms(now = Date.now()) {
    const due = this.notes.filter(note => note.alarmAt && !note.alarmTriggered && note.alarmAt <= now);
    const alarms = due.map(note => ({ id: note.id, title: note.title, alarmAt: note.alarmAt }));
    if (due.length) {
      for (const note of due) {
        note.alarmTriggered = true;
        note.alarmAt = null;
        note.updatedAt = now;
      }
      this.persist();
    }
    return alarms;
  }

  setupIpc() {
    ipcMain.handle('sticky-notes-list', () => this.getSnapshot());
    ipcMain.handle('sticky-notes-create', (event, input) => this.create(input));
    ipcMain.handle('sticky-notes-update', (event, input = {}) => this.update(String(input.id || ''), input));
    ipcMain.handle('sticky-notes-complete', (event, id) => this.complete(String(id || '')));
    ipcMain.handle('sticky-notes-update-item', (event, input = {}) => this.updateItem(
      String(input.noteId || ''),
      String(input.itemId || ''),
      input.completed === true
    ));
  }
}

module.exports = {
  StickyNotesService,
  ALLOWED_COLORS,
  MAX_ITEMS_PER_NOTE,
  normalizeNote,
  normalizeItem,
  normalizeItems,
  sanitizeText
};
