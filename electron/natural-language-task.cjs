const PRIORITIES = [
  { color: 'red', pattern: /(?:非常緊急|緊急|urgently|urgent|asap)/gi },
  { color: 'amber', pattern: /(?:重要|important)/gi },
  { color: 'blue', pattern: /(?:一般|普通|normal)/gi }
];

function startOfLocalDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function parseNaturalLanguageTask(input, nowValue = Date.now()) {
  const original = String(input || '').replace(/\s+/g, ' ').trim();
  if (!original) return { success: false, error: '請輸入事項內容' };

  const now = new Date(nowValue);
  let working = original;
  let color = 'blue';
  for (const priority of PRIORITIES) {
    if (priority.pattern.test(working)) {
      color = priority.color;
      working = working.replace(priority.pattern, ' ');
      break;
    }
  }

  let alarmAt = null;
  let dateMatched = false;
  let timeMatched = false;
  let target = startOfLocalDay(now);

  const relativeMatch = working.match(/(?:再|in\s+)?(\d+)\s*(分鐘|分|小時|天|minutes?|hours?|days?)\s*(?:後|later)?/i);
  if (relativeMatch) {
    const amount = Math.max(1, Number(relativeMatch[1]));
    const unit = relativeMatch[2].toLowerCase();
    const multiplier = /分鐘|分|minute/.test(unit) ? 60000 : /小時|hour/.test(unit) ? 3600000 : 86400000;
    alarmAt = now.getTime() + amount * multiplier;
    working = working.replace(relativeMatch[0], ' ');
    dateMatched = true;
    timeMatched = true;
  }

  if (!alarmAt) {
    const relativeDays = [
      { pattern: /大後天|in three days/gi, days: 3 },
      { pattern: /後天|day after tomorrow/gi, days: 2 },
      { pattern: /明天|tomorrow/gi, days: 1 },
      { pattern: /今天|today/gi, days: 0 }
    ];
    for (const candidate of relativeDays) {
      if (candidate.pattern.test(working)) {
        target = addDays(target, candidate.days);
        working = working.replace(candidate.pattern, ' ');
        dateMatched = true;
        break;
      }
    }

    const dateMatch = working.match(/(?:(\d{4})[年\/-])?(\d{1,2})[月\/-](\d{1,2})(?:日|號)?/);
    if (dateMatch) {
      let year = Number(dateMatch[1]) || now.getFullYear();
      target = new Date(year, Number(dateMatch[2]) - 1, Number(dateMatch[3]));
      if (!dateMatch[1] && target < startOfLocalDay(now)) target.setFullYear(year + 1);
      working = working.replace(dateMatch[0], ' ');
      dateMatched = true;
    } else {
      const weekdayMatch = working.match(/(下週|下星期|next\s+)?(?:週|星期)?([一二三四五六日天]|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
      if (weekdayMatch && /週|星期|next|monday|tuesday|wednesday|thursday|friday|saturday|sunday/i.test(weekdayMatch[0])) {
        const weekdayMap = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0,
          monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 0 };
        const key = weekdayMatch[2].toLowerCase();
        let offset = (weekdayMap[key] - now.getDay() + 7) % 7;
        if (offset === 0 || weekdayMatch[1]) offset += 7;
        target = addDays(target, offset);
        working = working.replace(weekdayMatch[0], ' ');
        dateMatched = true;
      }
    }

    const englishTimeMatch = working.match(/(\d{1,2})(?::(\d{1,2}))?\s*(am|pm)\b/i);
    const chineseTimeMatch = working.match(/(凌晨|早上|上午|中午|下午|傍晚|晚上)?\s*(\d{1,2})\s*(?::|：|點)(\d{1,2}|半)?\s*(?:分)?/);
    const timeMatch = englishTimeMatch || chineseTimeMatch;
    if (timeMatch) {
      let hour = Number(englishTimeMatch ? timeMatch[1] : timeMatch[2]);
      const rawMinute = englishTimeMatch ? timeMatch[2] : timeMatch[3];
      const minute = rawMinute === '半' ? 30 : Number(rawMinute || 0);
      const period = englishTimeMatch ? timeMatch[3].toLowerCase() : (timeMatch[1] || '');
      if ((/下午|傍晚|晚上/.test(period) || period === 'pm') && hour < 12) hour += 12;
      if ((/凌晨/.test(period) || period === 'am') && hour === 12) hour = 0;
      if (/中午/.test(period) && hour < 11) hour += 12;
      target.setHours(Math.min(23, hour), Math.min(59, minute), 0, 0);
      working = working.replace(timeMatch[0], ' ');
      timeMatched = true;
    }

    if (dateMatched || timeMatched) {
      if (!timeMatched) target.setHours(9, 0, 0, 0);
      if (!dateMatched && target <= now) target = addDays(target, 1);
      if (target > now) alarmAt = target.getTime();
    }
  }

  const title = working
    .replace(/(?:請|幫我|提醒我|提醒|記得要?|新增(?:一個|一筆)?|建立(?:一個|一筆)?|待辦(?:事項)?|todo|remind me(?:\s+to)?|add|at)\s*/gi, ' ')
    .replace(/^\s*to\s+/i, '')
    .replace(/[，,。.!！：:;；]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim() || original;

  return {
    success: true,
    title: title.slice(0, 80),
    items: [],
    color,
    alarmAt,
    sourceText: original
  };
}

module.exports = { parseNaturalLanguageTask };
