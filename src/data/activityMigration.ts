import { normalizeActivityName } from '../domain/activity';
import type { Transaction } from 'dexie';
import type { StudyActivity } from '../domain/types';

export interface LegacyStudySession {
  id: string;
  title?: string | null;
  startedAt?: number;
  createdAt?: number;
  updatedAt?: number;
  [key: string]: unknown;
}

export interface ActivityMigrationResult {
  activities: StudyActivity[];
  sessions: Array<LegacyStudySession & { activityId: string }>;
}

export function migrateLegacySessions(
  sessions: LegacyStudySession[],
  createId: () => string = () => crypto.randomUUID()
): ActivityMigrationResult {
  const byName = new Map<string, StudyActivity>();
  const migratedSessions = sessions.map((session) => {
    const candidateName = typeof session.title === 'string' && session.title.trim()
      ? session.title.trim().replace(/\s+/g, ' ')
      : 'Uncategorized';
    const displayName = normalizeActivityName(candidateName) ? candidateName : 'Uncategorized';
    const normalizedName = normalizeActivityName(displayName);
    let activity = byName.get(normalizedName);
    if (!activity) {
      const timestamp = session.createdAt ?? session.startedAt ?? Date.now();
      activity = {
        id: createId(), name: displayName, normalizedName,
        createdAt: timestamp, updatedAt: session.updatedAt ?? timestamp, archivedAt: null
      };
      byName.set(normalizedName, activity);
    }
    return { ...session, activityId: activity.id };
  });
  return { activities: [...byName.values()], sessions: migratedSessions };
}

/** Applies the data part of the v1-to-v2 schema upgrade inside Dexie's versionchange transaction. */
export async function upgradeLegacyActivityRecords(transaction: Transaction): Promise<void> {
  const sessions = await transaction.table('sessions').toArray();
  const migrated = migrateLegacySessions(sessions);
  if (migrated.activities.length) {
    await transaction.table('activities').bulkAdd(migrated.activities);
  }
  for (const session of migrated.sessions) {
    await transaction.table('sessions').update(session.id, { activityId: session.activityId });
  }
}
