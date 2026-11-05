import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { database } from './database';
import { createPlannedSession, createStudyPlan, getAllPlannedSessions, getAllStudyPlans, updatePlannedSession, skipSession, cancelSession } from './planningRepository';
import { getAllSessions, startPlannedSession, stopSession } from './sessionRepository';

describe('study planning persistence', () => {
  beforeEach(async () => { await database.delete(); await database.open(); });
  afterEach(async () => { await database.delete(); });

  it('creates plans and planned sessions transactionally', async () => {
    const plan = await createStudyPlan('Cell biology', [{ title: 'Read chapter', scheduledDate: '2026-11-05', timezone: 'Asia/Tehran' }], 100);
    expect((await getAllStudyPlans()).map(x => x.id)).toEqual([plan.id]);
    const items = await getAllPlannedSessions();
    expect(items).toHaveLength(1);
    expect(items[0].planId).toBe(plan.id);
    expect(items[0].status).toBe('scheduled');
  });

  it('creates a standalone planned session without requiring a plan', async () => {
    const item = await createPlannedSession({ title: 'Practice questions', scheduledDate: '2026-11-08', timezone: 'Asia/Tehran' }, 100);
    expect(item.planId).toBeNull();
    expect((await getAllPlannedSessions())[0].title).toBe('Practice questions');
  });

  it('links a planned activity to exactly one actual session and completes it with recalculation', async () => {
    const plan = await createStudyPlan('Revision', [{ title: 'Read', scheduledDate: '2026-11-01', timezone: 'Asia/Tehran' }], 100);
    const planned = (await getAllPlannedSessions())[0];
    const actual = await startPlannedSession(planned.id, Date.UTC(2026, 10, 5, 9));
    expect(actual.plannedSessionId).toBe(planned.id);
    expect((await getAllSessions()).filter(x => x.plannedSessionId === planned.id)).toHaveLength(1);
    await expect(startPlannedSession(planned.id, Date.UTC(2026, 10, 5, 10))).rejects.toThrow();
    await stopSession(actual.id, Date.UTC(2026, 10, 5, 10));
    const completed = (await getAllPlannedSessions()).find(x => x.id === planned.id);
    expect(completed?.status).toBe('completed');
    expect(completed?.completedAt).toBe(Date.UTC(2026, 10, 5, 10));
    expect((await getAllStudyPlans()).find(x => x.id === plan.id)?.status).toBe('completed');
    const secondPlan = await createStudyPlan('Cancel review', [{ title: 'Review', scheduledDate: '2026-11-02', timezone: 'Asia/Tehran' }], 300);
    const secondItem = (await getAllPlannedSessions()).find(x => x.planId === secondPlan.id)!;
    await cancelSession(secondItem.id, 400);
    expect((await getAllStudyPlans()).find(x => x.id === secondPlan.id)?.status).toBe('completed');
  });

  it('rejects invalid planned activity data without persisting it', async () => {
    await expect(createPlannedSession({ title: ' ', scheduledDate: '2026-11-01', timezone: 'Asia/Tehran' })).rejects.toThrow();
    expect(await getAllPlannedSessions()).toHaveLength(0);
  });
  it('edits a scheduled activity and recalculates or preserves its dependencies as requested', async () => {
    const firstId = crypto.randomUUID();
    const secondId = crypto.randomUUID();
    await createStudyPlan('Exam preparation', [
      { id: firstId, title: 'Read', scheduledDate: '2026-11-01', timezone: 'Asia/Tehran' },
      { id: secondId, title: 'Practice', scheduledDate: '2026-11-04', timezone: 'Asia/Tehran', schedulingMode: 'relative', predecessorId: firstId, intervalDays: 3 }
    ], 100);
    await updatePlannedSession(firstId, { title: 'Read notes' }, 200);
    expect((await getAllPlannedSessions()).find(x => x.id === firstId)?.title).toBe('Read notes');
    await expect(updatePlannedSession(firstId, { scheduledDate: '2026-02-30' })).rejects.toThrow();
  });

  it('marks plans complete when all activities are skipped or cancelled', async () => {
    const plan = await createStudyPlan('Optional review', [{ title: 'Review', scheduledDate: '2026-11-01', timezone: 'Asia/Tehran' }], 100);
    const planned = (await getAllPlannedSessions())[0];
    await skipSession(planned.id, 'keep-dates', 200);
    expect((await getAllStudyPlans()).find(x => x.id === plan.id)?.status).toBe('completed');
  });

  it('upgrades v2 data to v3 without changing existing session and interval records', async () => {
    const name = 'still-v3-migration-' + crypto.randomUUID();
    const legacy = new Dexie(name);
    legacy.version(1).stores({ sessions: 'id, status, startedAt, endedAt, updatedAt', intervals: 'id, sessionId, startedAt, endedAt, checkpointAt' });
    legacy.version(2).stores({ sessions: 'id, activityId, status, startedAt, endedAt, updatedAt', intervals: 'id, sessionId, startedAt, endedAt, checkpointAt', activities: 'id, &normalizedName, name, createdAt, archivedAt' });
    await legacy.open();
    const session = { id: 's1', activityId: 'a1', title: 'Legacy', note: '', status: 'completed', startedAt: 10, endedAt: 20, timezone: 'Asia/Tehran', createdAt: 10, updatedAt: 20 };
    const interval = { id: 'i1', sessionId: 's1', startedAt: 10, endedAt: 20, checkpointAt: 20 };
    await legacy.table('sessions').add(session);
    await legacy.table('intervals').add(interval);
    legacy.close();
    const upgraded = new Dexie(name);
    upgraded.version(1).stores({ sessions: 'id, status, startedAt, endedAt, updatedAt', intervals: 'id, sessionId, startedAt, endedAt, checkpointAt' });
    upgraded.version(2).stores({ sessions: 'id, activityId, status, startedAt, endedAt, updatedAt', intervals: 'id, sessionId, startedAt, endedAt, checkpointAt', activities: 'id, &normalizedName, name, createdAt, archivedAt' });
    upgraded.version(3).stores({ sessions: 'id, activityId, plannedSessionId, status, startedAt, endedAt, updatedAt', intervals: 'id, sessionId, startedAt, endedAt, checkpointAt', activities: 'id, &normalizedName, name, createdAt, archivedAt', studyPlans: 'id, status, createdAt, updatedAt', plannedSessions: 'id, planId, scheduledDate, status, predecessorId, studySessionId, [planId+scheduledDate]' });
    try {
      await upgraded.open();
      expect(await upgraded.table('sessions').get('s1')).toEqual(session);
      expect(await upgraded.table('intervals').get('i1')).toEqual(interval);
      expect(await upgraded.table('studyPlans').toArray()).toEqual([]);
      expect(await upgraded.table('plannedSessions').toArray()).toEqual([]);
    } finally { await upgraded.delete(); }
  });

});
