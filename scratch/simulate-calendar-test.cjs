const { CalendarService } = require('../electron/calendar-service.cjs');
const fs = require('fs');
const path = require('path');
const ical = require('node-ical');

console.log('====================================================');
console.log('🧪 Starting Calendar Service & Timezone Verification');
console.log('====================================================');

async function runTests() {
  let passed = 0;
  let failed = 0;

  function assert(condition, name) {
    if (condition) {
      console.log(`✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${name}`);
      failed++;
    }
  }

  const calService = new CalendarService(() => null);

  // 1. Timezone detection
  const detectedTz = calService.getSystemTimezone();
  console.log(`\n[Test 1] Detected System Timezone: "${detectedTz}"`);
  assert(typeof detectedTz === 'string' && detectedTz.length > 0, 'System timezone auto-detected');

  // 2. Mock iCal generation with timezone & multiple events
  const now = new Date();
  const todayDateStr = calService.getLocalDateKey(now, detectedTz);
  const tomorrowDateStr = calService.getLocalDateKey(new Date(now.getTime() + 24*60*60*1000), detectedTz);

  console.log(`[Test 2] Today local key: ${todayDateStr}, Tomorrow local key: ${tomorrowDateStr}`);
  assert(todayDateStr.includes('-') && tomorrowDateStr.includes('-'), 'Date key formatting correct');

  // Create sample iCal content
  const mockIcs = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Google Inc//Google Calendar 70.9054//EN
CALSCALE:GREGORIAN
BEGIN:VEVENT
UID:test-today-meeting-1@google.com
SUMMARY:【技術會議】AI 行事曆架構審查
DESCRIPTION:討論 Google Calendar iCal 整合設計
LOCATION:Google Meet 線上會議室
DTSTART:${now.toISOString().replace(/[-:]/g, '').split('.')[0]}Z
DTEND:${new Date(now.getTime() + 3600000).toISOString().replace(/[-:]/g, '').split('.')[0]}Z
STATUS:CONFIRMED
END:VEVENT
BEGIN:VEVENT
UID:test-tomorrow-event-1@google.com
SUMMARY:【專案發布】小助手 v2.0 上線發表會
DESCRIPTION:正式發布支援倫敦與台灣跨時區小助手
LOCATION:台北市信義區 MEtech 總部 10F
DTSTART:${new Date(now.getTime() + 24*60*60*1000).toISOString().replace(/[-:]/g, '').split('.')[0]}Z
DTEND:${new Date(now.getTime() + 28*60*60*1000).toISOString().replace(/[-:]/g, '').split('.')[0]}Z
STATUS:CONFIRMED
END:VEVENT
BEGIN:VEVENT
UID:test-allday-event-1@google.com
SUMMARY:【全天】全球跨國團隊遠端工作日 (Remote Work Day)
DTSTART;VALUE=DATE:${todayDateStr.replace(/-/g, '')}
DTEND;VALUE=DATE:${todayDateStr.replace(/-/g, '')}
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`;

  // Parse directly
  const parsedData = ical.sync.parseICS(mockIcs);
  assert(Object.keys(parsedData).length >= 3, 'iCal parsed 3 events successfully');

  // Test parseEventsFromCalendar logic with mock
  calService.fetchIcsData = async () => mockIcs;

  const res = await calService.parseEventsFromCalendar({
    id: 'cal-mock-1',
    name: '工作行事曆',
    color: '#38bdf8',
    url: 'https://calendar.google.com/calendar/ical/test/basic.ics'
  });

  console.log(`\n[Test 3] Parsed events result:`, {
    todayCount: res.todayEvents.length,
    tomorrowCount: res.tomorrowEvents.length,
    isTomorrowPreviewActive: res.isTomorrowPreviewActive
  });

  assert(res.todayEvents.length >= 2, 'Parsed Today events (including timed & all-day)');
  assert(res.tomorrowEvents.length >= 1, 'Parsed Tomorrow events');
  assert(res.todayEvents.some(e => e.isAllDay), 'All-day event correctly identified');

  // Test Timezone adaptation (Taiwan UTC+8 vs London UTC+0/BST)
  const twDateStr = calService.getLocalDateKey(new Date('2026-08-30T16:00:00Z'), 'Asia/Taipei');
  const londonDateStr = calService.getLocalDateKey(new Date('2026-08-30T16:00:00Z'), 'Europe/London');
  console.log(`\n[Test 4] Cross-Timezone comparison for 2026-08-30 16:00:00 UTC:`);
  console.log(`  - Taiwan (Asia/Taipei UTC+8): ${twDateStr} (Next day 00:00)`);
  console.log(`  - London (Europe/London BST UTC+1): ${londonDateStr} (Same day 17:00)`);
  assert(twDateStr === '2026-08-31' && londonDateStr === '2026-08-30', 'Cross-timezone Taiwan vs London calculation exact');

  // 5. Config persistence
  const saveRes = calService.saveConfig({
    enabled: true,
    calendars: [
      {
        id: 'cal-1',
        name: '主要 Google 日曆',
        color: '#38bdf8',
        enabled: true,
        url: 'https://calendar.google.com/calendar/ical/example/basic.ics'
      }
    ],
    rules: {
      remindAdvanceMinutes: 15,
      tomorrowPreviewHour: 18,
      checkIntervalMinutes: 15,
      soundEnabled: true
    }
  });

  assert(saveRes.success === true, 'Calendar config saved successfully');
  assert(fs.existsSync(path.join(__dirname, '../calendar-config.json')), 'calendar-config.json file created');

  console.log('\n====================================================');
  console.log(`🎉 TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
