import type { StudyInterval, StudySession } from './types';
import { DEFAULT_TIME_ZONE } from './types';
import { getDateKey, splitIntervalByDay } from './time';

export type AnalyticsRange = '7d' | '30d' | '90d' | 'all';
export interface DailyAnalyticsPoint { date: string; durationMs: number; sessionCount: number }
export interface ActivityAnalyticsPoint { activityId: string; title: string; durationMs: number; sessionCount: number }
export interface StudyAnalytics {
  range: AnalyticsRange; startDate: string; endDate: string; totalDurationMs: number;
  averageDailyDurationMs: number; activeDays: number; sessionCount: number;
  averageSessionDurationMs: number; longestSessionMs: number; bestDay: DailyAnalyticsPoint | null;
  currentStreak: number; longestStreak: number; daily: DailyAnalyticsPoint[]; activities: ActivityAnalyticsPoint[];
}
function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days, 12));
  return [value.getUTCFullYear(), String(value.getUTCMonth() + 1).padStart(2, '0'), String(value.getUTCDate()).padStart(2, '0')].join('-');
}
function streaks(activeDates: Set<string>, today: string) {
  let longest = 0, run = 0, previous = '';
  for (const date of [...activeDates].sort()) {
    run = previous && shiftDate(previous, 1) === date ? run + 1 : 1;
    longest = Math.max(longest, run); previous = date;
  }
  let cursor = activeDates.has(today) ? today : shiftDate(today, -1), current = 0;
  while (activeDates.has(cursor)) { current += 1; cursor = shiftDate(cursor, -1); }
  return { current, longest };
}
export function buildStudyAnalytics(
  sessions: StudySession[], intervals: StudyInterval[], range: AnalyticsRange = '30d',
  now = Date.now(), timeZone = DEFAULT_TIME_ZONE
): StudyAnalytics {
  const today = getDateKey(now, timeZone);
  const firstSessionDate = sessions.length ? sessions.reduce((earliest, session) => Math.min(earliest, session.startedAt), now) : now;
  const startDate = range === 'all' ? getDateKey(firstSessionDate, timeZone) : shiftDate(today, -(Number.parseInt(range, 10) - 1));
  const dayCount = range === 'all'
    ? Math.max(1, Math.round((Date.parse(today + 'T12:00:00Z') - Date.parse(startDate + 'T12:00:00Z')) / 86400000) + 1)
    : Number.parseInt(range, 10);
  const sessionsById = new Map(sessions.map((session) => [session.id, session]));
  const dailyMap = new Map<string, DailyAnalyticsPoint>();
  const activityMap = new Map<string, ActivityAnalyticsPoint>();
  const sessionDurations = new Map<string, number>();
  for (const interval of intervals) {
    const session = sessionsById.get(interval.sessionId);
    if (!session) continue;
    sessionDurations.set(session.id, (sessionDurations.get(session.id) ?? 0) + Math.max(0, (interval.endedAt ?? now) - interval.startedAt));
    for (const slice of splitIntervalByDay(interval.startedAt, interval.endedAt ?? now, timeZone)) {
      if (slice.date < startDate || slice.date > today) continue;
      const day = dailyMap.get(slice.date) ?? { date: slice.date, durationMs: 0, sessionCount: 0 };
      day.durationMs += slice.durationMs; dailyMap.set(slice.date, day);
      const activity = activityMap.get(session.activityId) ?? { activityId: session.activityId, title: session.title, durationMs: 0, sessionCount: 0 };
      activity.durationMs += slice.durationMs; activityMap.set(session.activityId, activity);
    }
  }
  const rangeSessions = sessions.filter((session) => {
    const date = getDateKey(session.startedAt, timeZone); return date >= startDate && date <= today;
  });
  for (const session of rangeSessions) {
    const date = getDateKey(session.startedAt, timeZone);
    const day = dailyMap.get(date) ?? { date, durationMs: 0, sessionCount: 0 };
    day.sessionCount += 1; dailyMap.set(date, day);
    const activity = activityMap.get(session.activityId) ?? { activityId: session.activityId, title: session.title, durationMs: 0, sessionCount: 0 };
    activity.sessionCount += 1; activityMap.set(session.activityId, activity);
  }
  const daily = Array.from({ length: dayCount }, (_, index) => {
    const date = shiftDate(startDate, index);
    return dailyMap.get(date) ?? { date, durationMs: 0, sessionCount: 0 };
  }).filter((point) => point.date <= today);
  const totalDurationMs = daily.reduce((sum, day) => sum + day.durationMs, 0);
  const activeDays = daily.filter((day) => day.durationMs > 0).length;
  const durations = rangeSessions.map((session) => sessionDurations.get(session.id) ?? 0);
  const { current: currentStreak, longest: longestStreak } = streaks(new Set(daily.filter((day) => day.durationMs > 0).map((day) => day.date)), today);
  return {
    range, startDate, endDate: today, totalDurationMs,
    averageDailyDurationMs: totalDurationMs / Math.max(1, daily.length), activeDays, sessionCount: rangeSessions.length,
    averageSessionDurationMs: durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : 0,
    longestSessionMs: durations.length ? Math.max(...durations) : 0,
    bestDay: daily.filter((day) => day.durationMs > 0).sort((a, b) => b.durationMs - a.durationMs)[0] ?? null,
    currentStreak, longestStreak, daily,
    activities: [...activityMap.values()].sort((a, b) => b.durationMs - a.durationMs)
  };
}
