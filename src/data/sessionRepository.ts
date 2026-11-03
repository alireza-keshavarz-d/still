import { database } from './database';
import type { RecoveryCandidate, StudyInterval, StudySession } from '../domain/types';
import { DEFAULT_TIME_ZONE } from '../domain/types';

export class ActiveSessionExistsError extends Error {
  constructor() {
    super('Another study session is already running.');
    this.name = 'ActiveSessionExistsError';
  }
}

function createId(): string {
  return crypto.randomUUID();
}

async function getOpenInterval(sessionId: string): Promise<StudyInterval | undefined> {
  return database.intervals.where('sessionId').equals(sessionId)
    .filter((interval) => interval.endedAt === null).first();
}

async function assertNoRunningSession(): Promise<void> {
  const running = await database.sessions.where('status').equals('running').first();
  if (running) throw new ActiveSessionExistsError();
}

export async function startSession(title: string, note = '', now = Date.now()): Promise<StudySession> {
  const session: StudySession = {
    id: createId(),
    title: title.trim() || 'Study session',
    note,
    status: 'running',
    startedAt: now,
    endedAt: null,
    timezone: DEFAULT_TIME_ZONE,
    createdAt: now,
    updatedAt: now
  };
  const interval: StudyInterval = {
    id: createId(), sessionId: session.id, startedAt: now, endedAt: null, checkpointAt: now
  };

  await database.transaction('rw', database.sessions, database.intervals, async () => {
    await assertNoRunningSession();
    await database.sessions.add(session);
    await database.intervals.add(interval);
  });
  return session;
}

export async function pauseSession(sessionId: string, now = Date.now()): Promise<void> {
  await database.transaction('rw', database.sessions, database.intervals, async () => {
    const session = await database.sessions.get(sessionId);
    if (!session || session.status !== 'running') throw new Error('Only a running session can be paused.');
    const interval = await getOpenInterval(sessionId);
    if (!interval) throw new Error('Running session has no open interval.');
    await database.intervals.update(interval.id, { endedAt: now, checkpointAt: now });
    await database.sessions.update(sessionId, { status: 'paused', updatedAt: now });
  });
}

export async function resumeSession(sessionId: string, now = Date.now()): Promise<void> {
  await database.transaction('rw', database.sessions, database.intervals, async () => {
    const session = await database.sessions.get(sessionId);
    if (!session || session.status !== 'paused') throw new Error('Only a paused session can be resumed.');
    await assertNoRunningSession();
    await database.intervals.add({
      id: createId(), sessionId, startedAt: now, endedAt: null, checkpointAt: now
    });
    await database.sessions.update(sessionId, { status: 'running', endedAt: null, updatedAt: now });
  });
}

export async function stopSession(sessionId: string, now = Date.now()): Promise<void> {
  await database.transaction('rw', database.sessions, database.intervals, async () => {
    const session = await database.sessions.get(sessionId);
    if (!session || session.status === 'completed') throw new Error('Session is already completed or does not exist.');
    if (session.status === 'running') {
      const interval = await getOpenInterval(sessionId);
      if (!interval) throw new Error('Running session has no open interval.');
      await database.intervals.update(interval.id, { endedAt: now, checkpointAt: now });
    }
    await database.sessions.update(sessionId, { status: 'completed', endedAt: now, updatedAt: now });
  });
}

export async function updateSessionDetails(
  sessionId: string, title: string, note: string, now = Date.now()
): Promise<void> {
  const session = await database.sessions.get(sessionId);
  if (!session) throw new Error('Session does not exist.');
  await database.sessions.update(sessionId, {
    title: title.trim() || 'Untitled session', note, updatedAt: now
  });
}

export async function checkpointRunningSession(now = Date.now()): Promise<void> {
  await database.transaction('rw', database.sessions, database.intervals, async () => {
    const running = await database.sessions.where('status').equals('running').first();
    if (!running) return;
    const interval = await getOpenInterval(running.id);
    if (interval) await database.intervals.update(interval.id, { checkpointAt: now });
  });
}

export async function getRecoveryCandidate(): Promise<RecoveryCandidate | null> {
  const running = await database.sessions.where('status').equals('running').first();
  if (!running) return null;
  const interval = await getOpenInterval(running.id);
  if (!interval) {
    await database.sessions.update(running.id, { status: 'paused', updatedAt: Date.now() });
    return null;
  }
  return { session: running, interval };
}

export async function recoverInterruptedSession(
  sessionId: string, countTimeSinceCheckpoint: boolean, now = Date.now()
): Promise<void> {
  await database.transaction('rw', database.sessions, database.intervals, async () => {
    const session = await database.sessions.get(sessionId);
    const interval = await getOpenInterval(sessionId);
    if (!session || session.status !== 'running' || !interval) {
      throw new Error('The interrupted session could not be recovered.');
    }

    if (countTimeSinceCheckpoint) {
      await database.intervals.update(interval.id, { checkpointAt: now });
    } else {
      await database.intervals.update(interval.id, {
        endedAt: interval.checkpointAt, checkpointAt: interval.checkpointAt
      });
      await database.sessions.update(sessionId, { status: 'paused', updatedAt: now });
    }
  });
}

export async function getAllSessions(): Promise<StudySession[]> {
  return database.sessions.orderBy('startedAt').reverse().toArray();
}

export async function getAllIntervals(): Promise<StudyInterval[]> {
  return database.intervals.toArray();
}