import { describe, expect, it } from 'vitest';
import { findDueReminders, getReminderDueAt } from './reminderService';
import type { PlannedSession } from '../domain/planning/types';

const planned = (overrides: Partial<PlannedSession> = {}): PlannedSession => ({
  id: 'p1', planId: null, title: 'Review', activityId: null, note: '', subjectName: null, topicName: null,
  status: 'scheduled', schedulingMode: 'fixed', scheduledDate: '2026-11-05', scheduledTime: '10:00',
  timezone: 'Asia/Tehran', predecessorId: null, intervalDays: null, estimatedDurationMinutes: null,
  studySessionId: null, completedAt: null, reminderEnabled: true, reminderMinutesBefore: 15,
  reminderTime: null, reminderNotifiedAt: null, skippedAt: null, cancelledAt: null, createdAt: 0, updatedAt: 0,
  ...overrides
});

describe('pre-session reminders', () => {
  it('calculates reminder instants in the planned session timezone', () => {
    expect(getReminderDueAt(planned())).toBe(Date.UTC(2026, 10, 5, 5, 15));
  });
  it('supports date-only plans with an explicit reminder time', () => {
    expect(getReminderDueAt(planned({ scheduledTime: null, reminderMinutesBefore: null, reminderTime: '09:00' })))
      .toBe(Date.UTC(2026, 10, 5, 5, 30));
    expect(getReminderDueAt(planned({ scheduledTime: null, reminderTime: null }))).toBeNull();
  });
  it('does not notify disabled, terminal, or already-notified activities', () => {
    expect(getReminderDueAt(planned({ reminderEnabled: false }))).toBeNull();
    expect(getReminderDueAt(planned({ status: 'completed' }))).toBeNull();
    expect(getReminderDueAt(planned({ reminderNotifiedAt: 10 }))).toBeNull();
  });
  it('returns reminders due in the requested polling window only', () => {
    const due = getReminderDueAt(planned())!;
    expect(findDueReminders([planned()], due - 1, due)).toHaveLength(1);
    expect(findDueReminders([planned()], due, due + 1000)).toHaveLength(0);
  });
  it('rejects nonexistent local wall-clock times during a daylight-saving transition', () => {
    expect(() => getReminderDueAt(planned({ scheduledDate: '2026-03-08', scheduledTime: '02:30', timezone: 'America/New_York' }))).toThrow();
  });
});
