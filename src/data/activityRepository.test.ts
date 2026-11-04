import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { database } from './database';
import {
  archiveActivity, createActivity, listActivities, renameActivity, restoreActivity,
  updateSessionActivity
} from './activityRepository';
import { startSession, getAllIntervals, getAllSessions, updateSessionDetails } from './sessionRepository';

describe('activity repository', () => {
  beforeEach(async () => {
    await database.delete();
    await database.open();
  });
  afterEach(async () => {
    await database.delete();
  });

  it('creates activities with normalized unique names', async () => {
    const first = await createActivity('  Linear   Algebra ');
    const duplicate = await createActivity('LINEAR ALGEBRA');
    expect(first.id).toBe(duplicate.id);
    expect(first.normalizedName).toBe('linear algebra');
    expect(await listActivities()).toHaveLength(1);
  });

  it('rejects empty and overlong activity names', async () => {
    await expect(createActivity('  ')).rejects.toThrow(/cannot be empty/);
    await expect(createActivity('x'.repeat(81))).rejects.toThrow(/80 characters/);
  });

  it('renames without changing the activity identity', async () => {
    const original = await createActivity('Calculus');
    await renameActivity(original.id, 'Advanced Calculus', 10);
    const [renamed] = await listActivities();
    expect(renamed.id).toBe(original.id);
    expect(renamed.name).toBe('Advanced Calculus');
    expect(renamed.updatedAt).toBe(10);
  });

  it('rejects rename collisions after normalization', async () => {
    const first = await createActivity('Calculus');
    await createActivity('Physics');
    await expect(renameActivity(first.id, ' PHYSICS ')).rejects.toThrow(/already exists/);
  });

  it('archives and restores activities without deleting history', async () => {
    const activity = await createActivity('Physics');
    await archiveActivity(activity.id, 20);
    expect(await listActivities()).toEqual([]);
    expect((await listActivities(true))[0].archivedAt).toBe(20);
    await restoreActivity(activity.id, 30);
    expect((await listActivities())[0].archivedAt).toBeNull();
  });

  it('rejects restoring an activity when its name has been reused', async () => {
    const original = await createActivity('Physics');
    await archiveActivity(original.id);
    await database.activities.update(original.id, { normalizedName: 'physics (archived)' });
    await createActivity('Physics');
    await database.activities.update(original.id, { normalizedName: 'physics' });
    await expect(restoreActivity(original.id)).rejects.toThrow(/already exists/);
  });

  it('creates a missing activity when associating it with a session', async () => {
    const session = await startSession('Draft title', '', 1_000);
    await updateSessionActivity(session.id, 'Computer Science', 2_000);
    const [stored] = await getAllSessions();
    expect(stored.activityId).not.toBe('');
    expect(stored.title).toBe('Computer Science');
  });

  it('does not change intervals when changing a session activity', async () => {
    const session = await startSession('Draft title', '', 1_000);
    const before = await getAllIntervals();
    await updateSessionActivity(session.id, 'Computer Science', 2_000);
    expect(await getAllIntervals()).toEqual(before);
  });

  it('preserves historical session title when an activity is renamed', async () => {
    const session = await startSession('Calculus', '', 1_000);
    const activity = (await listActivities())[0];
    await renameActivity(activity.id, 'Mathematics', 2_000);
    const [stored] = await getAllSessions();
    expect(stored.title).toBe('Calculus');
    expect(stored.activityId).toBe(activity.id);
  });

  it('does not allow archived activities to be silently reused', async () => {
    const activity = await createActivity('Physics');
    await archiveActivity(activity.id);
    await expect(createActivity('Physics')).rejects.toThrow(/archived/);
  });

  it('keeps note edits attached to an archived historical activity', async () => {
    const session = await startSession('Physics', '', 1_000);
    const activity = (await listActivities())[0];
    await archiveActivity(activity.id);
    const intervalsBefore = await getAllIntervals();
    await updateSessionDetails(session.id, 'Physics', 'Updated note', 2_000);
    const [stored] = await getAllSessions();
    expect(stored.activityId).toBe(activity.id);
    expect(stored.title).toBe('Physics');
    expect(stored.note).toBe('Updated note');
    expect(await getAllIntervals()).toEqual(intervalsBefore);
  });

  it('moves a session to a different activity only when its title changes', async () => {
    const session = await startSession('Physics', '', 1_000);
    const original = (await listActivities())[0];
    await updateSessionDetails(session.id, 'Chemistry', 'Note', 2_000);
    const [stored] = await getAllSessions();
    expect(stored.activityId).not.toBe(original.id);
    expect(stored.title).toBe('Chemistry');
    expect((await listActivities()).map((item) => item.name)).toEqual(['Chemistry', 'Physics']);
  });

  it('rejects renaming an archived activity until it is restored', async () => {
    const activity = await createActivity('Physics');
    await archiveActivity(activity.id);
    await expect(renameActivity(activity.id, 'Natural Science')).rejects.toThrow(/Restore/);
  });


  it('keeps archive operations idempotent and rejects unknown activity IDs', async () => {
    const activity = await createActivity('Physics');
    await archiveActivity(activity.id, 20);
    await archiveActivity(activity.id, 30);
    expect((await listActivities(true))[0].updatedAt).toBe(20);
    await expect(renameActivity('missing', 'Mathematics')).rejects.toThrow(/does not exist/);
    await expect(archiveActivity('missing')).rejects.toThrow(/does not exist/);
    await expect(restoreActivity('missing')).rejects.toThrow(/does not exist/);
  });

  it('does not create an activity when a session association fails', async () => {
    await expect(updateSessionActivity('missing-session', 'Physics')).rejects.toThrow(/Session does not exist/);
    expect(await listActivities()).toEqual([]);
  });

});
