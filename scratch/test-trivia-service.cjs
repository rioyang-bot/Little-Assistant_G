const assert = require('node:assert/strict');
const test = require('node:test');
const { TriviaService, isContentSafe } = require('../electron/trivia-service.cjs');

function createIsolatedService(overrides = {}) {
  const service = Object.create(TriviaService.prototype);
  service.config = {
    language: 'zh-TW',
    trivia: { enabled: true, category: 'fact', soundEnabled: true }
  };
  service.pollTimer = null;
  service.recentHistory = new Set();
  service.isFetching = false;
  Object.assign(service, overrides);
  return service;
}

test('content filter accepts normal facts and blocks unsafe categories', () => {
  assert.equal(isContentSafe('地球大氣層中含量最多的氣體是氮氣。'), true);
  assert.equal(isContentSafe('這是一段含有情色與成人內容的文本。'), false);
  assert.equal(isContentSafe('Some nsfw nude explicit content.'), false);
  assert.equal(isContentSafe('暴力與槍枝走私內容。'), false);
});

test('manual trivia dispatch sends the expected IPC payload', async () => {
  const sentMessages = [];
  const item = {
    id: 'test-fact-1',
    type: 'fact',
    title: '測試標題',
    content: '這是一則安全的測試冷知識。'
  };
  const mockWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (channel, data) => sentMessages.push({ channel, data })
    }
  };
  const service = createIsolatedService({
    getMainWindow: () => mockWindow,
    fetchRandomOnlineTrivia: async () => item
  });

  await service.fetchAndTrigger(true);

  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].channel, 'trivia-reminder');
  assert.equal(sentMessages[0].data.id, item.id);
  assert.equal(sentMessages[0].data.soundEnabled, true);
  assert.equal(sentMessages[0].data.isManual, true);
  assert.equal(service.isFetching, false);
});

test('manual fetch failure emits trivia-fetch-failed', async () => {
  const sentMessages = [];
  const mockWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (channel, data) => sentMessages.push({ channel, data })
    }
  };
  const service = createIsolatedService({
    getMainWindow: () => mockWindow,
    fetchRandomOnlineTrivia: async () => null
  });

  await service.fetchAndTrigger(true);

  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].channel, 'trivia-fetch-failed');
  assert.match(sentMessages[0].data.message, /無法獲取/);
});
