import { describe, expect, it } from 'vitest';
import { buildStudyAnalytics } from './analytics';
import type { StudyInterval, StudySession } from './types';
const day = (value: string) => new Date(value + 'T08:00:00+03:30').getTime();
const sessions: StudySession[] = [
  { id: 'a', activityId: 'math', title: 'Math', note: '', status: 'completed', startedAt: day('2026-11-04'), endedAt: day('2026-11-04') + 3600000, timezone: 'Asia/Tehran', createdAt: 0, updatedAt: 0 },
  { id: 'b', activityId: 'read', title: 'Reading', note: '', status: 'completed', startedAt: day('2026-11-05'), endedAt: day('2026-11-05') + 1800000, timezone: 'Asia/Tehran', createdAt: 0, updatedAt: 0 }
];
const intervals: StudyInterval[] = [
  { id: 'ia', sessionId: 'a', startedAt: day('2026-11-04'), endedAt: day('2026-11-04') + 3600000, checkpointAt: 0 },
  { id: 'ib', sessionId: 'b', startedAt: day('2026-11-05'), endedAt: day('2026-11-05') + 1800000, checkpointAt: 0 }
];
describe('buildStudyAnalytics', () => {
  it('aggregates totals, averages, best day and activity breakdown', () => {
    const result = buildStudyAnalytics(sessions, intervals, '7d', day('2026-11-06'));
    expect(result.totalDurationMs).toBe(5400000); expect(result.sessionCount).toBe(2);
    expect(result.activeDays).toBe(2); expect(result.averageDailyDurationMs).toBe(5400000 / 7);
    expect(result.bestDay?.date).toBe('2026-11-04'); expect(result.activities.map((item) => item.title)).toEqual(['Math', 'Reading']);
  });
  it('calculates current and longest streaks', () => {
    const result = buildStudyAnalytics(sessions, intervals, 'all', day('2026-11-06'));
    expect(result.currentStreak).toBe(2); expect(result.longestStreak).toBe(2);
  });
  it('counts open intervals through now and ignores orphan intervals', () => {
    const running = { ...sessions[1], id: 'running', status: 'running' as const };
    const open: StudyInterval = { id: 'open', sessionId: 'running', startedAt: day('2026-11-06'), endedAt: null, checkpointAt: day('2026-11-06') };
    const orphan: StudyInterval = { ...open, id: 'orphan', sessionId: 'missing' };
    expect(buildStudyAnalytics([running], [open, orphan], '7d', day('2026-11-06') + 900000).totalDurationMs).toBe(900000);
  });
  it('returns a zero state for empty history', () => {
    const result = buildStudyAnalytics([], [], '30d', day('2026-11-06'));
    expect(result.totalDurationMs).toBe(0); expect(result.activeDays).toBe(0); expect(result.bestDay).toBeNull(); expect(result.currentStreak).toBe(0);
  });
});


describe('buildStudyAnalytics edge cases', () => {
  it('excludes interval slices and sessions outside the selected date range', () => {
    const inRange = { ...sessions[0], id: 'in', activityId: 'writing', title: 'Writing' };
    const old = { ...sessions[0], id: 'old', startedAt: day('2026-10-01') };
    const future = { ...sessions[1], id: 'future', startedAt: day('2026-11-10') };
    const extraIntervals: StudyInterval[] = [
      { id: 'old-i', sessionId: 'old', startedAt: day('2026-10-01'), endedAt: day('2026-10-01') + 600_000, checkpointAt: 0 },
      { id: 'future-i', sessionId: 'future', startedAt: day('2026-11-10'), endedAt: day('2026-11-10') + 600_000, checkpointAt: 0 }
    ];
    const result = buildStudyAnalytics([inRange, old, future], extraIntervals, '7d', day('2026-11-06'));
    expect(result.sessionCount).toBe(1);
    expect(result.activities).toEqual([
      { activityId: 'writing', title: 'Writing', durationMs: 0, sessionCount: 1 }
    ]);
    expect(result.totalDurationMs).toBe(0);
    expect(result.bestDay).toBeNull();
    expect(result.averageSessionDurationMs).toBe(0);
    expect(result.longestSessionMs).toBe(0);
  });

  it('returns a one-day all-time range for future-only sessions and ignores invalid duration', () => {
    const future = { ...sessions[0], id: 'future-only', startedAt: day('2026-11-10') };
    const result = buildStudyAnalytics([future], [], 'all', day('2026-11-06'));
    expect(result.startDate).toBe('2026-11-06');
    expect(result.endDate).toBe('2026-11-06');
    expect(result.daily).toEqual([{ date: '2026-11-06', durationMs: 0, sessionCount: 0 }]);
    expect(result.sessionCount).toBe(0);
    expect(result.activities).toEqual([]);
    expect(result.averageDailyDurationMs).toBe(0);
  });

  it('counts active dates across gaps and treats yesterday as an ongoing current streak', () => {
    const days = ['2026-11-02', '2026-11-04', '2026-11-05'];
    const activeSessions = days.map((date, index) => ({
      id: 'streak-' + index, activityId: 'study', title: 'Study', note: '',
      status: 'completed' as const, startedAt: day(date), endedAt: day(date) + 60_000,
      timezone: 'Asia/Tehran', createdAt: 0, updatedAt: 0
    }));
    const activeIntervals: StudyInterval[] = activeSessions.map((session) => ({
      id: 'interval-' + session.id, sessionId: session.id,
      startedAt: session.startedAt, endedAt: session.startedAt + 60_000, checkpointAt: 0
    }));
    const result = buildStudyAnalytics(activeSessions, activeIntervals, 'all', day('2026-11-06'));
    expect(result.currentStreak).toBe(2);
    expect(result.longestStreak).toBe(2);
    expect(result.activeDays).toBe(3);
  });
});
