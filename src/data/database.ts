import Dexie, { type Table } from 'dexie';
import type { StudyActivity, StudyInterval, StudySession } from '../domain/types';
import { normalizeActivityName } from '../domain/activity';

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
      const byName = new Map<string, StudyActivity>();

      for (const session of sessions) {
        const displayName = typeof session.title === 'string' && session.title.trim()
          ? session.title.trim().replace(/\\s+/g, ' ')
          : 'Uncategorized';
        const normalizedName = normalizeActivityName(displayName);
        let activity = byName.get(normalizedName);
        if (!activity) {
          activity = {
            id: crypto.randomUUID(),
            name: displayName,
            normalizedName,
            createdAt: session.createdAt ?? session.startedAt ?? Date.now(),
            updatedAt: session.updatedAt ?? session.startedAt ?? Date.now(),
            archivedAt: null
          };
          byName.set(normalizedName, activity);
          await transaction.table('activities').add(activity);
        }
        await transaction.table('sessions').update(session.id, { activityId: activity.id });
      }
    });
  }
}

export const database = new StillDatabase();
