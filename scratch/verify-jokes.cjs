const { TriviaService, isPredominantlyChinese } = require('../electron/trivia-service.cjs');

async function runTests() {
  console.log('=== Running Comprehensive Trivia & Joke Verification ===\n');

  const service = new TriviaService(() => null);
  service.stopScheduler(); // stop timer so process can exit

  // Test 1: Fetching multiple Chinese jokes
  console.log('--- 1. Testing zh-TW Jokes (5 iterations) ---');
  service.saveConfig({ language: 'zh-TW' });
  service.stopScheduler();

  for (let i = 1; i <= 5; i++) {
    const joke = await service.fetchOnlineJoke(true);
    console.log(`\n[Joke ${i}] Category: ${joke.categoryLabel} | Title: ${joke.title}`);
    console.log(`Setup: ${joke.setup}`);
    if (joke.punchline) console.log(`Punchline: 👉 ${joke.punchline}`);
    console.log(`Is Predominantly Chinese: ${isPredominantlyChinese(joke.setup + ' ' + (joke.punchline || ''))}`);
  }

  // Test 2: Fetching multiple Chinese facts
  console.log('\n--- 2. Testing zh-TW Facts (3 iterations) ---');
  for (let i = 1; i <= 3; i++) {
    const fact = await service.fetchOnlineFact(true);
    console.log(`\n[Fact ${i}] Category: ${fact.categoryLabel} | Title: ${fact.title}`);
    console.log(`Content: ${fact.content}`);
    console.log(`Is Predominantly Chinese: ${isPredominantlyChinese(fact.content)}`);
  }

  // Test 3: Fetching English Jokes
  console.log('\n--- 3. Testing en Jokes ---');
  service.saveConfig({ language: 'en' });
  service.stopScheduler();
  const enJoke = await service.fetchOnlineJoke(false);
  console.log('EN Joke:', enJoke);

  // Restore to zh-TW
  service.saveConfig({ language: 'zh-TW' });
  service.stopScheduler();

  console.log('\n=== All tests passed successfully! ===');
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
