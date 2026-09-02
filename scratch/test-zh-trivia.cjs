const assert = require('node:assert/strict');
const test = require('node:test');
const { TriviaService, isPredominantlyChinese } = require('../electron/trivia-service.cjs');
const { ZH_JOKES, ZH_FACTS, EN_JOKES, EN_FACTS } = require('../electron/trivia-data.cjs');

function createPoolService(language) {
  const service = Object.create(TriviaService.prototype);
  service.config = { language, trivia: {} };
  service.recentHistory = new Set();
  return service;
}

test('Traditional Chinese curated facts contain Chinese content', () => {
  assert.ok(ZH_FACTS.length > 0);
  for (const fact of ZH_FACTS) {
    assert.ok(fact.id);
    assert.ok(fact.content);
    assert.equal(isPredominantlyChinese(fact.content), true, `Invalid zh-TW fact: ${fact.id}`);
  }
});

test('Traditional Chinese curated jokes contain Chinese setup and punchline', () => {
  assert.ok(ZH_JOKES.length > 0);
  for (const joke of ZH_JOKES) {
    const content = `${joke.setup || joke.content || ''} ${joke.punchline || ''}`;
    assert.ok(joke.id);
    assert.equal(isPredominantlyChinese(content), true, `Invalid zh-TW joke: ${joke.id}`);
  }
});

test('English pools contain usable content', () => {
  assert.ok(EN_FACTS.length > 0);
  assert.ok(EN_JOKES.length > 0);
  for (const item of [...EN_FACTS, ...EN_JOKES]) {
    assert.ok(item.id);
    assert.match(`${item.content || item.setup || ''} ${item.punchline || ''}`, /[A-Za-z]/);
  }
});

test('curated selection avoids repeats until the pool is exhausted', () => {
  const service = createPoolService('zh-TW');
  const first = service.getRandomCuratedItem(ZH_FACTS);
  const second = service.getRandomCuratedItem(ZH_FACTS);

  assert.ok(first);
  assert.ok(second);
  if (ZH_FACTS.length > 1) {
    assert.notEqual(first.id, second.id);
  }
});
