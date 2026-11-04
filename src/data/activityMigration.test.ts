import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { migrateLegacySessions, upgradeLegacyActivityRecords } from './activityMigration';

describe('legacy activity migration', () => {
  it('groups equivalent titles and preserves historical title snapshots', () => {
    const result = migrateLegacySessions([
      { id: '1', title: 'Programming', startedAt: 100, updatedAt: 120 },
      { id: '2', title: ' programming ', startedAt: 200, updatedAt: 220 },
      { id: '3', title: 'PROGRAMMING', startedAt: 300, updatedAt: 330 }
    ], (() => { let id = 0; return () => String(++id); })());

    expect(result.activities).toHaveLength(1);
    expect(result.activities[0].name).toBe('Programming');
    expect(result.sessions.map((session) => session.activityId)).toEqual(['1', '1', '1']);
    expect(result.sessions.map((session) => session.title)).toEqual([
      'Programming', ' programming ', 'PROGRAMMING'
    ]);
    expect(result.activities[0].createdAt).toBe(100);
  });

  it('maps blank legacy titles to one Uncategorized activity without rewriting snapshots', () => {
    const result = migrateLegacySessions([
      { id: '1', title: '' },
      { id: '2', title: '   ' },
      { id: '3', title: null }
    ], (() => { let id = 0; return () => String(++id); })());

    expect(result.activities).toHaveLength(1);
    expect(result.activities[0].name).toBe('Uncategorized');
    expect(result.sessions.map((session) => session.activityId)).toEqual(['1', '1', '1']);
    expect(result.sessions.map((session) => session.title)).toEqual(['', '   ', null]);
  });

  it('creates independent activity identities for distinct normalized titles', () => {
    const result = migrateLegacySessions([
      { id: '1', title: 'Physics' },
      { id: '2', title: 'Chemistry' }
    ], (() => { let id = 0; return () => String(++id); })());
    expect(result.activities.map((activity) => activity.name)).toEqual(['Physics', 'Chemistry']);
    expect(result.sessions[0].activityId).not.toBe(result.sessions[1].activityId);
  });

  it('maps punctuation-only legacy titles to Uncategorized', () => {
    const result = migrateLegacySessions([{ id: '1', title: '!!!' }], () => 'activity');
    expect(result.activities[0].name).toBe('Uncategorized');
    expect(result.sessions[0].title).toBe('!!!');
  });

  it('handles empty databases', () => {
    expect(migrateLegacySessions([], () => 'unused')).toEqual({ activities: [], sessions: [] });
  });

  it('upgrades a real v1 IndexedDB schema transactionally and leaves intervals intact', async () => {
    const name = 'still-migration-' + crypto.randomUUID();
    const legacy = new Dexie(name);
    legacy.version(1).stores({
      sessions: 'id, status, startedAt, endedAt, updatedAt',
      intervals: 'id, sessionId, startedAt, endedAt, checkpointAt'
    });
    await legacy.open();
    const legacySessions = [
      { id: 's1', title: 'Programming', note: '', status: 'completed', startedAt: 100, endedAt: 200, timezone: 'Asia/Tehran', createdAt: 100, updatedAt: 200 },
      { id: 's2', title: ' programming ', note: '', status: 'completed', startedAt: 300, endedAt: 400, timezone: 'Asia/Tehran', createdAt: 300, updatedAt: 400 }
    ];
    const legacyIntervals = [
      { id: 'i1', sessionId: 's1', startedAt: 100, endedAt: 200, checkpointAt: 200 }
    ];
    await legacy.table('sessions').bulkAdd(legacySessions);
    await legacy.table('intervals').bulkAdd(legacyIntervals);
    legacy.close();

    const upgraded = new Dexie(name);
    upgraded.version(1).stores({
      sessions: 'id, status, startedAt, endedAt, updatedAt',
      intervals: 'id, sessionId, startedAt, endedAt, checkpointAt'
    });
    upgraded.version(2).stores({
      sessions: 'id, activityId, status, startedAt, endedAt, updatedAt',
      intervals: 'id, sessionId, startedAt, endedAt, checkpointAt',
      activities: 'id, &normalizedName, name, createdAt, archivedAt'
    }).upgrade(upgradeLegacyActivityRecords);

    try {
      await upgraded.open();
      const sessions = await upgraded.table('sessions').toArray();
      const activities = await upgraded.table('activities').toArray();
      expect(activities).toHaveLength(1);
      expect(sessions[0].activityId).toBe(sessions[1].activityId);
      expect(sessions.map((session) => session.title)).toEqual(['Programming', ' programming ']);
      expect(await upgraded.table('intervals').toArray()).toEqual(legacyIntervals);
    } finally {
      await upgraded.delete();
    }
  });


  it('upgrades an empty v1 database without creating placeholder activities', async () => {
    const name = 'still-empty-migration-' + crypto.randomUUID();
    const legacy = new Dexie(name);
    legacy.version(1).stores({
      sessions: 'id, status, startedAt, endedAt, updatedAt',
      intervals: 'id, sessionId, startedAt, endedAt, checkpointAt'
    });
    await legacy.open();
    legacy.close();

    const upgraded = new Dexie(name);
    upgraded.version(1).stores({
      sessions: 'id, status, startedAt, endedAt, updatedAt',
      intervals: 'id, sessionId, startedAt, endedAt, checkpointAt'
    });
    upgraded.version(2).stores({
      sessions: 'id, activityId, status, startedAt, endedAt, updatedAt',
      intervals: 'id, sessionId, startedAt, endedAt, checkpointAt',
      activities: 'id, &normalizedName, name, createdAt, archivedAt'
    }).upgrade(upgradeLegacyActivityRecords);

    try {
      await upgraded.open();
      expect(await upgraded.table('activities').toArray()).toEqual([]);
      expect(await upgraded.table('sessions').toArray()).toEqual([]);
    } finally {
      await upgraded.delete();
    }
  });

});
