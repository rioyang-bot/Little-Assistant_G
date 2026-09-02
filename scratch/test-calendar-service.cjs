const assert = require('node:assert/strict');
const test = require('node:test');
const { CalendarService } = require('../electron/calendar-service.cjs');

function serviceWith(config) {
  const service = Object.create(CalendarService.prototype);
  service.config = config;
  return service;
}

test('calendar sticky notes continue syncing when dialogue reminders are disabled', () => {
  const service = serviceWith({
    enabled: false,
    calendars: [{ enabled: true, assistantReminder: false, importToSticky: true, url: 'https://example.test/calendar.ics' }]
  });
  assert.equal(service.shouldSync(), true);
});

test('dialogue-only calendars stop syncing when the master dialogue switch is disabled', () => {
  const service = serviceWith({
    enabled: false,
    calendars: [{ enabled: true, assistantReminder: true, importToSticky: false, url: 'https://example.test/calendar.ics' }]
  });
  assert.equal(service.shouldSync(), false);
});

test('each enabled calendar can independently use assistant dialogue reminders', () => {
  const service = serviceWith({
    enabled: true,
    calendars: [{ enabled: true, assistantReminder: true, importToSticky: false, url: 'https://example.test/calendar.ics' }]
  });
  assert.equal(service.shouldSync(), true);
});

test('reminder and sticky schedules are processed independently', async () => {
  const service = serviceWith({
    enabled: true,
    calendars: [{ enabled: true, assistantReminder: true, importToSticky: true, url: 'https://example.test/calendar.ics' }]
  });
  service.lastReminderCheckAt = 900000;
  service.lastStickyCheckAt = 0;
  let options;
  service.checkCalendar = async (manual, received) => {
    options = received;
    return { success: true };
  };
  await service.runScheduledCheck(15, 5, 1200000);
  assert.deepEqual(options, { processReminders: false, processSticky: true });
  assert.equal(service.lastReminderCheckAt, 900000);
  assert.equal(service.lastStickyCheckAt, 1200000);
});

test('a successful calendar connection test sends an assistant dialogue preview', async () => {
  let sent;
  const service = serviceWith({ language: 'zh-TW', rules: { soundEnabled: true } });
  service.getMainWindow = () => ({
    isDestroyed: () => false,
    webContents: { send: (channel, payload) => { sent = { channel, payload }; } }
  });
  service.getSystemTimezone = () => 'Asia/Taipei';
  service.parseEventsFromCalendar = async () => ({
    todayEvents: [{ summary: '測試行程', timeLabel: '10:00', calendarColor: '#38bdf8' }],
    tomorrowEvents: []
  });
  const result = await service.testSingleCalendar({ id: 'cal-1', name: '工作日曆', color: '#38bdf8', url: 'https://example.test/calendar.ics' });
  assert.equal(result.success, true);
  assert.equal(sent.channel, 'calendar-reminder');
  assert.equal(sent.payload.type, 'connection-test');
  assert.equal(sent.payload.calendarName, '工作日曆');
  assert.equal(sent.payload.events.length, 1);
});
