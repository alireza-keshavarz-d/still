import type { PlannedSession } from './types';
import { recalculateRelativeSessions } from './scheduling';
import { isValidDateKey } from './dateMath';

export type SkipStrategy = 'keep-dates' | 'recalculate';

export function skipPlannedSession(items: PlannedSession[], id: string, strategy: SkipStrategy, now: number): PlannedSession[] {
  const target = items.find((item) => item.id === id);
  if (!target || target.status !== 'scheduled') throw new Error('Only a scheduled activity can be skipped.');
  let next = items.map((item) => item.id === id
    ? { ...item, status: 'skipped' as const, skippedAt: now, updatedAt: now }
    : { ...item });
  if (strategy === 'recalculate') {
    const byId = new Map(items.map((item) => [item.id, item]));
    let predecessorId = target.predecessorId;
    while (predecessorId) {
      const predecessor = byId.get(predecessorId);
      if (!predecessor || (predecessor.status !== 'skipped' && predecessor.status !== 'cancelled')) break;
      predecessorId = predecessor.predecessorId;
    }
    next = next.map((item) => item.predecessorId === id
      ? { ...item, predecessorId, schedulingMode: predecessorId ? item.schedulingMode : 'fixed', intervalDays: predecessorId ? item.intervalDays : null }
      : item);
    next = recalculateRelativeSessions(next);
  }
  return next;
}

export function cancelPlannedSession(items: PlannedSession[], id: string, now: number): PlannedSession[] {
  const target = items.find((item) => item.id === id);
  if (!target || !['scheduled', 'in_progress'].includes(target.status)) throw new Error('This activity cannot be cancelled.');
  return items.map((item) => item.id === id ? { ...item, status: 'cancelled' as const, cancelledAt: now, updatedAt: now } : item);
}

export function reschedulePlannedSession(items: PlannedSession[], id: string, date: string, cascade: boolean): PlannedSession[] {
  if (!isValidDateKey(date)) throw new Error('A valid scheduled date is required.');
  const target = items.find((item) => item.id === id);
  if (!target || target.status !== 'scheduled') throw new Error('Only a scheduled activity can be rescheduled.');
  const next = items.map((item) => item.id === id ? { ...item, scheduledDate: date, reminderNotifiedAt: null } : { ...item });
  return cascade ? recalculateRelativeSessions(next) : next;
}
