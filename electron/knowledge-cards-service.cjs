const fs = require('fs');
const crypto = require('crypto');
const { getStoragePath } = require('./storage-utils.cjs');

const ALLOWED_INTERVALS = [10, 20, 30, 40, 50, 60];
const MAX_TITLE_LENGTH = 60;
const MAX_CONTENT_LENGTH = 500;

function normalizeText(value, maxLength) {
  return String(value || '').replace(/\r\n?/g, '\n').trim().slice(0, maxLength);
}

function normalizeCard(input = {}, existing = null, now = Date.now()) {
  const title = normalizeText(input.title, MAX_TITLE_LENGTH);
  const content = normalizeText(input.content, MAX_CONTENT_LENGTH);
  if (!title || !content) return null;
  return {
    id: String(input.id || existing?.id || crypto.randomUUID()),
    title,
    content,
    enabled: input.enabled !== false,
    createdAt: Number(existing?.createdAt || input.createdAt) || now,
    updatedAt: now
  };
}

class KnowledgeCardsService {
  constructor(options = {}) {
    this.getWindow = options.getWindow || (() => null);
    this.isBlocked = options.isBlocked || (() => false);
    this.storagePath = options.storagePath || getStoragePath('knowledge-cards.json');
    this.random = options.random || Math.random;
    this.setTimeoutFn = options.setTimeoutFn || setTimeout;
    this.clearTimeoutFn = options.clearTimeoutFn || clearTimeout;
    this.timer = null;
    this.config = this.loadConfig();
    this.startScheduler();
  }

  loadConfig() {
    let stored = {};
    try {
      if (fs.existsSync(this.storagePath)) stored = JSON.parse(fs.readFileSync(this.storagePath, 'utf8'));
    } catch (error) {
      console.warn('Could not read knowledge cards:', error.message);
    }
    const cards = [];
    const seenIds = new Set();
    for (const input of Array.isArray(stored.cards) ? stored.cards : []) {
      const card = normalizeCard(input, input, Number(input.updatedAt) || Date.now());
      if (!card || seenIds.has(card.id)) continue;
      seenIds.add(card.id);
      cards.push(card);
    }
    const interval = Number(stored.intervalMinutes);
    const enabledIds = new Set(cards.filter(card => card.enabled).map(card => card.id));
    return {
      enabled: stored.enabled === true,
      intervalMinutes: ALLOWED_INTERVALS.includes(interval) ? interval : 20,
      cards,
      remainingCardIds: [...new Set(Array.isArray(stored.remainingCardIds) ? stored.remainingCardIds.map(String) : [])]
        .filter(id => enabledIds.has(id))
    };
  }

  getConfig() {
    return JSON.parse(JSON.stringify(this.config));
  }

  saveConfig(input = {}) {
    try {
      const existingById = new Map(this.config.cards.map(card => [card.id, card]));
      const cards = [];
      const seenIds = new Set();
      for (const item of Array.isArray(input.cards) ? input.cards : this.config.cards) {
        const existing = item?.id ? existingById.get(String(item.id)) : null;
        const card = normalizeCard(item, existing);
        if (!card || seenIds.has(card.id)) continue;
        seenIds.add(card.id);
        cards.push(card);
      }
      const requestedInterval = Number(input.intervalMinutes ?? this.config.intervalMinutes);
      const enabledIds = new Set(cards.filter(card => card.enabled).map(card => card.id));
      this.config = {
        enabled: input.enabled === undefined ? this.config.enabled : input.enabled === true,
        intervalMinutes: ALLOWED_INTERVALS.includes(requestedInterval) ? requestedInterval : 20,
        cards,
        remainingCardIds: this.config.remainingCardIds.filter(id => enabledIds.has(id))
      };
      this.persist();
      this.startScheduler();
      return { success: true, config: this.getConfig() };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  addCard(input = {}) {
    const card = normalizeCard(input);
    if (!card) return { success: false, error: 'Title and content are required.' };
    const result = this.saveConfig({ cards: [...this.config.cards, card] });
    if (!result.success) return result;
    return {
      ...result,
      card: result.config.cards.find(item => item.id === card.id) || card
    };
  }

  persist() {
    fs.writeFileSync(this.storagePath, JSON.stringify(this.config, null, 2), 'utf8');
  }

  shuffle(ids) {
    const result = [...ids];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  selectCard(consume = true) {
    const enabledCards = this.config.cards.filter(card => card.enabled);
    if (!enabledCards.length) return null;
    if (!consume) return enabledCards[Math.floor(this.random() * enabledCards.length)];
    const enabledIds = new Set(enabledCards.map(card => card.id));
    this.config.remainingCardIds = this.config.remainingCardIds.filter(id => enabledIds.has(id));
    if (!this.config.remainingCardIds.length) {
      this.config.remainingCardIds = this.shuffle(enabledCards.map(card => card.id));
    }
    const selectedId = this.config.remainingCardIds.shift();
    this.persist();
    return enabledCards.find(card => card.id === selectedId) || null;
  }

  trigger(manual = false) {
    if (!manual && this.isBlocked()) return { success: false, code: 'blocked' };
    const win = this.getWindow();
    if (!win || win.isDestroyed()) return { success: false, code: 'unavailable' };
    const card = this.selectCard(!manual);
    if (!card) return { success: false, code: 'empty' };
    win.webContents.send('knowledge-card-reminder', {
      id: card.id,
      title: card.title,
      content: card.content,
      isManual: manual
    });
    return { success: true, card };
  }

  scheduleNext(delayMs) {
    this.timer = this.setTimeoutFn(() => {
      this.timer = null;
      const result = this.trigger(false);
      if (this.config.enabled && this.config.cards.some(card => card.enabled)) {
        this.scheduleNext(result.code === 'blocked' ? 60000 : this.config.intervalMinutes * 60000);
      }
    }, delayMs);
  }

  startScheduler() {
    this.stopScheduler();
    if (!this.config.enabled || !this.config.cards.some(card => card.enabled)) return;
    this.scheduleNext(this.config.intervalMinutes * 60000);
  }

  stopScheduler() {
    if (this.timer) this.clearTimeoutFn(this.timer);
    this.timer = null;
  }
}

module.exports = {
  KnowledgeCardsService,
  normalizeCard,
  ALLOWED_INTERVALS,
  MAX_TITLE_LENGTH,
  MAX_CONTENT_LENGTH
};
