import { describe, expect, it } from 'vitest';
import { migrateLegacySessions } from './activityMigration';

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
});
