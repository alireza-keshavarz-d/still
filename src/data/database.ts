import Dexie, { type Table } from 'dexie';
import type { StudyActivity, StudyInterval, StudySession } from '../domain/types';
import type { PlannedSession, StudyPlan } from '../domain/planning/types';
import { upgradeLegacyActivityRecords } from './activityMigration';

class StillDatabase extends Dexie {
  sessions!: Table<StudySession, string>;
  intervals!: Table<StudyInterval, string>;
  activities!: Table<StudyActivity, string>;
  studyPlans!: Table<StudyPlan, string>;
  plannedSessions!: Table<PlannedSession, string>;

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
    }).upgrade(upgradeLegacyActivityRecords);
    this.version(3).stores({
      sessions: 'id, activityId, plannedSessionId, status, startedAt, endedAt, updatedAt',
      intervals: 'id, sessionId, startedAt, endedAt, checkpointAt',
      activities: 'id, &normalizedName, name, createdAt, archivedAt',
      studyPlans: 'id, status, createdAt, updatedAt',
      plannedSessions: 'id, planId, scheduledDate, status, predecessorId, studySessionId, [planId+scheduledDate]'
    });
  }
}

export const database = new StillDatabase();
