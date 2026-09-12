const fs = require('fs');
const path = require('path');
const https = require('https');
const ical = require('node-ical');
const { ipcMain } = require('electron');
const { locales } = require('./locales.cjs');
const { getStoragePath } = require('./storage-utils.cjs');

function getConfigFilePath() {
  return getStoragePath('calendar-config.json');
}

const DEFAULT_CONFIG = {
  language: 'zh-TW',
  calendars: [
    {
      id: 'cal-1',
      name: '主要 Google 日曆',
      color: '#38bdf8',
      enabled: true,
      assistantReminder: true,
      importToSticky: false,
      url: ''
    }
  ],
  rules: {
    checkIntervalMinutes: 15,
    reminderCheckIntervalMinutes: 15,
    stickyCheckIntervalMinutes: 15,
    remindAdvanceMinutes: 15,
    tomorrowPreviewHour: 18,
    stickyDisplayDays: 7,
    soundEnabled: true
  },
  notifiedEventIds: []
};

class CalendarService {
  constructor(mainWindowGetter, onConfigUpdated) {
    this.getMainWindow = mainWindowGetter;
    this.onConfigUpdated = onConfigUpdated;
    this.config = this.loadConfig();
    this.pollTimer = null;
    this.initialCheckTimer = null;
    this.isChecking = false;
    this.lastReminderCheckAt = 0;
    this.lastStickyCheckAt = 0;

    this.setupIpc();
  }

  getSystemTimezone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Taipei';
    } catch (e) {
      return 'Asia/Taipei';
    }
  }

  getLocale() {
    const lang = this.config.language || 'zh-TW';
    return locales[lang] || locales['zh-TW'];
  }

  loadConfig() {
    try {
      const configFile = getConfigFilePath();
      if (fs.existsSync(configFile)) {
        const data = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        return {
          language: data.language || DEFAULT_CONFIG.language,
          calendars: Array.isArray(data.calendars) && data.calendars.length > 0 ? data.calendars : DEFAULT_CONFIG.calendars,
          rules: {
            ...DEFAULT_CONFIG.rules,
            ...(data.rules || {})
          },
          notifiedEventIds: Array.isArray(data.notifiedEventIds) ? data.notifiedEventIds : []
        };
      }
    } catch (err) {
      console.error('[CalendarService] Error loading calendar config:', err.message);
    }
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }

  saveConfig(newConfig) {
    try {
      const configFile = getConfigFilePath();
      let existing = {};
      if (fs.existsSync(configFile)) {
        try {
          existing = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        } catch (e) {}
      }

      const mergedConfig = {
        ...this.config,
        ...newConfig,
        rules: {
          ...this.config.rules,
          ...(newConfig.rules || {})
        }
      };

      this.config = mergedConfig;
      const diskConfig = {
        ...existing,
        language: mergedConfig.language || existing.language || 'zh-TW',
        calendars: mergedConfig.calendars,
        rules: mergedConfig.rules
      };
      // Calendar dialogue reminders are controlled per calendar. Remove the
      // retired master switch value while migrating existing configuration.
      delete diskConfig.enabled;
      if (mergedConfig.notifiedEventIds) diskConfig.notifiedEventIds = mergedConfig.notifiedEventIds;

      fs.writeFileSync(configFile, JSON.stringify(diskConfig, null, 2), 'utf8');

      if (!(mergedConfig.calendars || []).some(calendar => calendar.enabled !== false && calendar.importToSticky === true)) {
        const mainWindow = typeof this.getMainWindow === 'function' ? this.getMainWindow() : null;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('calendar-sticky-updated', { enabled: false, events: [] });
        }
      }

      this.restartPolling();
      if (typeof this.onConfigUpdated === 'function') {
        this.onConfigUpdated(this.config);
      }
      return { success: true, config: this.config };
    } catch (err) {
      console.error('[CalendarService] Error saving calendar config:', err.message);
      return { success: false, error: err.message };
    }
  }

  fetchIcsData(url) {
    return new Promise((resolve, reject) => {
      if (!url || typeof url !== 'string') {
        return reject(new Error('Invalid URL'));
      }
      let cleanedUrl = url.trim();
      if (cleanedUrl.startsWith('webcal://')) {
        cleanedUrl = 'https://' + cleanedUrl.substring(9);
      } else if (cleanedUrl.startsWith('http://')) {
        cleanedUrl = 'https://' + cleanedUrl.substring(7);
      }

      if (!cleanedUrl.startsWith('https://')) {
        return reject(new Error('URL must start with https://'));
      }

      const requestOptions = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) MEtechAssistantCalendar/1.0',
          'Accept': 'text/calendar, application/json, text/plain, */*'
        },
        timeout: 12000,
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2'
      };

      const handleRequest = (reqUrl, redirectCount = 0) => {
        if (redirectCount > 5) {
          return reject(new Error('Too many redirects'));
        }

        const req = https.get(reqUrl, requestOptions, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            let nextUrl = res.headers.location;
            if (!nextUrl.startsWith('http')) {
              const parsed = new URL(reqUrl);
              nextUrl = new URL(nextUrl, parsed.origin).href;
            }
            return handleRequest(nextUrl, redirectCount + 1);
          }

          if (res.statusCode !== 200) {
            return reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
          }

          let data = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            data += chunk;
            // Prevent excessively large calendar files (max 10MB)
            if (data.length > 10 * 1024 * 1024) {
              req.destroy();
              reject(new Error('Calendar data exceeded maximum size limit (10MB)'));
            }
          });
          res.on('end', () => resolve(data));
        });

        req.on('error', (err) => reject(err));
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Calendar request timed out'));
        });
      };

      handleRequest(cleanedUrl);
    });
  }

  // Format date helper respecting local system timezone
  getLocalDateKey(date, timeZone) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(date); // Output: YYYY-MM-DD
  }

  getLocalTimeStr(date, timeZone) {
    const formatter = new Intl.DateTimeFormat('zh-TW', {
      timeZone: timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    return formatter.format(date); // Output: HH:mm
  }

  getLocalHour(date, timeZone) {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone,
      hour: 'numeric',
      hour12: false
    });
    return parseInt(formatter.format(date), 10) || 0;
  }

  async parseEventsFromCalendar(cal, options = {}) {
    const tz = this.getSystemTimezone();
    const now = new Date();
    const todayKey = this.getLocalDateKey(now, tz);

    const tomorrowDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowKey = this.getLocalDateKey(tomorrowDate, tz);
    const currentHour = this.getLocalHour(now, tz);
    const tomorrowPreviewHour = this.config.rules.tomorrowPreviewHour || 18;
    const stickyDisplayDays = Math.max(1, Math.min(30, Number(this.config.rules.stickyDisplayDays) || 7));
    const stickyEndKey = this.getLocalDateKey(new Date(now.getTime() + (stickyDisplayDays - 1) * 86400000), tz);
    const isTomorrowPreviewActive = tomorrowPreviewHour > 0 && currentHour >= tomorrowPreviewHour;

    const icsContent = await this.fetchIcsData(cal.url);
    const parsedData = ical.sync.parseICS(icsContent);

    const todayEvents = [];
    const tomorrowEvents = [];
    const upcomingEvents = [];
    const stickyEvents = [];

    const advanceMins = this.config.rules.remindAdvanceMinutes || 15;
    const advanceMs = advanceMins * 60 * 1000;

    for (const k in parsedData) {
      if (!Object.prototype.hasOwnProperty.call(parsedData, k)) continue;
      const ev = parsedData[k];
      if (ev.type !== 'VEVENT') continue;

      const isEn = this.config.language === 'en';
      const summary = (ev.summary || (isEn ? '(Untitled Event)' : '無標題行程')).trim();
      const location = (ev.location || '').trim();
      const description = (ev.description || '').trim();
      const uid = ev.uid || `${cal.id}-${summary}-${ev.start}`;

      // Check for all-day event
      const isAllDay = ev.datetype === 'date' || (ev.start && ev.end && (ev.end.getTime() - ev.start.getTime()) % (24 * 60 * 60 * 1000) === 0);

      // Handle recurrence expansion if rrule is present
      const eventDates = [];
      if (ev.rrule) {
        // Expand recurrences for today and tomorrow
        try {
          const rangeStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          const rangeEnd = new Date(now.getTime() + stickyDisplayDays * 24 * 60 * 60 * 1000);
          const dates = ev.rrule.between(rangeStart, rangeEnd, true);
          dates.forEach(d => {
            const duration = ev.end ? (ev.end.getTime() - ev.start.getTime()) : 0;
            eventDates.push({
              start: d,
              end: new Date(d.getTime() + duration)
            });
          });
        } catch (rruleErr) {
          eventDates.push({ start: ev.start, end: ev.end || ev.start });
        }
      } else {
        eventDates.push({ start: ev.start, end: ev.end || ev.start });
      }

      for (const instance of eventDates) {
        if (!instance.start) continue;

        const eventStartDateKey = this.getLocalDateKey(instance.start, tz);
        const startTimeStr = isAllDay ? (isEn ? 'All Day' : '全天') : this.getLocalTimeStr(instance.start, tz);
        const endTimeStr = (instance.end && !isAllDay) ? this.getLocalTimeStr(instance.end, tz) : '';

        const eventItem = {
          id: uid,
          calendarId: cal.id,
          calendarName: cal.name || (isEn ? 'Calendar' : '行事曆'),
          calendarColor: cal.color || '#38bdf8',
          summary,
          location,
          description,
          isAllDay,
          startTimeStr,
          endTimeStr,
          timeLabel: isAllDay ? (isEn ? 'All Day' : '全天') : (endTimeStr ? `${startTimeStr} - ${endTimeStr}` : startTimeStr),
          start: instance.start,
          end: instance.end || instance.start
        };

        if (eventStartDateKey >= todayKey && eventStartDateKey <= stickyEndKey
          && (isAllDay || instance.end.getTime() >= now.getTime() - 10 * 60 * 1000)) {
          stickyEvents.push(eventItem);
        }

        // Today event classification
        if (eventStartDateKey === todayKey) {
          // If not all day, check if event has not already passed
          if (isAllDay || instance.end.getTime() >= now.getTime() - 10 * 60 * 1000) {
            todayEvents.push(eventItem);
          }

          // Check if upcoming soon
          if (!isAllDay) {
            const diff = instance.start.getTime() - now.getTime();
            if (diff > 0 && diff <= advanceMs) {
              upcomingEvents.push(eventItem);
            }
          }
        } else if (eventStartDateKey === tomorrowKey) {
          tomorrowEvents.push(eventItem);
        }
      }
    }

    // Sort events by start time
    const sortByTime = (a, b) => {
      if (a.isAllDay && !b.isAllDay) return -1;
      if (!a.isAllDay && b.isAllDay) return 1;
      return a.start.getTime() - b.start.getTime();
    };

    todayEvents.sort(sortByTime);
    tomorrowEvents.sort(sortByTime);
    upcomingEvents.sort(sortByTime);
    stickyEvents.sort(sortByTime);

    return {
      todayEvents,
      tomorrowEvents,
      upcomingEvents,
      stickyEvents,
      isTomorrowPreviewActive
    };
  }

  async checkCalendar(isManual = false, options = {}) {
    if (this.isChecking) return { success: false, reason: 'Check already in progress' };
    this.isChecking = true;

    try {
      const processReminders = isManual || options.processReminders !== false;
      const processSticky = isManual || options.processSticky !== false;
      const activeCalendars = (this.config.calendars || []).filter(c => c.enabled !== false && c.url);
      if (!activeCalendars.length) {
        const mainWindow = typeof this.getMainWindow === 'function' ? this.getMainWindow() : null;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('calendar-sticky-updated', { enabled: false, events: [] });
        }
        this.isChecking = false;
        return { success: true, count: 0, message: '沒有已啟用的行事曆' };
      }

      let allToday = [];
      let allTomorrow = [];
      let allUpcoming = [];
      let allSticky = [];
      let isTomorrowPreview = false;

      for (const cal of activeCalendars) {
        try {
          const res = await this.parseEventsFromCalendar(cal);
          allToday = allToday.concat(res.todayEvents);
          allTomorrow = allTomorrow.concat(res.tomorrowEvents);
          allUpcoming = allUpcoming.concat(res.upcomingEvents);
          allSticky = allSticky.concat(res.stickyEvents);
          if (res.isTomorrowPreviewActive) isTomorrowPreview = true;
        } catch (calErr) {
          console.warn(`[CalendarService] Failed to load calendar "${cal.name}":`, calErr.message);
        }
      }

      const sortByTime = (a, b) => {
        if (a.isAllDay && !b.isAllDay) return -1;
        if (!a.isAllDay && b.isAllDay) return 1;
        return a.start.getTime() - b.start.getTime();
      };

      allToday.sort(sortByTime);
      allTomorrow.sort(sortByTime);
      allUpcoming.sort(sortByTime);
      allSticky.sort(sortByTime);

      const mainWindow = typeof this.getMainWindow === 'function' ? this.getMainWindow() : null;

      if (processSticky && mainWindow && !mainWindow.isDestroyed()) {
        const importedCalendarIds = new Set(activeCalendars
          .filter(calendar => calendar.importToSticky === true)
          .map(calendar => calendar.id));
        const stickyEvents = allSticky
          .filter(event => importedCalendarIds.has(event.calendarId))
          .map(event => ({
            id: `${event.calendarId}-${event.id}-${new Date(event.start).getTime()}`,
            date: this.getLocalDateKey(new Date(event.start), this.getSystemTimezone()),
            time: event.timeLabel,
            summary: event.summary,
            description: event.description
          }));
        mainWindow.webContents.send('calendar-sticky-updated', {
          enabled: importedCalendarIds.size > 0,
          displayDays: Math.max(1, Math.min(30, Number(this.config.rules.stickyDisplayDays) || 7)),
          events: stickyEvents
        });
      }

      // Filter new upcoming events to avoid duplicate alerts
      const reminderCalendarIds = new Set(activeCalendars
        .filter(calendar => calendar.assistantReminder !== false)
        .map(calendar => calendar.id));
      const newUpcoming = !processReminders ? [] : allUpcoming.filter(ev =>
        reminderCalendarIds.has(ev.calendarId) && !this.config.notifiedEventIds.includes(ev.id));

      if (mainWindow && !mainWindow.isDestroyed()) {
        if (newUpcoming.length > 0) {
          // Send upcoming meeting alert
          mainWindow.webContents.send('calendar-reminder', {
            type: 'upcoming',
            events: newUpcoming,
            soundEnabled: this.config.rules.soundEnabled !== false
          });

          // Mark notified
          newUpcoming.forEach(ev => {
            if (!this.config.notifiedEventIds.includes(ev.id)) {
              this.config.notifiedEventIds.push(ev.id);
            }
          });
          // Limit memory size
          if (this.config.notifiedEventIds.length > 500) {
            this.config.notifiedEventIds = this.config.notifiedEventIds.slice(-200);
          }
          this.saveConfig(this.config);
        } else if (isManual) {
          // Send full agenda overview to pet window
          mainWindow.webContents.send('calendar-reminder', {
            type: 'overview',
            todayEvents: allToday,
            tomorrowEvents: isTomorrowPreview ? allTomorrow : [],
            isTomorrowPreviewActive: isTomorrowPreview,
            soundEnabled: this.config.rules.soundEnabled !== false
          });
        }
      }

      this.isChecking = false;
      return {
        success: true,
        todayCount: allToday.length,
        tomorrowCount: allTomorrow.length,
        upcomingCount: allUpcoming.length,
        todayEvents: allToday,
        tomorrowEvents: isTomorrowPreview ? allTomorrow : [],
        isTomorrowPreviewActive: isTomorrowPreview,
        timezone: this.getSystemTimezone()
      };
    } catch (err) {
      this.isChecking = false;
      return { success: false, error: err.message };
    }
  }

  async testSingleCalendar(calData) {
    const isEn = this.config.language === 'en';
    try {
      if (!calData.url) {
        return {
          success: false,
          error: isEn ? 'Please provide a valid Google Calendar Secret iCal URL' : '請提供有效的 Google 行事曆 iCal 秘密網址'
        };
      }
      const res = await this.parseEventsFromCalendar(calData);
      const tz = this.getSystemTimezone();
      const mainWindow = typeof this.getMainWindow === 'function' ? this.getMainWindow() : null;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('calendar-reminder', {
          type: 'connection-test',
          calendarName: calData.name || (isEn ? 'Calendar' : '行事曆'),
          calendarColor: calData.color || '#38bdf8',
          todayCount: res.todayEvents.length,
          tomorrowCount: res.tomorrowEvents.length,
          events: [...res.todayEvents, ...res.tomorrowEvents].slice(0, 3),
          soundEnabled: this.config.rules.soundEnabled !== false
        });
      }
      return {
        success: true,
        message: isEn
          ? `Connected successfully! ${res.todayEvents.length} event(s) today, ${res.tomorrowEvents.length} event(s) tomorrow (Timezone: ${tz})`
          : `連線成功！今日有 ${res.todayEvents.length} 個行程，明日有 ${res.tomorrowEvents.length} 個行程（時區: ${tz}）`,
        todayCount: res.todayEvents.length,
        tomorrowCount: res.tomorrowEvents.length,
        sampleEvents: res.todayEvents.slice(0, 3).map(e => `[${e.timeLabel}] ${e.summary}`),
        timezone: tz
      };
    } catch (err) {
      return {
        success: false,
        error: isEn
          ? `Could not load calendar: ${err.message}. Please verify you copied the "Secret address in iCal format".`
          : `無法讀取此行事曆：${err.message}。請確認是否已複製「以 iCal 格式顯示的秘密地址」`
      };
    }
  }

  setupIpc() {
    if (!ipcMain || typeof ipcMain.handle !== 'function') {
      return;
    }

    ipcMain.handle('calendar-get-config', () => {
      return {
        ...this.config,
        systemTimezone: this.getSystemTimezone()
      };
    });

    ipcMain.handle('calendar-save-config', (event, newConfig) => {
      return this.saveConfig(newConfig);
    });

    ipcMain.handle('calendar-test-connection', async (event, calData) => {
      return await this.testSingleCalendar(calData);
    });

    ipcMain.handle('calendar-check-now', async () => {
      return await this.checkCalendar(true);
    });
  }

  startPolling() {
    this.stopPolling();
    const reminderInterval = Math.max(1, Number(this.config.rules.reminderCheckIntervalMinutes || this.config.rules.checkIntervalMinutes) || 15);
    const stickyInterval = Math.max(1, Number(this.config.rules.stickyCheckIntervalMinutes || this.config.rules.checkIntervalMinutes) || 15);
    const intervals = [];
    if (this.hasReminderSyncSource()) intervals.push(reminderInterval);
    if (this.hasStickySyncSource()) intervals.push(stickyInterval);
    const intervalMins = intervals.length ? Math.min(...intervals) : 15;
    const intervalMs = intervalMins * 60 * 1000;

    this.pollTimer = setInterval(() => {
      this.runScheduledCheck(reminderInterval, stickyInterval);
    }, intervalMs);

    // Initial check after 5 seconds on startup
    this.initialCheckTimer = setTimeout(() => {
      if (this.shouldSync()) {
        const processReminders = this.hasReminderSyncSource();
        const processSticky = this.hasStickySyncSource();
        this.checkCalendar(false, { processReminders, processSticky }).then(result => {
          if (result && result.success) {
            const now = Date.now();
            if (processReminders) this.lastReminderCheckAt = now;
            if (processSticky) this.lastStickyCheckAt = now;
          }
        });
      }
    }, 5000);
  }

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.initialCheckTimer) {
      clearTimeout(this.initialCheckTimer);
      this.initialCheckTimer = null;
    }
  }

  restartPolling() {
    this.stopPolling();
    if (this.shouldSync()) {
      this.startPolling();
    }
  }

  shouldSync() {
    return this.hasReminderSyncSource() || this.hasStickySyncSource();
  }

  hasReminderSyncSource() {
    return (this.config.calendars || [])
      .some(calendar => calendar.enabled !== false && calendar.assistantReminder !== false && calendar.url);
  }

  hasStickySyncSource() {
    return (this.config.calendars || [])
      .some(calendar => calendar.enabled !== false && calendar.importToSticky === true && calendar.url);
  }

  async runScheduledCheck(reminderInterval, stickyInterval, now = Date.now()) {
    const processReminders = this.hasReminderSyncSource()
      && now - this.lastReminderCheckAt >= reminderInterval * 60000;
    const processSticky = this.hasStickySyncSource()
      && now - this.lastStickyCheckAt >= stickyInterval * 60000;
    if (!processReminders && !processSticky) return;
    const result = await this.checkCalendar(false, { processReminders, processSticky });
    if (result && result.success) {
      if (processReminders) this.lastReminderCheckAt = now;
      if (processSticky) this.lastStickyCheckAt = now;
    }
  }
}

module.exports = { CalendarService, DEFAULT_CONFIG };
