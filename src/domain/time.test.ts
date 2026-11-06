import { describe, expect, it } from 'vitest';
import {
  buildDailyHistory, formatClock, formatCompactDuration, formatDateLabel, formatDuration,
  getDateKey, getSessionDurationMs, splitIntervalByDay
} from './time';
import { DEFAULT_TIME_ZONE } from './types';
import type { StudyInterval, StudySession } from './types';

const makeSession = (id: string, startedAt: number): StudySession => ({
  id, activityId: 'activity-' + id, title: id, note: '', status: 'completed',
  startedAt, endedAt: startedAt, timezone: DEFAULT_TIME_ZONE, createdAt: 0, updatedAt: 0
});
const makeInterval = (id: string, sessionId: string, startedAt: number, endedAt: number | null): StudyInterval => ({
  id, sessionId, startedAt, endedAt, checkpointAt: endedAt ?? startedAt
});

describe('Tehran time accounting', () => {
  it('uses the reporting timezone for calendar dates', () => {
    expect(getDateKey(Date.UTC(2026, 10, 3, 20, 59), DEFAULT_TIME_ZONE)).toBe('2026-11-04');
    expect(getDateKey(Date.UTC(2026, 10, 3, 20, 59), 'UTC')).toBe('2026-11-03');
  });

  it('splits an interval at Tehran midnight', () => {
    const start = Date.UTC(2026, 10, 3, 20, 0);
    const end = Date.UTC(2026, 10, 3, 21, 0);
    expect(splitIntervalByDay(start, end, DEFAULT_TIME_ZONE)).toEqual([
      { date: '2026-11-03', durationMs: 30 * 60 * 1000 },
      { date: '2026-11-04', durationMs: 30 * 60 * 1000 }
    ]);
  });

  it('keeps daily totals separate for an interval crossing midnight', () => {
    const start = Date.UTC(2026, 10, 3, 20, 0);
    const end = Date.UTC(2026, 10, 3, 21, 0);
    const session: StudySession = { ...makeSession('s1', start), endedAt: end };
    const interval = makeInterval('i1', 's1', start, end);
    expect(buildDailyHistory([session], [interval], DEFAULT_TIME_ZONE).map((day) => day.durationMs))
      .toEqual([30 * 60 * 1000, 30 * 60 * 1000]);
  });

  it('formats elapsed duration', () => {
    expect(formatDuration(3_661_999)).toBe('01:01:01');
    expect(formatDuration(-1)).toBe('00:00:00');
    expect(formatDuration(0)).toBe('00:00:00');
    expect(formatDuration(86_400_000 + 3_661_000)).toBe('25:01:01');
  });

  it('formats compact durations for minute-only, whole-hour, and mixed values', () => {
    expect(formatCompactDuration(0)).toBe('0m');
    expect(formatCompactDuration(-60_000)).toBe('0m');
    expect(formatCompactDuration(59_999)).toBe('0m');
    expect(formatCompactDuration(3_600_000)).toBe('1h');
    expect(formatCompactDuration(3_660_000)).toBe('1h 1m');
  });

  it('formats clock and date labels using the requested timezone', () => {
    const instant = Date.UTC(2026, 10, 3, 20, 5, 9);
    expect(formatClock(instant, 'UTC')).toBe('20:05:09');
    expect(formatClock(instant, 'Asia/Tehran')).toBe('23:35:09');
    expect(formatDateLabel('2026-11-04', 'UTC')).toBe('Wednesday, November 4');
    expect(formatDateLabel('2026-11-04', 'Asia/Tehran')).toBe('Wednesday, November 4');
  });
});

describe('interval duration and daily history', () => {
  it('ignores reversed and zero-length intervals and clamps negative duration', () => {
    expect(splitIntervalByDay(100, 100, 'UTC')).toEqual([]);
    expect(splitIntervalByDay(200, 100, 'UTC')).toEqual([]);
    expect(getSessionDurationMs([makeInterval('negative', 's', 200, 100)], 300)).toBe(0);
  });

  it('uses now for open intervals and aggregates multiple intervals on a day', () => {
    const start = Date.UTC(2026, 10, 3, 20);
    const end = Date.UTC(2026, 10, 3, 21);
    const session = makeSession('s', start);
    const intervals = [
      makeInterval('open', 's', start, null),
      makeInterval('second', 's', start + 60_000, start + 120_000)
    ];
    expect(getSessionDurationMs([intervals[0]], end)).toBe(end - start);
    const history = buildDailyHistory([session], intervals, DEFAULT_TIME_ZONE, end);
    expect(history).toHaveLength(2);
    expect(history[0].durationMs).toBe(30 * 60 * 1000);
    expect(history[1].durationMs).toBe(31 * 60 * 1000);
  });

  it('ignores orphan intervals and keeps sessions without intervals at zero duration', () => {
    const startedAt = Date.UTC(2026, 10, 4, 8);
    const session = makeSession('no-interval', startedAt);
    const invalid = makeInterval('invalid', 'missing-invalid', startedAt, startedAt);
    const orphan = makeInterval('orphan', 'missing', startedAt, startedAt + 1000);
    const result = buildDailyHistory([session], [invalid, orphan], DEFAULT_TIME_ZONE, startedAt);
    expect(result).toHaveLength(1);
    expect(result[0].durationMs).toBe(0);
    expect(result[0].sessions[0].session.id).toBe(session.id);
  });

  it('sorts dates and sessions newest-first', () => {
    const first = Date.UTC(2026, 10, 4, 8);
    const later = first + 3_600_000;
    const nextDay = first + 86_400_000;
    const sessions = [makeSession('early', first), makeSession('late', later), makeSession('tomorrow', nextDay)];
    const intervals = sessions.map((session) => makeInterval('i-' + session.id, session.id, session.startedAt, session.startedAt + 1000));
    const result = buildDailyHistory(sessions, intervals, DEFAULT_TIME_ZONE, nextDay);
    expect(result.map((day) => day.date)).toEqual(['2026-11-05', '2026-11-04']);
    expect(result[1].sessions.map((entry) => entry.session.id)).toEqual(['late', 'early']);
  });

  it('keeps a session with no interval visible as a zero-duration day', () => {
    const startedAt = Date.UTC(2026, 10, 4, 8);
    const result = buildDailyHistory([makeSession('zero', startedAt)], [], DEFAULT_TIME_ZONE, startedAt);
    expect(result[0].sessions[0].durationMs).toBe(0);
  });
});
