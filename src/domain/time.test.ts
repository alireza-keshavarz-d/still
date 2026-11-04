import { describe, expect, it } from 'vitest';
import { buildDailyHistory, formatDuration, getDateKey, splitIntervalByDay } from './time';
import { DEFAULT_TIME_ZONE } from './types';
import type { StudyInterval, StudySession } from './types';

describe('Tehran time accounting', () => {
  it('uses the reporting timezone for calendar dates', () => {
    expect(getDateKey(Date.UTC(2026, 10, 3, 20, 59), DEFAULT_TIME_ZONE)).toBe('2026-11-04');
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
    const session: StudySession = {
      id: 's1', title: 'Study', note: '', status: 'completed',
      startedAt: start, endedAt: end, timezone: DEFAULT_TIME_ZONE, createdAt: 0, updatedAt: 0
    };
    const interval: StudyInterval = {
      id: 'i1', sessionId: 's1', startedAt: start, endedAt: end, checkpointAt: end
    };
    expect(buildDailyHistory([session], [interval], DEFAULT_TIME_ZONE).map((day) => day.durationMs))
      .toEqual([30 * 60 * 1000, 30 * 60 * 1000]);
  });

  it('formats elapsed duration', () => {
    expect(formatDuration(3_661_999)).toBe('01:01:01');
  });
});