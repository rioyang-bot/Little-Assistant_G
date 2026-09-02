const fs = require('fs');
const https = require('https');
const http = require('http');
const { ipcMain } = require('electron');
const { locales } = require('./locales.cjs');
const { ZH_JOKES, ZH_FACTS, EN_JOKES, EN_FACTS } = require('./trivia-data.cjs');
const { getStoragePath } = require('./storage-utils.cjs');

function getConfigFilePath() {
  return getStoragePath('trivia-config.json');
}

function getLegacySharedConfigPath() {
  return getStoragePath('email-config.json');
}

// Strict Content Safety Filter Keywords (Excludes erotic, NSFW, violent, vulgar, political content)
const BLOCKED_PATTERNS = [
  /性愛|色情|成人|情色|做愛|裸體|性器官|陰莖|陰道|胸部|高潮|自慰|嫖娼|一夜情|偷情|出軌/i,
  /porn|nsfw|sex|nude|erotic|boob|vagina|penis|orgasm|masturbat|prostitut/i,
  /暴力|血腥|殺人|自殺|砍人|毒品|槍枝|恐怖主義/i,
  /髒話|幹你|三小|白痴|靠北|操你|bitch|fuck|shit|asshole/i,
  /中共|民進黨|國民黨|政治選舉|統獨|習近平|蔡英文/i
];

function hasChinese(text) {
  return typeof text === 'string' && /[\u4e00-\u9fa5]/.test(text);
}

function isPredominantlyChinese(text) {
  if (!text || typeof text !== 'string') return false;
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const latinChars = (text.match(/[a-zA-Z]/g) || []).length;
  return chineseChars > 0 && (chineseChars >= latinChars * 0.3 || latinChars < 10);
}

function isContentSafe(text) {
  if (!text || typeof text !== 'string') return false;
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(text)) return false;
  }
  return true;
}

// Google Translate free API for Traditional Chinese conversion with timeout
function translateToZhTW(text) {
  return new Promise((resolve) => {
    if (!text || typeof text !== 'string') return resolve(text);
    const cleanText = text.trim();
    if (!cleanText) return resolve(cleanText);
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-TW&dt=t&q=${encodeURIComponent(cleanText)}`;
    
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 3500 }, (res) => {
      if (res.statusCode !== 200) {
        return resolve(cleanText);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed && Array.isArray(parsed[0])) {
            const translated = parsed[0].map(item => item[0]).join('').trim();
            if (translated && translated.length > 0 && hasChinese(translated)) {
              return resolve(translated);
            }
          }
        } catch (e) {}
        resolve(cleanText);
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(cleanText);
    });

    req.on('error', () => resolve(cleanText));
  });
}

// Simple HTTP/HTTPS GET Helper with timeout
function fetchJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'User-Agent': 'LittleAssistant-TriviaBot/1.0 (Desktop Assistant; clean safe trivia)',
        'Accept': 'application/json',
        ...(options.headers || {})
      },
      timeout: options.timeout || 4500
    };

    const req = client.request(reqOptions, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.end();
  });
}

class TriviaService {
  constructor(mainWindowGetter, onConfigUpdated) {
    this.getMainWindow = mainWindowGetter;
    this.onConfigUpdated = onConfigUpdated;
    this.config = this.loadConfig();
    this.pollTimer = null;
    this.recentHistory = new Set();
    this.isFetching = false;

    this.setupIpc();
    this.startScheduler();
  }

  getLocale() {
    const lang = this.config.language || 'zh-TW';
    return locales[lang] || locales['zh-TW'];
  }

  loadConfig() {
    try {
      const configFile = getConfigFilePath();
      let parsed = null;

      if (fs.existsSync(configFile)) {
        parsed = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      } else {
        // Versions before 1.0 stored trivia settings inside email-config.json.
        // Migrate them once, then keep the two services in separate files so
        // simultaneous saves cannot overwrite each other's settings.
        const legacyConfigFile = getLegacySharedConfigPath();
        if (fs.existsSync(legacyConfigFile)) {
          const legacy = JSON.parse(fs.readFileSync(legacyConfigFile, 'utf8'));
          if (legacy.trivia || legacy.language) {
            parsed = {
              language: legacy.language || 'zh-TW',
              trivia: legacy.trivia || {}
            };
            fs.writeFileSync(configFile, JSON.stringify(parsed, null, 2), 'utf8');
          }
        }
      }

      if (parsed) {
        return {
          language: parsed.language || 'zh-TW',
          trivia: {
            enabled: true,
            intervalMinutes: 60,
            category: 'all', // 'all' | 'fact' | 'joke'
            soundEnabled: true,
            ...(parsed.trivia || {})
          }
        };
      }
    } catch (e) {
      console.warn('Could not read trivia config:', e.message);
    }
    return {
      language: 'zh-TW',
      trivia: {
        enabled: true,
        intervalMinutes: 60,
        category: 'all',
        soundEnabled: true
      }
    };
  }

  saveConfig(newConfig = {}) {
    try {
      const configFile = getConfigFilePath();
      let fullConfig = {};
      if (fs.existsSync(configFile)) {
        try {
          fullConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        } catch (e) {}
      }

      if (newConfig.trivia) {
        this.config.trivia = { ...this.config.trivia, ...newConfig.trivia };
        fullConfig.trivia = this.config.trivia;
      }
      if (newConfig.language) {
        this.config.language = newConfig.language;
        fullConfig.language = newConfig.language;
      }

      fs.writeFileSync(configFile, JSON.stringify(fullConfig, null, 2), 'utf8');
      this.startScheduler();
      if (this.onConfigUpdated) this.onConfigUpdated(this.config);
      return { success: true };
    } catch (e) {
      console.error('Failed to save trivia config:', e.message);
      return { success: false, error: e.message };
    }
  }

  startScheduler() {
    this.stopScheduler();
    const triviaCfg = this.config.trivia || {};
    if (triviaCfg.enabled === false) {
      console.log('🛑 Trivia Service is disabled.');
      return;
    }

    const intervalMin = Math.max(10, parseInt(triviaCfg.intervalMinutes, 10) || 60);
    const intervalMs = intervalMin * 60 * 1000;
    console.log(`💡 Trivia Scheduler started (every ${intervalMin} minutes, language: ${this.config.language || 'zh-TW'}).`);

    this.pollTimer = setInterval(() => {
      this.fetchAndTrigger(false);
    }, intervalMs);
  }

  stopScheduler() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  getRandomCuratedItem(pool) {
    if (!Array.isArray(pool) || pool.length === 0) return null;
    const unvisited = pool.filter(item => !this.recentHistory.has(item.id));
    const choices = unvisited.length > 0 ? unvisited : pool;
    const selected = choices[Math.floor(Math.random() * choices.length)];
    if (selected) {
      this.rememberItem(selected.id);
    }
    return selected;
  }

  // Purely dynamic fetching adapting to active language (zh-TW or en)
  async fetchRandomOnlineTrivia(preferredCategory = 'all') {
    let mode = preferredCategory;
    if (mode === 'all') {
      mode = Math.random() > 0.5 ? 'fact' : 'joke';
    }

    const isZh = (this.config.language || 'zh-TW') === 'zh-TW';

    if (mode === 'fact') {
      return await this.fetchOnlineFact(isZh);
    } else {
      return await this.fetchOnlineJoke(isZh);
    }
  }

  async fetchOnlineFact(isZh) {
    // 1. Try Chinese / English Wikipedia Random Interesting Knowledge
    try {
      const endpoint = isZh
        ? 'https://zh.wikipedia.org/api/rest_v1/page/random/summary'
        : 'https://en.wikipedia.org/api/rest_v1/page/random/summary';
      
      const res = await fetchJson(endpoint, { timeout: 4000 });
      if (res && res.title && res.extract && res.extract.length >= 20) {
        let title = res.title;
        let summary = res.extract;

        if (isZh) {
          title = await translateToZhTW(title);
          summary = await translateToZhTW(summary);
        }

        // Keep to concise 2-3 sentences max
        if (summary.length > 180) {
          summary = summary.substring(0, 175) + '...';
        }

        const candidate = {
          id: 'wiki-' + res.pageid,
          type: 'fact',
          categoryLabel: isZh ? '🔬 科普小百科' : '🔬 Science & World Fact',
          title: isZh ? `你知道「${title}」嗎？` : `Did you know about "${title}"?`,
          content: summary,
          source: 'Wikipedia'
        };

        const isValidLanguage = isZh ? isPredominantlyChinese(summary) : true;
        if (isValidLanguage && isContentSafe(candidate.title + ' ' + candidate.content) && !this.recentHistory.has(candidate.id)) {
          this.rememberItem(candidate.id);
          return candidate;
        }
      }
    } catch (e) {
      // Continue to next online endpoint
    }

    // 2. Try Open Trivia / Usable online Fact endpoints
    try {
      const res = await fetchJson('https://uselessfacts.jsph.pl/api/v2/facts/random?language=en', { timeout: 3500 });
      if (res && res.text) {
        let contentText = res.text;
        if (isZh) {
          contentText = await translateToZhTW(contentText);
        }

        const candidate = {
          id: 'fact-' + (res.id || Math.random().toString(36)),
          type: 'fact',
          categoryLabel: isZh ? '🌱 生活奇妙冷知識' : '🌱 Daily Life Trivia',
          title: isZh ? '💡 趣味生活小知識' : '💡 Fun Fact of the Moment',
          content: contentText,
          source: 'OpenFact'
        };

        const isValidLanguage = isZh ? isPredominantlyChinese(contentText) : true;
        if (isValidLanguage && isContentSafe(candidate.content) && !this.recentHistory.has(candidate.id)) {
          this.rememberItem(candidate.id);
          return candidate;
        }
      }
    } catch (e) {}

    // 3. High-Quality Bilingual Curated Fallback
    const pool = isZh ? ZH_FACTS : EN_FACTS;
    const fallbackItem = this.getRandomCuratedItem(pool);
    if (fallbackItem) {
      return {
        ...fallbackItem,
        type: 'fact'
      };
    }

    return null;
  }

  async fetchOnlineJoke(isZh) {
    // If in Chinese mode, mix high-quality authentic Traditional Chinese jokes with verified translated jokes
    if (isZh) {
      // 50% of the time, directly serve authentic Traditional Chinese curated jokes (best comedic punch)
      if (Math.random() < 0.6) {
        const curatedJoke = this.getRandomCuratedItem(ZH_JOKES);
        if (curatedJoke) {
          return {
            ...curatedJoke,
            type: 'joke',
            content: curatedJoke.setup || curatedJoke.content
          };
        }
      }
    }

    // 1. Try Safe Joke API with strict safe-mode and flags
    try {
      const url = 'https://v2.jokeapi.dev/joke/Any?blacklistFlags=nsfw,religious,political,racist,sexist,explicit&safe-mode';
      const res = await fetchJson(url, { timeout: 4000 });
      if (res && !res.error) {
        let setup = '';
        let delivery = '';
        if (res.type === 'twopart') {
          setup = res.setup;
          delivery = res.delivery;
        } else {
          setup = res.joke;
        }

        if (isZh) {
          setup = await translateToZhTW(setup);
          if (delivery) {
            delivery = await translateToZhTW(delivery);
          }
        }

        const isChineseValid = isZh ? (isPredominantlyChinese(setup) && (!delivery || isPredominantlyChinese(delivery))) : true;
        const fullText = setup + (delivery ? '\n' + delivery : '');

        if (isChineseValid && isContentSafe(fullText)) {
          const candidate = {
            id: 'joke-' + (res.id || Math.random().toString(36)),
            type: 'joke',
            categoryLabel: isZh ? '😄 職場放鬆冷笑話' : '😄 Clean Humor & Joke',
            title: isZh ? '🎭 今日份開心笑話' : '🎭 Joke of the Day',
            setup: setup,
            punchline: delivery || '',
            content: setup,
            source: 'SafeJokeAPI'
          };

          if (!this.recentHistory.has(candidate.id)) {
            this.rememberItem(candidate.id);
            return candidate;
          }
        }
      }
    } catch (e) {}

    // 2. Try Official Clean Dad Joke Endpoint
    try {
      const res = await fetchJson('https://icanhazdadjoke.com/', {
        headers: { 'Accept': 'application/json' },
        timeout: 4000
      });
      if (res && res.joke) {
        let jokeContent = res.joke;
        if (isZh) {
          jokeContent = await translateToZhTW(jokeContent);
        }

        const isChineseValid = isZh ? isPredominantlyChinese(jokeContent) : true;
        if (isChineseValid && isContentSafe(jokeContent)) {
          const candidate = {
            id: 'dadjoke-' + res.id,
            type: 'joke',
            categoryLabel: isZh ? '😄 輕鬆幽默時間' : '😄 Daily Smile',
            title: isZh ? '☕ 職場摸魚笑一笑' : '☕ Quick Giggle',
            setup: jokeContent,
            punchline: '',
            content: jokeContent,
            source: 'DadJoke'
          };

          if (!this.recentHistory.has(candidate.id)) {
            this.rememberItem(candidate.id);
            return candidate;
          }
        }
      }
    } catch (e) {}

    // 3. Fallback to Curated Pool (Guarantees Chinese content in zh-TW mode!)
    const pool = isZh ? ZH_JOKES : EN_JOKES;
    const fallbackItem = this.getRandomCuratedItem(pool);
    if (fallbackItem) {
      return {
        ...fallbackItem,
        type: 'joke',
        content: fallbackItem.setup || fallbackItem.content
      };
    }

    return null;
  }

  rememberItem(id) {
    if (!id) return;
    this.recentHistory.add(id);
    if (this.recentHistory.size > 100) {
      const first = this.recentHistory.values().next().value;
      this.recentHistory.delete(first);
    }
  }

  async fetchAndTrigger(isManual = false) {
    if (this.isFetching) return;
    this.isFetching = true;

    try {
      const triviaCfg = this.config.trivia || {};
      const category = triviaCfg.category || 'all';
      const item = await this.fetchRandomOnlineTrivia(category);

      if (!item) {
        console.log('🌐 Trivia fetch returned empty. Skipping trigger.');
        if (isManual) {
          const win = this.getMainWindow();
          if (win && !win.isDestroyed()) {
            win.webContents.send('trivia-fetch-failed', {
              message: (this.config.language === 'en')
                ? 'Could not fetch trivia/joke at this moment.'
                : '目前無法獲取冷知識與笑話，請稍後再試喔 🌐'
            });
          }
        }
        return;
      }

      const win = this.getMainWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send('trivia-reminder', {
          ...item,
          soundEnabled: triviaCfg.soundEnabled !== false,
          isManual: isManual
        });
        console.log(`💡 [Trivia] Sent online ${item.type}: "${item.title}" (${this.config.language})`);
      }
    } catch (e) {
      console.warn('Error in fetchAndTrigger:', e.message);
    } finally {
      this.isFetching = false;
    }
  }

  setupIpc() {
    if (!ipcMain || !ipcMain.handle) return;

    ipcMain.handle('trivia-get-config', () => {
      return this.config.trivia || {};
    });

    ipcMain.handle('trivia-save-config', (event, newTriviaConfig) => {
      this.saveConfig({ trivia: newTriviaConfig });
      return { success: true, trivia: this.config.trivia };
    });

    ipcMain.handle('trivia-fetch-now', async (event, category = 'all') => {
      const item = await this.fetchRandomOnlineTrivia(category);
      return { success: !!item, data: item };
    });

    ipcMain.handle('trivia-test-reminder', async (event, options = {}) => {
      await this.fetchAndTrigger(true);
      return { success: true };
    });
  }
}

module.exports = { TriviaService, hasChinese, isPredominantlyChinese, isContentSafe, translateToZhTW };
