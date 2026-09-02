const assert = require('node:assert/strict');
const test = require('node:test');
const { EventEmitter } = require('node:events');
const https = require('https');
const { hasChinese, translateToZhTW } = require('../electron/trivia-service.cjs');

function withMockedTranslationResponse(responseBody, callback) {
  const originalGet = https.get;
  https.get = (url, options, onResponse) => {
    const request = new EventEmitter();
    request.destroy = () => {};

    process.nextTick(() => {
      const response = new EventEmitter();
      response.statusCode = 200;
      onResponse(response);
      response.emit('data', responseBody);
      response.emit('end');
    });

    return request;
  };

  return Promise.resolve()
    .then(callback)
    .finally(() => {
      https.get = originalGet;
    });
}

test('translateToZhTW parses a Traditional Chinese translation', async () => {
  const apiResponse = JSON.stringify([[['為什麼演員要說「斷一條腿」？因為每齣戲都有演員陣容。', 'Why?']]]);
  const translated = await withMockedTranslationResponse(apiResponse, () =>
    translateToZhTW('Why do actors say break a leg?')
  );

  assert.notEqual(translated, 'Why do actors say break a leg?');
  assert.equal(hasChinese(translated), true);
  assert.match(translated, /演員/);
});

test('translateToZhTW safely falls back when the response is invalid', async () => {
  const original = 'Honey does not spoil.';
  const translated = await withMockedTranslationResponse('{invalid-json', () =>
    translateToZhTW(original)
  );

  assert.equal(translated, original);
});
