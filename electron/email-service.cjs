const fs = require('fs');
const { ipcMain, safeStorage } = require('electron');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const { locales } = require('./locales.cjs');
const { getStoragePath } = require('./storage-utils.cjs');

function getConfigFilePath() {
  return getStoragePath('email-config.json');
}

const EMAIL_STICKY_CATEGORIES = ['primary', 'purchases', 'social', 'updates', 'promotions', 'forums'];

function normalizeStickyCategories(value) {
  if (!Array.isArray(value)) return [...EMAIL_STICKY_CATEGORIES];
  return [...new Set(value.filter(category => EMAIL_STICKY_CATEGORIES.includes(category)))];
}

function isGmailAccount(account = {}) {
  return account.provider === 'gmail' || /(^|\.)gmail\.com$/i.test(String(account.host || '')) || /@gmail\.com$/i.test(String(account.user || ''));
}

function normalizeLabelList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(label => String(label || '').trim()).filter(Boolean))].slice(0, 300);
}

function encryptSecret(plaintext) {
  if (!plaintext) return '';
  try {
    if (safeStorage && safeStorage.isEncryptionAvailable()) {
      return safeStorage.encryptString(plaintext).toString('base64');
    }
  } catch (e) {
    console.error('safeStorage encryption error:', e.message);
  }
  // Fallback encoding if OS keychain is unavailable
  return Buffer.from(plaintext, 'utf8').toString('base64');
}

function decryptSecret(cipherBase64) {
  if (!cipherBase64) return '';
  try {
    const buffer = Buffer.from(cipherBase64, 'base64');
    if (safeStorage && safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(buffer);
    }
    return buffer.toString('utf8');
  } catch (e) {
    try {
      return Buffer.from(cipherBase64, 'base64').toString('utf8');
    } catch (err) {
      return '';
    }
  }
}

const DEFAULT_CONFIG = {
  language: 'zh-TW', // 'zh-TW' | 'en'
  enabled: false,
  accounts: [
    {
      id: 'acc-1',
      name: '主要信箱 (Gmail)',
      enabled: true,
      assistantReminder: true,
      importToSticky: false,
      stickyCategories: [...EMAIL_STICKY_CATEGORIES],
      availableCustomLabels: [],
      stickyCustomLabels: [],
      includeArchivedLabeled: false,
      provider: 'gmail', // 'gmail' | 'outlook' | 'custom'
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
      user: '',
      pass: ''
    }
  ],
  rules: {
    maxAgeHours: 2, // 僅檢查過去 N 小時內之未讀郵件
    checkIntervalMinutes: 5, // 每 N 分鐘檢查一次
    soundEnabled: true,
    repeatNotification: false,
    stickyUnreadOnly: true,
    stickyMaxItems: 8
  },
  health: {
    enabled: true,
    intervalMinutes: 45,
    soundEnabled: true
  },
  notifiedIds: []
};

class EmailService {
  constructor(mainWindowGetter, onConfigUpdated) {
    this.getMainWindow = mainWindowGetter;
    this.onConfigUpdated = onConfigUpdated;
    this.config = this.loadConfig();
    this.pollTimer = null;
    this.initialCheckTimer = null;
    this.isChecking = false;

    this.setupIpc();
  }

  getLocale() {
    const lang = this.config.language || 'zh-TW';
    return locales[lang] || locales['zh-TW'];
  }

  persistConfigToDisk() {
    try {
      const configFile = getConfigFilePath();
      const diskAccounts = (this.config.accounts || []).map(acc => {
        const accCopy = { ...acc };
        if (accCopy.pass) {
          accCopy.passEncrypted = encryptSecret(accCopy.pass);
        } else if (accCopy.passEncrypted) {
          accCopy.passEncrypted = accCopy.passEncrypted;
        }
        delete accCopy.pass; // Never persist plaintext password to disk
        return accCopy;
      });

      let existing = {};
      if (fs.existsSync(configFile)) {
        try {
          existing = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        } catch (e) {}
      }

      const diskConfig = {
        ...existing,
        ...this.config,
        accounts: diskAccounts
      };
      fs.writeFileSync(configFile, JSON.stringify(diskConfig, null, 2), 'utf8');
    } catch (e) {
      console.error('Failed to persist email config to disk:', e.message);
    }
  }

  loadConfig() {
    try {
      const configFile = getConfigFilePath();
      if (fs.existsSync(configFile)) {
        const data = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        let accounts = [];
        let hasPlaintextLegacy = false;

        if (Array.isArray(data.accounts) && data.accounts.length > 0) {
          accounts = data.accounts.map((acc, idx) => {
            const rawPass = (acc.pass || '').trim();
            let resolvedPass = '';
            if (acc.passEncrypted) {
              resolvedPass = decryptSecret(acc.passEncrypted);
            } else if (rawPass) {
              resolvedPass = rawPass;
              hasPlaintextLegacy = true;
            }

            return {
              id: acc.id || `acc-${Date.now()}-${idx}`,
              name: (acc.name || `信箱 ${idx + 1}`).trim(),
              enabled: acc.enabled !== false,
              assistantReminder: acc.assistantReminder !== false,
              importToSticky: acc.importToSticky === true,
              stickyCategories: normalizeStickyCategories(acc.stickyCategories),
              availableCustomLabels: normalizeLabelList(acc.availableCustomLabels),
              stickyCustomLabels: normalizeLabelList(acc.stickyCustomLabels),
              includeArchivedLabeled: acc.includeArchivedLabeled === true,
              provider: acc.provider || 'gmail',
              host: (acc.host || 'imap.gmail.com').trim(),
              port: parseInt(acc.port, 10) || 993,
              secure: acc.secure !== false,
              user: (acc.user || '').trim(),
              pass: resolvedPass
            };
          });
        } else if (data.account && typeof data.account === 'object') {
          // Backward compatibility: migrate legacy single account structure
          const rawPass = (data.account.pass || '').trim();
          let resolvedPass = '';
          if (data.account.passEncrypted) {
            resolvedPass = decryptSecret(data.account.passEncrypted);
          } else if (rawPass) {
            resolvedPass = rawPass;
            hasPlaintextLegacy = true;
          }

          accounts = [
            {
              id: 'acc-1',
              name: '主要信箱',
              enabled: true,
              assistantReminder: true,
              importToSticky: false,
              stickyCategories: [...EMAIL_STICKY_CATEGORIES],
              availableCustomLabels: [],
              stickyCustomLabels: [],
              includeArchivedLabeled: false,
              provider: data.account.provider || 'gmail',
              host: (data.account.host || 'imap.gmail.com').trim(),
              port: parseInt(data.account.port, 10) || 993,
              secure: data.account.secure !== false,
              user: (data.account.user || '').trim(),
              pass: resolvedPass
            }
          ];
        } else {
          accounts = JSON.parse(JSON.stringify(DEFAULT_CONFIG.accounts));
        }

        const loadedConfig = {
          ...DEFAULT_CONFIG,
          ...data,
          language: data.language || DEFAULT_CONFIG.language,
          accounts,
          rules: { ...DEFAULT_CONFIG.rules, ...(data.rules || {}) },
          health: { ...DEFAULT_CONFIG.health, ...(data.health || {}) },
          notifiedIds: Array.isArray(data.notifiedIds) ? data.notifiedIds : []
        };

        if (hasPlaintextLegacy) {
          this.config = loadedConfig;
          this.persistConfigToDisk();
        }

        return loadedConfig;
      }
    } catch (e) {
      console.error('Failed to load email config:', e.message);
    }
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }

  saveConfig(newConfig) {
    try {
      let updatedAccounts = this.config.accounts;
      if (Array.isArray(newConfig.accounts)) {
        updatedAccounts = newConfig.accounts.map((acc, idx) => {
          let passVal = (acc.pass || '').trim();
          if (!passVal && acc.id) {
            const existing = (this.config.accounts || []).find(a => a.id === acc.id);
            if (existing && existing.pass) passVal = existing.pass;
          }

          return {
            id: acc.id || `acc-${Date.now()}-${idx}`,
            name: (acc.name || `信箱 ${idx + 1}`).trim(),
            enabled: acc.enabled !== false,
            assistantReminder: acc.assistantReminder !== false,
            importToSticky: acc.importToSticky === true,
            stickyCategories: normalizeStickyCategories(acc.stickyCategories),
            availableCustomLabels: normalizeLabelList(acc.availableCustomLabels),
            stickyCustomLabels: normalizeLabelList(acc.stickyCustomLabels),
            includeArchivedLabeled: acc.includeArchivedLabeled === true,
            provider: acc.provider || 'gmail',
            host: (acc.host || 'imap.gmail.com').trim(),
            port: parseInt(acc.port, 10) || 993,
            secure: acc.secure !== false,
            user: (acc.user || '').trim(),
            pass: passVal
          };
        });
      }

      this.config = {
        ...this.config,
        ...newConfig,
        language: newConfig.language || this.config.language || 'zh-TW',
        accounts: updatedAccounts,
        rules: { ...this.config.rules, ...(newConfig.rules || {}) },
        health: { ...this.config.health, ...(newConfig.health || {}) }
      };

      this.persistConfigToDisk();

      // Restart polling with new interval/enabled status
      this.restartPolling();

      if (typeof this.onConfigUpdated === 'function') {
        this.onConfigUpdated(this.config);
      }

      const mainWindow = typeof this.getMainWindow === 'function' ? this.getMainWindow() : null;
      const hasStickySource = (this.config.accounts || []).some(account => account.enabled !== false && account.importToSticky === true);
      if (!hasStickySource && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('email-sticky-updated', { enabled: false, emails: [] });
      }

      const intervalMin = Math.max(1, parseFloat(this.config.rules.checkIntervalMinutes) || 5);
      const loc = this.getLocale();
      return { 
        success: true, 
        config: this.config,
        intervalMinutes: intervalMin,
        message: loc.service.saveSuccess(intervalMin)
      };
    } catch (e) {
      console.error('Failed to save email config:', e.message);
      return { success: false, error: '儲存設定失敗，請確認檔案存取權限。' };
    }
  }

  createClient(accountConfig) {
    const acc = { ...(accountConfig || (this.config.accounts && this.config.accounts[0]) || {}) };
    acc.user = (acc.user || '').trim();
    acc.pass = (acc.pass || '').trim();
    acc.host = (acc.host || '').trim();
    acc.port = parseInt(acc.port, 10) || 993;

    // Auto-clean spaces in Gmail 16-character app passwords (e.g. "abcd efgh ijkl mnop" -> "abcdefghijklmnop")
    if (acc.host.includes('gmail.com') || (acc.user && acc.user.includes('@gmail.com'))) {
      acc.pass = acc.pass.replace(/\s+/g, '');
    }

    return new ImapFlow({
      host: acc.host,
      port: acc.port,
      secure: acc.secure !== false,
      auth: {
        user: acc.user,
        pass: acc.pass
      },
      logger: false,
      tls: {
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2'
      },
      emitLogs: false
    });
  }

  async testConnection(testAccount) {
    const loc = this.getLocale();
    const acc = { ...(testAccount || (this.config.accounts && this.config.accounts[0]) || {}) };
    acc.user = (acc.user || '').trim();
    acc.pass = (acc.pass || '').trim();
    acc.host = (acc.host || '').trim();
    acc.port = parseInt(acc.port, 10) || 993;

    if (!acc.user || !acc.pass || !acc.host) {
      return { success: false, error: loc.service.missingFields, accountName: acc.name || acc.user };
    }

    const client = this.createClient(acc);
    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');
      try {
        const status = client.mailbox;
        return {
          success: true,
          accountName: acc.name || acc.user,
          message: loc.service.testSuccess(status.exists || 0)
        };
      } finally {
        lock.release();
      }
    } catch (err) {
      let rawMsg = err.message || '';
      let friendlyMsg = rawMsg;

      if (rawMsg.includes('Invalid credentials') || rawMsg.includes('AUTHENTICATIONFAILED') || rawMsg.includes('authentication failed') || rawMsg.includes('Application-specific password required')) {
        friendlyMsg = loc.service.authError;
      } else if (rawMsg.includes('ETIMEDOUT') || rawMsg.includes('ENOTFOUND') || rawMsg.includes('ECONNREFUSED')) {
        friendlyMsg = loc.service.connError(acc.host, acc.port);
      } else if (rawMsg.includes('CERT') || rawMsg.includes('certificate') || rawMsg.includes('UNABLE_TO_VERIFY')) {
        friendlyMsg = 'TLS 安全憑證驗證失敗，伺服器可能不安全。';
      }

      return { success: false, error: friendlyMsg, accountName: acc.name || acc.user };
    } finally {
      try {
        await client.logout();
      } catch (e) { }
    }
  }

  async testAllConnections(accountsList) {
    const loc = this.getLocale();
    const accountsToTest = Array.isArray(accountsList) && accountsList.length > 0
      ? accountsList.filter(a => a.enabled)
      : (this.config.accounts || []).filter(a => a.enabled);

    if (!accountsToTest.length) {
      return { success: false, error: loc.service.noActiveAccounts };
    }

    const results = [];
    for (const acc of accountsToTest) {
      const res = await this.testConnection(acc);
      results.push({
        id: acc.id,
        name: acc.name || acc.user,
        user: acc.user,
        success: res.success,
        message: res.message,
        error: res.error
      });
    }

    const passedCount = results.filter(r => r.success).length;
    const allPassed = passedCount === results.length;

    return {
      success: allPassed,
      results,
      passedCount,
      totalCount: results.length,
      message: loc.service.testAllSuccess(passedCount, results.length)
    };
  }

  async listGmailLabels(accountConfig) {
    const account = { ...(accountConfig || {}) };
    if (!isGmailAccount(account)) {
      return { success: false, error: '此功能僅支援 Gmail 帳號。' };
    }
    if (!account.user || !account.pass || !account.host) {
      return { success: false, error: this.getLocale().service.missingFields };
    }

    const client = this.createClient(account);
    try {
      await client.connect();
      const mailboxes = await client.list();
      const categoryNames = new Set(['primary', 'personal', 'purchases', 'social', 'updates', 'promotions', 'forums']);
      const labels = (mailboxes || [])
        .filter(box => {
          const path = String(box.path || '').trim();
          const name = String(box.name || '').trim().toLowerCase();
          if (!path || /^inbox$/i.test(path) || box.specialUse) return false;
          if (/^\[(gmail|googlemail|google mail)\]/i.test(path)) return false;
          if (box.flags && box.flags.has('\\Noselect')) return false;
          return !categoryNames.has(name);
        })
        .map(box => ({ path: String(box.path), name: String(box.path) }))
        .sort((a, b) => a.name.localeCompare(b.name, this.config.language === 'en' ? 'en' : 'zh-Hant'));
      return { success: true, labels };
    } catch (err) {
      return { success: false, error: `無法讀取 Gmail 標籤：${err.message}` };
    } finally {
      try { await client.logout(); } catch (e) {}
    }
  }

  async checkSingleAccount(account, rules) {
    const client = this.createClient(account);
    const newEmails = [];
    const unreadEmails = [];
    const stickyEmails = [];

    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');

      try {
        const maxAgeHours = Math.max(0.1, parseFloat(rules.maxAgeHours) || 2);
        const cutoffTime = Date.now() - maxAgeHours * 3600 * 1000;
        const cutoffDate = new Date(cutoffTime);

        const includeReadForSticky = account.importToSticky === true && rules.stickyUnreadOnly === false;
        const searchCriteria = includeReadForSticky ? { since: cutoffDate } : { seen: false, since: cutoffDate };

        const searchResults = await client.search(searchCriteria, { uid: true });
        const gmailCategoryByUid = new Map();
        if (account.importToSticky === true && isGmailAccount(account)) {
          const gmailQueries = [
            ['purchases', 'purchases'],
            ['social', 'social'],
            ['promotions', 'promotions'],
            ['updates', 'updates'],
            ['forums', 'forums'],
            ['primary', 'primary']
          ];
          try {
            for (const [category, queryName] of gmailQueries) {
              const categoryUids = await client.search({ since: cutoffDate, gmraw: `category:${queryName}` }, { uid: true });
              for (const categoryUid of categoryUids || []) {
                // Purchases is checked first. When Gmail also treats the message as
                // Updates, keep the more specific shopping classification.
                if (!gmailCategoryByUid.has(categoryUid)) gmailCategoryByUid.set(categoryUid, category);
              }
            }
          } catch (categoryErr) {
            console.warn(`Gmail category lookup unavailable for ${account.user}:`, categoryErr.message);
            gmailCategoryByUid.clear();
          }
        }

        if (Array.isArray(searchResults) && searchResults.length > 0) {
          for (const uid of searchResults) {
            try {
              const msg = await client.fetchOne(uid, {
                envelope: true,
                internalDate: true,
                flags: true,
                labels: true,
                source: account.importToSticky === true
              }, { uid: true });

              if (msg && msg.envelope) {
                const date = msg.envelope.date || msg.internalDate || new Date();
                const msgTime = new Date(date).getTime();

                if (msgTime < cutoffTime) continue;

                const rawMsgId = msg.envelope.messageId || `uid-${uid}-${msgTime}`;
                const dedupeKey = `${account.id || account.user}:${rawMsgId}`;
                const fromObj = (msg.envelope.from && msg.envelope.from[0]) || {};
                const fromName = fromObj.name || fromObj.address || '';
                const fromAddress = fromObj.address || '';
                const subject = msg.envelope.subject || '';
                const category = isGmailAccount(account) ? (gmailCategoryByUid.get(uid) || 'primary') : 'all';
                const gmailLabels = msg.labels ? [...msg.labels].map(label => String(label)) : [];
                const isUnread = !(msg.flags && typeof msg.flags.has === 'function' && msg.flags.has('\\Seen'));
                let preview = '';
                if (account.importToSticky === true && msg.source) {
                  try {
                    const parsed = await simpleParser(msg.source);
                    const plainText = parsed.text || String(parsed.html || '').replace(/<[^>]*>/g, ' ');
                    preview = String(plainText || '').replace(/\s+/g, ' ').trim().slice(0, 240);
                  } catch (parseErr) {}
                }

                const emailItem = {
                  uid,
                  messageId: rawMsgId,
                  dedupeKey,
                  accountId: account.id,
                  accountName: account.name || account.user,
                  accountUser: account.user,
                  fromName,
                  fromAddress,
                  subject,
                  date,
                  isUnread,
                  preview,
                  category,
                  gmailLabels
                };

                stickyEmails.push(emailItem);
                if (isUnread) unreadEmails.push(emailItem);

                if (isUnread && !this.config.notifiedIds.includes(dedupeKey) && !this.config.notifiedIds.includes(rawMsgId)) {
                  newEmails.push(emailItem);
                  this.config.notifiedIds.push(dedupeKey);
                }
              }
            } catch (fetchErr) {
              console.error(`Error fetching message details:`, fetchErr.message);
            }
          }
        }
      } finally {
        lock.release();
      }

      const selectedCustomLabels = normalizeLabelList(account.stickyCustomLabels);
      if (account.importToSticky === true && account.includeArchivedLabeled === true && selectedCustomLabels.length > 0 && isGmailAccount(account)) {
        try {
          const mailboxes = await client.list();
          const allMail = (mailboxes || []).find(box => box.specialUse === '\\All');
          if (allMail && allMail.path) {
            const allMailLock = await client.getMailboxLock(allMail.path);
            try {
              const archivedUids = new Set();
              for (const label of selectedCustomLabels) {
                const labelUids = await client.search({ since: new Date(Date.now() - (Math.max(0.1, parseFloat(rules.maxAgeHours) || 2) * 3600 * 1000)), labels: { has: [label] } }, { uid: true });
                for (const labelUid of labelUids || []) archivedUids.add(labelUid);
              }

              const existingKeys = new Set(stickyEmails.map(email => email.dedupeKey));
              for (const uid of archivedUids) {
                try {
                  const msg = await client.fetchOne(uid, {
                    envelope: true,
                    internalDate: true,
                    flags: true,
                    labels: true,
                    source: true
                  }, { uid: true });
                  if (!msg || !msg.envelope) continue;
                  const date = msg.envelope.date || msg.internalDate || new Date();
                  const msgTime = new Date(date).getTime();
                  const cutoffTime = Date.now() - (Math.max(0.1, parseFloat(rules.maxAgeHours) || 2) * 3600 * 1000);
                  if (msgTime < cutoffTime) continue;
                  const rawMsgId = msg.envelope.messageId || `allmail-uid-${uid}-${msgTime}`;
                  const dedupeKey = `${account.id || account.user}:${rawMsgId}`;
                  if (existingKeys.has(dedupeKey)) continue;
                  const fromObj = (msg.envelope.from && msg.envelope.from[0]) || {};
                  let preview = '';
                  if (msg.source) {
                    try {
                      const parsed = await simpleParser(msg.source);
                      const plainText = parsed.text || String(parsed.html || '').replace(/<[^>]*>/g, ' ');
                      preview = String(plainText || '').replace(/\s+/g, ' ').trim().slice(0, 240);
                    } catch (parseErr) {}
                  }
                  const gmailLabels = msg.labels ? [...msg.labels].map(label => String(label)) : [];
                  stickyEmails.push({
                    uid,
                    messageId: rawMsgId,
                    dedupeKey,
                    accountId: account.id,
                    accountName: account.name || account.user,
                    accountUser: account.user,
                    fromName: fromObj.name || fromObj.address || '',
                    fromAddress: fromObj.address || '',
                    subject: msg.envelope.subject || '',
                    date,
                    isUnread: !(msg.flags && typeof msg.flags.has === 'function' && msg.flags.has('\\Seen')),
                    preview,
                    category: 'primary',
                    gmailLabels
                  });
                  existingKeys.add(dedupeKey);
                } catch (fetchErr) {
                  console.error('Error fetching archived Gmail label message:', fetchErr.message);
                }
              }
            } finally {
              allMailLock.release();
            }
          }
        } catch (archiveErr) {
          console.warn(`Archived Gmail label lookup unavailable for ${account.user}:`, archiveErr.message);
        }
      }

      return { success: true, newEmails, unreadEmails, stickyEmails };
    } catch (err) {
      console.error(`Email check error on account (${account.user}):`, err.message);
      return { success: false, error: err.message, newEmails: [], unreadEmails: [], stickyEmails: [] };
    } finally {
      try {
        await client.logout();
      } catch (e) { }
    }
  }

  async checkEmails(triggerType = 'poll', customConfig = null) {
    const loc = this.getLocale();
    if (this.isChecking) return { success: false, error: loc.service.checkingWait };

    const targetConfig = customConfig || this.config;
    const rules = { ...(targetConfig.rules || this.config.rules) };
    const accounts = Array.isArray(targetConfig.accounts) ? targetConfig.accounts : (this.config.accounts || []);
    const activeAccounts = accounts.filter(a => a.enabled && a.user && a.pass && a.host && (
      triggerType === 'manual' ||
      (targetConfig.enabled !== false && a.assistantReminder !== false) ||
      a.importToSticky === true
    ));

    if (!activeAccounts.length) {
      return { success: false, reason: 'unconfigured', error: loc.service.noActiveAccounts };
    }

    if (!targetConfig.enabled && triggerType === 'poll' && !activeAccounts.some(a => a.importToSticky === true)) {
      return { success: false, reason: 'disabled', error: loc.service.disabled };
    }

    this.isChecking = true;

    try {
      // Concurrently check all active accounts
      const checkPromises = activeAccounts.map(acc => this.checkSingleAccount(acc, rules));
      const settledResults = await Promise.allSettled(checkPromises);

      let allNewEmails = [];
      let allUnreadEmails = [];
      let allStickyEmails = [];

      for (const res of settledResults) {
        if (res.status === 'fulfilled' && res.value && res.value.success) {
          allNewEmails.push(...(res.value.newEmails || []));
          allUnreadEmails.push(...(res.value.unreadEmails || []));
          allStickyEmails.push(...(res.value.stickyEmails || []));
        }
      }

      // Sort by date (newest first)
      allNewEmails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      allUnreadEmails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      allStickyEmails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      // Limit stored notified IDs size to recent 300 items
      if (this.config.notifiedIds.length > 300) {
        this.config.notifiedIds = this.config.notifiedIds.slice(-300);
      }

      // Persist notified IDs securely
      this.persistConfigToDisk();

      const mainWindow = this.getMainWindow();
      const stickyAccounts = activeAccounts.filter(a => a.importToSticky === true);
      const stickyAccountIds = new Set(stickyAccounts.map(a => a.id));
      const stickyCategoryMap = new Map(stickyAccounts.map(account => [account.id, normalizeStickyCategories(account.stickyCategories)]));
      const stickyCustomLabelMap = new Map(stickyAccounts.map(account => [account.id, normalizeLabelList(account.stickyCustomLabels)]));
      const stickyMaxItems = Math.max(1, Math.min(30, Number(rules.stickyMaxItems) || 8));
      const stickyEmails = allStickyEmails
        .filter(email => {
          if (!stickyAccountIds.has(email.accountId) || (rules.stickyUnreadOnly !== false && !email.isUnread)) return false;
          if (email.category === 'all') return true;
          const categoryMatched = (stickyCategoryMap.get(email.accountId) || EMAIL_STICKY_CATEGORIES).includes(email.category || 'primary');
          const selectedLabels = stickyCustomLabelMap.get(email.accountId) || [];
          const labelMatched = (email.gmailLabels || []).some(label => selectedLabels.includes(String(label)));
          return categoryMatched || labelMatched;
        })
        .map(email => ({
          ...email,
          matchedCustomLabels: (email.gmailLabels || []).filter(label =>
            (stickyCustomLabelMap.get(email.accountId) || []).includes(String(label)))
        }))
        .slice(0, stickyMaxItems);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('email-sticky-updated', {
          enabled: stickyAccountIds.size > 0,
          unreadOnly: rules.stickyUnreadOnly !== false,
          emails: stickyEmails
        });
      }

      const reminderAccountIds = new Set(activeAccounts.filter(a => a.assistantReminder !== false).map(a => a.id));
      const reminderNewEmails = allNewEmails.filter(email => reminderAccountIds.has(email.accountId));
      const reminderUnreadEmails = allUnreadEmails.filter(email => reminderAccountIds.has(email.accountId));
      const shouldRepeat = !!rules.repeatNotification || triggerType === 'manual';
      let isRepeatedNotification = false;

      if (reminderNewEmails.length > 0) {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('new-email-received', {
            latest: reminderNewEmails[0],
            count: reminderUnreadEmails.length,
            newCount: reminderNewEmails.length,
            emails: reminderUnreadEmails,
            soundEnabled: rules.soundEnabled !== false,
            isRepeated: false
          });
        }
      } else if (shouldRepeat && reminderUnreadEmails.length > 0) {
        isRepeatedNotification = true;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('new-email-received', {
            latest: reminderUnreadEmails[0],
            count: reminderUnreadEmails.length,
            newCount: 0,
            emails: reminderUnreadEmails,
            soundEnabled: rules.soundEnabled !== false,
            isRepeated: true
          });
        }
      }

      return {
        success: true,
        foundCount: allNewEmails.length || allUnreadEmails.length,
        newCount: allNewEmails.length,
        unreadCount: allUnreadEmails.length,
        isRepeated: isRepeatedNotification,
        newEmails: allNewEmails,
        unreadEmails: allUnreadEmails
      };
    } catch (err) {
      console.error('Email check all accounts error:', err.message);
      return { success: false, error: '檢查郵件時發生未預期錯誤' };
    } finally {
      this.isChecking = false;
    }
  }

  startPolling() {
    this.stopPolling();
    if (!this.hasPollingSource()) return;

    const intervalMin = Math.max(1, parseFloat(this.config.rules.checkIntervalMinutes) || 5);
    const intervalMs = intervalMin * 60 * 1000;

    console.log(`📧 Email polling started for ${this.config.accounts?.length || 1} accounts. Interval: ${intervalMin} min, Max Age: ${this.config.rules.maxAgeHours} hrs.`);

    // Run initial check after 5 seconds
    this.initialCheckTimer = setTimeout(() => {
      this.initialCheckTimer = null;
      this.checkEmails('poll');
    }, 5000);

    this.pollTimer = setInterval(() => {
      this.checkEmails('poll');
    }, intervalMs);
  }

  stopPolling() {
    if (this.initialCheckTimer) {
      clearTimeout(this.initialCheckTimer);
      this.initialCheckTimer = null;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    console.log('🛑 Email polling stopped.');
  }

  restartPolling() {
    this.stopPolling();
    if (this.hasPollingSource()) {
      this.startPolling();
    }
  }

  hasPollingSource() {
    return (this.config.accounts || []).some(account =>
      account.enabled !== false && account.user && account.pass && account.host && (
        (this.config.enabled !== false && account.assistantReminder !== false) || account.importToSticky === true
      ));
  }

  setupIpc() {
    if (!ipcMain) return;

    ipcMain.handle('email-get-config', () => {
      return this.config;
    });

    ipcMain.handle('email-save-config', (event, newConfig) => {
      return this.saveConfig(newConfig);
    });

    ipcMain.handle('email-test-connection', async (event, testAccount) => {
      return await this.testConnection(testAccount);
    });

    ipcMain.handle('email-test-all', async (event, accountsList) => {
      return await this.testAllConnections(accountsList);
    });

    ipcMain.handle('email-list-labels', async (event, account) => {
      return await this.listGmailLabels(account);
    });

    ipcMain.handle('email-check-now', async (event, customConfig) => {
      return await this.checkEmails('manual', customConfig);
    });
  }
}

module.exports = { EmailService, EMAIL_STICKY_CATEGORIES, normalizeStickyCategories, normalizeLabelList, isGmailAccount };
