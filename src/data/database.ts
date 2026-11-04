import Dexie, { type Table } from 'dexie';
import type { StudyInterval, StudySession } from '../domain/types';

class StillDatabase extends Dexie {
  sessions!: Table<StudySession, string>;
  intervals!: Table<StudyInterval, string>;

  constructor() {
    super('still-local');
    this.version(1).stores({
      sessions: 'id, status, startedAt, endedAt, updatedAt',
      intervals: 'id, sessionId, startedAt, endedAt, checkpointAt'
    });
  }
}

export const database = new StillDatabase();