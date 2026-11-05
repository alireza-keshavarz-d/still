import { database } from './database';
import type { PlannedSession, PlannedSessionInput, StudyPlan } from '../domain/planning/types';
import { validatePlannedSession } from '../domain/planning/validation';
import { validateDependencyGraph } from '../domain/planning/dependencies';
import { recalculateRelativeSessions } from '../domain/planning/scheduling';
import { cancelPlannedSession, reschedulePlannedSession, skipPlannedSession, type SkipStrategy } from '../domain/planning/transitions';

const id = (): string => crypto.randomUUID();

function toPlannedSession(input: PlannedSessionInput, now: number): PlannedSession {
  validatePlannedSession(input);
  return {
    id: input.id ?? id(), planId: input.planId ?? null, title: input.title.trim(), activityId: input.activityId ?? null,
    note: input.note ?? '', subjectName: input.subjectName ?? null, topicName: input.topicName ?? null,
    status: 'scheduled', schedulingMode: input.schedulingMode ?? 'fixed',
    scheduledDate: input.scheduledDate, scheduledTime: input.scheduledTime ?? null, timezone: input.timezone,
    predecessorId: input.predecessorId ?? null, intervalDays: input.intervalDays ?? null,
    estimatedDurationMinutes: input.estimatedDurationMinutes ?? null, studySessionId: null, completedAt: null,
    reminderEnabled: input.reminderEnabled ?? Boolean(input.scheduledTime || input.reminderTime), reminderMinutesBefore: input.reminderMinutesBefore ?? (input.scheduledTime ? 15 : null),
    reminderTime: input.reminderTime ?? null, skippedAt: null, cancelledAt: null, createdAt: now, updatedAt: now
  };
}

async function persistRecalculation(items: PlannedSession[], now: number): Promise<void> {
  const updated = recalculateRelativeSessions(items);
  await Promise.all(updated.map((item) => database.plannedSessions.put({ ...item, updatedAt: item.scheduledDate !== items.find((x) => x.id === item.id)?.scheduledDate ? now : item.updatedAt })));
}

export async function createStudyPlan(title: string, inputs: PlannedSessionInput[], now = Date.now()): Promise<StudyPlan> {
  if (!title.trim()) throw new Error('Plan title is required.');
  if (inputs.length === 0) throw new Error('Add at least one planned activity.');
  const plan: StudyPlan = { id: id(), title: title.trim(), status: 'active', subjectName: inputs[0].subjectName ?? null, topicName: inputs[0].topicName ?? null, createdAt: now, updatedAt: now };
  const sessions = inputs.map((input) => toPlannedSession({ ...input, planId: plan.id }, now));
  validateDependencyGraph(sessions);
  await database.transaction('rw', database.studyPlans, database.plannedSessions, async () => {
    await database.studyPlans.add(plan);
    await database.plannedSessions.bulkAdd(sessions);
  });
  return plan;
}

export async function createPlannedSession(input: PlannedSessionInput, now = Date.now()): Promise<PlannedSession> {
  const session = toPlannedSession(input, now);
  await database.transaction('rw', database.studyPlans, database.plannedSessions, async () => {
    if (session.planId && !await database.studyPlans.get(session.planId)) throw new Error('Study plan does not exist.');
    if (session.predecessorId && !await database.plannedSessions.get(session.predecessorId)) throw new Error('Predecessor does not exist.');
    const existing = await database.plannedSessions.toArray();
    validateDependencyGraph([...existing, session]);
    await database.plannedSessions.add(session);
  });
  return session;
}

export async function updatePlannedSession(id: string, changes: Partial<PlannedSessionInput>, now = Date.now()): Promise<void> {
  await database.transaction('rw', database.plannedSessions, async () => {
    const current = await database.plannedSessions.get(id);
    if (!current) throw new Error('Planned activity does not exist.');
    if (current.status !== 'scheduled') throw new Error('Only scheduled activities can be edited.');
    const nextInput: PlannedSessionInput = { ...current, ...changes, title: changes.title ?? current.title, scheduledDate: changes.scheduledDate ?? current.scheduledDate, timezone: changes.timezone ?? current.timezone };
    validatePlannedSession(nextInput);
    const all = await database.plannedSessions.toArray();
    const next = { ...current, ...changes, id: current.id, updatedAt: now } as PlannedSession;
    validateDependencyGraph(all.map((item) => item.id === id ? next : item));
    await database.plannedSessions.put(next);
  });
}

export async function getPlannedSessionsBetween(startDate: string, endDate: string): Promise<PlannedSession[]> {
  return database.plannedSessions.where('scheduledDate').between(startDate, endDate, true, true).sortBy('scheduledDate');
}
export async function getPlannedSessionsForPlan(planId: string): Promise<PlannedSession[]> {
  return database.plannedSessions.where('planId').equals(planId).sortBy('scheduledDate');
}
export async function getAllStudyPlans(): Promise<StudyPlan[]> { return database.studyPlans.orderBy('updatedAt').reverse().toArray(); }
export async function getAllPlannedSessions(): Promise<PlannedSession[]> { return database.plannedSessions.orderBy('scheduledDate').toArray(); }

export async function skipSession(id: string, strategy: SkipStrategy, now = Date.now()): Promise<void> {
  await database.transaction('rw', database.plannedSessions, async () => {
    const all = await database.plannedSessions.toArray();
    const next = skipPlannedSession(all, id, strategy, now);
    await database.plannedSessions.bulkPut(next);
  });
}
export async function cancelSession(id: string, now = Date.now()): Promise<void> {
  await database.transaction('rw', database.plannedSessions, async () => {
    const all = await database.plannedSessions.toArray();
    await database.plannedSessions.bulkPut(cancelPlannedSession(all, id, now));
  });
}
export async function rescheduleSession(id: string, date: string, cascade: boolean, now = Date.now()): Promise<void> {
  await database.transaction('rw', database.plannedSessions, async () => {
    const all = await database.plannedSessions.toArray();
    const next = reschedulePlannedSession(all, id, date, cascade);
    await database.plannedSessions.bulkPut(next.map((item) => ({ ...item, updatedAt: now })));
  });
}
export async function recalculatePlan(planId: string, now = Date.now()): Promise<void> {
  await database.transaction('rw', database.plannedSessions, async () => {
    const items = await database.plannedSessions.where('planId').equals(planId).toArray();
    await persistRecalculation(items, now);
  });
}
