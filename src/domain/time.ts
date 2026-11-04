import type { DailyHistoryEntry, StudyInterval, StudySession } from './types';

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = dateFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    dateFormatters.set(timeZone, formatter);
  }
  return formatter;
}

export function getDateKey(timestamp: number, timeZone: string): string {
  const values = Object.fromEntries(
    formatterFor(timeZone).formatToParts(new Date(timestamp)).map((part) => [part.type, part.value])
  );
  return [values.year, values.month, values.day].join('-');
}

function nextDayBoundary(timestamp: number, timeZone: string): number {
  const currentDate = getDateKey(timestamp, timeZone);
  let low = timestamp;
  let high = timestamp + 36 * 60 * 60 * 1000;

  while (getDateKey(high, timeZone) === currentDate) high += 12 * 60 * 60 * 1000;

  for (let iteration = 0; iteration < 48; iteration += 1) {
    const middle = Math.floor((low + high) / 2);
    if (getDateKey(middle, timeZone) === currentDate) low = middle;
    else high = middle;
  }
  return high;
}

export interface DaySlice {
  date: string;
  durationMs: number;
}

export function splitIntervalByDay(startedAt: number, endedAt: number, timeZone: string): DaySlice[] {
  if (endedAt <= startedAt) return [];
  const slices: DaySlice[] = [];
  let cursor = startedAt;

  while (cursor < endedAt) {
    const date = getDateKey(cursor, timeZone);
    const segmentEnd = Math.min(endedAt, nextDayBoundary(cursor, timeZone));
    if (segmentEnd <= cursor) break;
    slices.push({ date, durationMs: segmentEnd - cursor });
    cursor = segmentEnd;
  }
  return slices;
}

export function getSessionDurationMs(intervals: StudyInterval[], now = Date.now()): number {
  return intervals.reduce((total, interval) => {
    return total + Math.max(0, (interval.endedAt ?? now) - interval.startedAt);
  }, 0);
}

export function buildDailyHistory(
  sessions: StudySession[],
  intervals: StudyInterval[],
  timeZone: string,
  now = Date.now()
): DailyHistoryEntry[] {
  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  const daily = new Map<string, Map<string, number>>();

  for (const interval of intervals) {
    if (!sessionById.has(interval.sessionId)) continue;
    for (const slice of splitIntervalByDay(interval.startedAt, interval.endedAt ?? now, timeZone)) {
      const day = daily.get(slice.date) ?? new Map<string, number>();
      day.set(interval.sessionId, (day.get(interval.sessionId) ?? 0) + slice.durationMs);
      daily.set(slice.date, day);
    }
  }

  for (const session of sessions) {
    if (!intervals.some((interval) => interval.sessionId === session.id)) {
      const date = getDateKey(session.startedAt, timeZone);
      const day = daily.get(date) ?? new Map<string, number>();
      day.set(session.id, 0);
      daily.set(date, day);
    }
  }

  return [...daily.entries()].map(([date, entries]) => {
    const daySessions = [...entries.entries()]
      .map(([id, durationMs]) => ({ session: sessionById.get(id)!, durationMs }))
      .sort((a, b) => b.session.startedAt - a.session.startedAt);
    return {
      date,
      durationMs: daySessions.reduce((sum, entry) => sum + entry.durationMs, 0),
      sessions: daySessions
    };
  }).sort((a, b) => b.date.localeCompare(a.date));
}

export function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
}

export function formatCompactDuration(milliseconds: number): string {
  const minutes = Math.floor(Math.max(0, milliseconds) / 60_000);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return String(remainder) + 'm';
  return remainder === 0 ? String(hours) + 'h' : String(hours) + 'h ' + String(remainder) + 'm';
}

export function formatClock(timestamp: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).format(new Date(timestamp));
}

export function formatDateLabel(date: string, timeZone: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('en', {
    timeZone, weekday: 'long', month: 'long', day: 'numeric'
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}