const TIMEZONE = 'Europe/Bucharest';

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatInTimeZone(date, timeZone = TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
  };
}

function partsToUtcMs(parts) {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
}

function formatBucharest(date) {
  const parts = formatInTimeZone(date);
  return `${pad(parts.day)}.${pad(parts.month)}.${parts.year} ${pad(parts.hour)}:${pad(parts.minute)}`;
}

function formatBucharestDate(date) {
  const parts = formatInTimeZone(date);
  return `${pad(parts.day)}.${pad(parts.month)}.${parts.year}`;
}

function isValidCalendarDate(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
}

function localToUtc(year, month, day, hour, minute, timeZone = TIMEZONE) {
  const desired = { year, month, day, hour, minute };
  let utcMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 4; i += 1) {
    const actual = formatInTimeZone(new Date(utcMs), timeZone);
    const delta = partsToUtcMs(desired) - partsToUtcMs(actual);
    if (delta === 0) {
      const verify = formatInTimeZone(new Date(utcMs), timeZone);
      if (
        verify.year === year &&
        verify.month === month &&
        verify.day === day &&
        verify.hour === hour &&
        verify.minute === minute
      ) {
        return new Date(utcMs);
      }
      return null;
    }
    utcMs += delta;
  }
  return null;
}

function parseBucharestDateTime(dateStr, timeStr) {
  const dateMatch = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(dateStr || '').trim());
  if (!dateMatch) {
    return { ok: false, code: 'date_format', message: 'Data este invalidă. Folosește formatul DD.MM.YYYY.' };
  }
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(String(timeStr || '').trim());
  if (!timeMatch) {
    return { ok: false, code: 'time_format', message: 'Ora este invalidă. Folosește formatul HH:MM (24 de ore).' };
  }

  const day = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const year = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);

  if (!isValidCalendarDate(year, month, day)) {
    return { ok: false, code: 'date_invalid', message: 'Data este invalidă. Folosește formatul DD.MM.YYYY.' };
  }
  if (hour > 23 || minute > 59) {
    return { ok: false, code: 'time_invalid', message: 'Ora este invalidă. Folosește formatul HH:MM (24 de ore).' };
  }

  const date = localToUtc(year, month, day, hour, minute);
  if (!date) {
    return {
      ok: false,
      code: 'tz_gap',
      message: 'Data și ora nu există în fusul orar Europe/Bucharest.',
    };
  }

  return {
    ok: true,
    date,
    dateLabel: formatBucharestDate(date),
    dateTimeLabel: formatBucharest(date),
  };
}

module.exports = {
  TIMEZONE,
  formatBucharest,
  formatBucharestDate,
  parseBucharestDateTime,
};
