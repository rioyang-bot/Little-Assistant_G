const assert = require('node:assert/strict');
const test = require('node:test');
const { EmailService, normalizeStickyCategories, normalizeLabelList, isGmailAccount } = require('../electron/email-service.cjs');

function serviceWith(config, sent = []) {
  const service = Object.create(EmailService.prototype);
  service.config = config;
  service.isChecking = false;
  service.persistConfigToDisk = () => {};
  service.getMainWindow = () => ({
    isDestroyed: () => false,
    webContents: { send: (channel, payload) => sent.push({ channel, payload }) }
  });
  return service;
}

test('email sticky notes keep polling when assistant email reminders are disabled', () => {
  const service = serviceWith({
    enabled: false,
    accounts: [{ enabled: true, user: 'user@example.test', pass: 'secret', host: 'imap.example.test', assistantReminder: false, importToSticky: true }]
  });
  assert.equal(service.hasPollingSource(), true);
});

test('legacy Gmail accounts default to every supported sticky category', () => {
  assert.deepEqual(normalizeStickyCategories(undefined), ['primary', 'purchases', 'social', 'updates', 'promotions', 'forums']);
  assert.equal(isGmailAccount({ host: 'imap.gmail.com' }), true);
  assert.equal(isGmailAccount({ provider: 'custom', host: 'imap.example.test' }), false);
  assert.deepEqual(normalizeLabelList(['客戶', ' 客戶 ', '', '採購']), ['客戶', '採購']);
});

test('Gmail label sync returns custom labels and excludes system mailboxes', async () => {
  const service = serviceWith({ language: 'zh-TW' });
  service.createClient = () => ({
    connect: async () => {},
    list: async () => [
      { path: 'INBOX', name: 'INBOX', flags: new Set() },
      { path: '[Gmail]/寄件備份', name: '寄件備份', specialUse: '\\Sent', flags: new Set() },
      { path: '客戶/重要', name: '重要', flags: new Set() },
      { path: '專案A', name: '專案A', flags: new Set() }
    ],
    logout: async () => {}
  });
  const result = await service.listGmailLabels({ provider: 'gmail', host: 'imap.gmail.com', user: 'user@gmail.com', pass: 'secret' });
  assert.equal(result.success, true);
  assert.deepEqual(result.labels.map(label => label.path), ['客戶/重要', '專案A']);
});

test('email polling stops when no account uses reminders or sticky notes', () => {
  const service = serviceWith({
    enabled: false,
    accounts: [{ enabled: true, user: 'user@example.test', pass: 'secret', host: 'imap.example.test', assistantReminder: false, importToSticky: false }]
  });
  assert.equal(service.hasPollingSource(), false);
});

test('sticky-only email accounts update the panel without assistant dialogue', async () => {
  const sent = [];
  const now = new Date();
  const email = { accountId: 'acc-1', subject: '測試郵件', date: now, isUnread: true };
  const service = serviceWith({
    language: 'zh-TW',
    enabled: false,
    notifiedIds: [],
    rules: { stickyUnreadOnly: true, stickyMaxItems: 8, repeatNotification: false },
    accounts: [{ id: 'acc-1', enabled: true, user: 'user@example.test', pass: 'secret', host: 'imap.example.test', assistantReminder: false, importToSticky: true }]
  }, sent);
  service.checkSingleAccount = async () => ({ success: true, newEmails: [email], unreadEmails: [email], stickyEmails: [email] });

  const result = await service.checkEmails('poll');
  assert.equal(result.success, true);
  assert.equal(sent.some(item => item.channel === 'email-sticky-updated'), true);
  assert.equal(sent.some(item => item.channel === 'new-email-received'), false);
});

test('email sticky list respects unread filtering and maximum count', async () => {
  const sent = [];
  const service = serviceWith({
    language: 'zh-TW',
    enabled: false,
    notifiedIds: [],
    rules: { stickyUnreadOnly: true, stickyMaxItems: 1, repeatNotification: false },
    accounts: [{ id: 'acc-1', enabled: true, user: 'user@example.test', pass: 'secret', host: 'imap.example.test', assistantReminder: false, importToSticky: true }]
  }, sent);
  service.checkSingleAccount = async () => ({
    success: true,
    newEmails: [],
    unreadEmails: [],
    stickyEmails: [
      { accountId: 'acc-1', subject: '未讀', date: new Date(2), isUnread: true },
      { accountId: 'acc-1', subject: '已讀', date: new Date(1), isUnread: false }
    ]
  });

  await service.checkEmails('poll');
  const update = sent.find(item => item.channel === 'email-sticky-updated');
  assert.equal(update.payload.emails.length, 1);
  assert.equal(update.payload.emails[0].subject, '未讀');
});

test('each Gmail account filters sticky emails by its selected categories', async () => {
  const sent = [];
  const service = serviceWith({
    language: 'zh-TW',
    enabled: false,
    notifiedIds: [],
    rules: { stickyUnreadOnly: false, stickyMaxItems: 8, repeatNotification: false },
    accounts: [{
      id: 'acc-1', enabled: true, provider: 'gmail', user: 'user@gmail.com', pass: 'secret', host: 'imap.gmail.com',
      assistantReminder: false, importToSticky: true, stickyCategories: ['social']
    }]
  }, sent);
  service.checkSingleAccount = async () => ({
    success: true,
    newEmails: [],
    unreadEmails: [],
    stickyEmails: [
      { accountId: 'acc-1', subject: '社群', date: new Date(2), isUnread: true, category: 'social' },
      { accountId: 'acc-1', subject: '促銷', date: new Date(1), isUnread: true, category: 'promotions' }
    ]
  });

  await service.checkEmails('poll');
  const update = sent.find(item => item.channel === 'email-sticky-updated');
  assert.deepEqual(update.payload.emails.map(email => email.subject), ['社群']);
});

test('selected custom Gmail labels include matching mail even when its category is unchecked', async () => {
  const sent = [];
  const service = serviceWith({
    language: 'zh-TW', enabled: false, notifiedIds: [],
    rules: { stickyUnreadOnly: false, stickyMaxItems: 8, repeatNotification: false },
    accounts: [{
      id: 'acc-1', enabled: true, provider: 'gmail', user: 'user@gmail.com', pass: 'secret', host: 'imap.gmail.com',
      assistantReminder: false, importToSticky: true, stickyCategories: [], stickyCustomLabels: ['客戶']
    }]
  }, sent);
  service.checkSingleAccount = async () => ({
    success: true, newEmails: [], unreadEmails: [],
    stickyEmails: [
      { accountId: 'acc-1', subject: '已標籤', date: new Date(2), isUnread: true, category: 'promotions', gmailLabels: ['客戶'] },
      { accountId: 'acc-1', subject: '無標籤', date: new Date(1), isUnread: true, category: 'promotions', gmailLabels: [] }
    ]
  });
  await service.checkEmails('poll');
  const update = sent.find(item => item.channel === 'email-sticky-updated');
  assert.deepEqual(update.payload.emails.map(email => email.subject), ['已標籤']);
  assert.deepEqual(update.payload.emails[0].matchedCustomLabels, ['客戶']);
});
