import { describe, expect, it } from 'vitest';
import { addCalendarDays, dateKeyAt, monthGridDates, isValidDateKey } from './dateMath';
import { validatePlannedSession } from './validation';
import { validateDependencyGraph } from './dependencies';
import { recalculateRelativeSessions } from './scheduling';
import { skipPlannedSession, reschedulePlannedSession } from './transitions';
import type { PlannedSession, PlannedSessionInput } from './types';

const item = (id: string, overrides: Partial<PlannedSession> = {}): PlannedSession => ({
  id, planId: 'p', title: id, activityId: null, note: '', subjectName: null, topicName: null,
  status: 'scheduled', schedulingMode: 'fixed', scheduledDate: '2026-11-01', scheduledTime: null,
  timezone: 'Asia/Tehran', predecessorId: null, intervalDays: null, estimatedDurationMinutes: null,
  studySessionId: null, completedAt: null, reminderEnabled: false, reminderMinutesBefore: null,
  reminderTime: null, skippedAt: null, cancelledAt: null, createdAt: 0, updatedAt: 0, ...overrides
});

describe('planning date math', () => {
  it('validates dates and handles leap days and year boundaries', () => {
    expect(isValidDateKey('2024-02-29')).toBe(true);
    expect(isValidDateKey('2026-02-29')).toBe(false);
    expect(addCalendarDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addCalendarDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(() => addCalendarDays('2026-02-30', 1)).toThrow();
    expect(() => addCalendarDays('2026-01-01', 1.5)).toThrow();
  });
  it('builds six complete weeks and handles a timezone date boundary', () => {
    expect(monthGridDates('2026-11')).toHaveLength(42);
    expect(dateKeyAt(Date.UTC(2026, 10, 3, 22), 'Asia/Tehran')).toBe('2026-11-04');
    expect(() => monthGridDates('2026-13')).toThrow();
  });
});

describe('planned session validation', () => {
  const valid: PlannedSessionInput = { title: 'Read chapter', scheduledDate: '2026-11-05', timezone: 'Asia/Tehran' };
  it('requires title, valid date and timezone', () => {
    expect(() => validatePlannedSession({ ...valid, title: ' ' })).toThrow(/title/);
    expect(() => validatePlannedSession({ ...valid, scheduledDate: '2026-02-30' })).toThrow(/date/);
    expect(() => validatePlannedSession({ ...valid, timezone: 'Mars/Olympus' })).toThrow(/timezone/);
  });
  it('validates relative rules, time and duration', () => {
    expect(() => validatePlannedSession({ ...valid, schedulingMode: 'relative' })).toThrow(/predecessor/);
    expect(() => validatePlannedSession({ ...valid, schedulingMode: 'relative', predecessorId: 'p', intervalDays: 0 })).toThrow(/calendar day/);
    expect(() => validatePlannedSession({ ...valid, scheduledTime: '25:90' })).toThrow(/time/);
    expect(() => validatePlannedSession({ ...valid, estimatedDurationMinutes: 1441 })).toThrow(/duration/);
    expect(() => validatePlannedSession({ ...valid, reminderMinutesBefore: -1 })).toThrow(/Reminder/);
  });
});

describe('dependency scheduling and transitions', () => {
  it('rejects missing, self and cyclic predecessors', () => {
    expect(() => validateDependencyGraph([item('a', { predecessorId: 'missing' })])).toThrow(/missing/);
    expect(() => validateDependencyGraph([item('a', { predecessorId: 'a' })])).toThrow(/itself/);
    expect(() => validateDependencyGraph([item('a', { predecessorId: 'b' }), item('b', { predecessorId: 'a' })])).toThrow(/cycles/);
  });
  it('recalculates downstream relative dates from actual completion and preserves fixed or terminal dates', () => {
    const items = [
      item('a', { status: 'completed', completedAt: Date.UTC(2026, 10, 5) }),
      item('b', { schedulingMode: 'relative', predecessorId: 'a', intervalDays: 3 }),
      item('c', { schedulingMode: 'relative', predecessorId: 'b', intervalDays: 7 }),
      item('fixed', { scheduledDate: '2026-11-20' }),
      item('done', { status: 'completed', schedulingMode: 'relative', predecessorId: 'a', intervalDays: 2 })
    ];
    const result = recalculateRelativeSessions(items);
    expect(result.find(x => x.id === 'b')?.scheduledDate).toBe('2026-11-08');
    expect(result.find(x => x.id === 'c')?.scheduledDate).toBe('2026-11-15');
    expect(result.find(x => x.id === 'fixed')?.scheduledDate).toBe('2026-11-20');
    expect(result.find(x => x.id === 'done')?.scheduledDate).toBe('2026-11-01');
  });
  it('skips without changing dates or removes skipped node from the chain when requested', () => {
    const items = [item('a'), item('b', { predecessorId: 'a', schedulingMode: 'relative', intervalDays: 3 }), item('c', { predecessorId: 'b', schedulingMode: 'relative', intervalDays: 2 })];
    expect(skipPlannedSession(items, 'b', 'keep-dates', 50).find(x => x.id === 'c')?.predecessorId).toBe('b');
    const recalculated = skipPlannedSession(items, 'b', 'recalculate', 50);
    expect(recalculated.find(x => x.id === 'c')?.predecessorId).toBe('a');
  });
  it('reschedules selected item and optionally recalculates descendants', () => {
    const items = [item('a'), item('b', { predecessorId: 'a', schedulingMode: 'relative', intervalDays: 3 })];
    expect(reschedulePlannedSession(items, 'a', '2026-11-10', false).find(x => x.id === 'b')?.scheduledDate).toBe('2026-11-01');
    expect(reschedulePlannedSession(items, 'a', '2026-11-10', true).find(x => x.id === 'b')?.scheduledDate).toBe('2026-11-13');
  });
});
