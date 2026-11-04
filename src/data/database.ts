import Dexie, { type Table } from 'dexie';
import type { StudyActivity, StudyInterval, StudySession } from '../domain/types';
import { migrateLegacySessions } from './activityMigration';

class StillDatabase extends Dexie {
  sessions!: Table<StudySession, string>;
  intervals!: Table<StudyInterval, string>;
  activities!: Table<StudyActivity, string>;

  constructor() {
    super('still-local');
    this.version(1).stores({
      sessions: 'id, status, startedAt, endedAt, updatedAt',
      intervals: 'id, sessionId, startedAt, endedAt, checkpointAt'
    });

    this.version(2).stores({
      sessions: 'id, activityId, status, startedAt, endedAt, updatedAt',
      intervals: 'id, sessionId, startedAt, endedAt, checkpointAt',
      activities: 'id, &normalizedName, name, createdAt, archivedAt'
    }).upgrade(async (transaction) => {
      const sessions = await transaction.table('sessions').toArray();
      const migrated = migrateLegacySessions(sessions);
      if (migrated.activities.length) {
        await transaction.table('activities').bulkAdd(migrated.activities);
      }
      for (const session of migrated.sessions) {
        await transaction.table('sessions').update(session.id, { activityId: session.activityId });
      }
    });
  }
}

export const database = new StillDatabase();
