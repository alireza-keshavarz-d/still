import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { database } from './database';
import {
  ActiveSessionExistsError, getAllIntervals, getAllSessions, getRecoveryCandidate,
  pauseSession, recoverInterruptedSession, resumeSession, startSession, stopSession
} from './sessionRepository';

describe('session lifecycle persistence', () => {
  beforeEach(async () => {
    await database.delete();
    await database.open();
  });
  afterEach(async () => {
    await database.delete();
  });

  it('persists intervals and excludes paused time', async () => {
    const session = await startSession('Operating Systems', 'Scheduling notes', 1_000);
    await pauseSession(session.id, 11_000);
    await resumeSession(session.id, 21_000);
    await stopSession(session.id, 41_000);
    const [stored] = await getAllSessions();
    const intervals = (await getAllIntervals()).filter((item) => item.sessionId === session.id);
    expect(stored.status).toBe('completed');
    expect(intervals).toHaveLength(2);
    expect(intervals.reduce((sum, item) => sum + (item.endedAt! - item.startedAt), 0)).toBe(30_000);
    expect(stored.note).toBe('Scheduling notes');
  });

  it('allows only one running session at a time', async () => {
    await startSession('First', '', 1_000);
    await expect(startSession('Second', '', 2_000)).rejects.toBeInstanceOf(ActiveSessionExistsError);
  });

  it('resumes a paused session with a new interval', async () => {
    const session = await startSession('Algorithms', '', 1_000);
    await pauseSession(session.id, 5_000);
    await resumeSession(session.id, 9_000);
    const intervals = (await getAllIntervals()).filter((item) => item.sessionId === session.id);
    expect(intervals).toHaveLength(2);
    expect(intervals[1].startedAt).toBe(9_000);
    expect(intervals[1].endedAt).toBeNull();
  });

  it('excludes unconfirmed time after the persisted checkpoint', async () => {
    const session = await startSession('Databases', '', 1_000);
    const candidate = await getRecoveryCandidate();
    await database.intervals.update(candidate!.interval.id, { checkpointAt: 7_000 });
    await recoverInterruptedSession(session.id, false, 20_000);
    const intervals = (await getAllIntervals()).filter((item) => item.sessionId === session.id);
    const [stored] = await getAllSessions();
    expect(stored.status).toBe('paused');
    expect(intervals[0].endedAt).toBe(7_000);
  });

  it('can include the recovery gap and continue running', async () => {
    const session = await startSession('Compilers', '', 1_000);
    await recoverInterruptedSession(session.id, true, 20_000);
    const candidate = await getRecoveryCandidate();
    expect(candidate?.interval.checkpointAt).toBe(20_000);
  });
});