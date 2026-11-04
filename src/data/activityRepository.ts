import { database } from './database';
import { normalizeActivityName, validateActivityName } from '../domain/activity';
import type { StudyActivity } from '../domain/types';

function createId(): string {
  return crypto.randomUUID();
}

/** Must be called inside a transaction that includes database.activities. */
export async function resolveActivityInTransaction(name: string, now = Date.now()): Promise<StudyActivity> {
  const displayName = validateActivityName(name);
  const normalizedName = normalizeActivityName(displayName);
  const existing = await database.activities.where('normalizedName').equals(normalizedName).first();
  if (existing) {
    if (existing.archivedAt !== null) {
      throw new Error('This activity is archived. Restore it in Settings before using it.');
    }
    return existing;
  }
  const created: StudyActivity = {
    id: createId(), name: displayName, normalizedName,
    createdAt: now, updatedAt: now, archivedAt: null
  };
  await database.activities.add(created);
  return created;
}

export async function listActivities(includeArchived = false): Promise<StudyActivity[]> {
  const values = await database.activities.orderBy('name').toArray();
  return includeArchived ? values : values.filter((activity) => activity.archivedAt === null);
}

export async function createActivity(name: string, now = Date.now()): Promise<StudyActivity> {
  return database.transaction('rw', database.activities, async () => {
    return resolveActivityInTransaction(name, now);
  });
}

export async function renameActivity(id: string, name: string, now = Date.now()): Promise<void> {
  const displayName = validateActivityName(name);
  const normalizedName = normalizeActivityName(displayName);
  await database.transaction('rw', database.activities, async () => {
    const current = await database.activities.get(id);
    if (!current) throw new Error('Activity does not exist.');
    if (current.archivedAt !== null) throw new Error('Restore this activity before renaming it.');
    const collision = await database.activities.where('normalizedName').equals(normalizedName).first();
    if (collision && collision.id !== id) throw new Error('An activity with this name already exists.');
    await database.activities.update(id, { name: displayName, normalizedName, updatedAt: now });
  });
}

export async function archiveActivity(id: string, now = Date.now()): Promise<void> {
  await database.transaction('rw', database.activities, async () => {
    const current = await database.activities.get(id);
    if (!current) throw new Error('Activity does not exist.');
    if (current.archivedAt !== null) return;
    await database.activities.update(id, { archivedAt: now, updatedAt: now });
  });
}

export async function restoreActivity(id: string, now = Date.now()): Promise<void> {
  await database.transaction('rw', database.activities, async () => {
    const current = await database.activities.get(id);
    if (!current) throw new Error('Activity does not exist.');
    const collision = await database.activities.where('normalizedName').equals(current.normalizedName).first();
    if (collision && collision.id !== id) throw new Error('An activity with this name already exists.');
    await database.activities.update(id, { archivedAt: null, updatedAt: now });
  });
}

export async function updateSessionActivity(
  sessionId: string, activityName: string, now = Date.now()
 ): Promise<StudyActivity> {
  return database.transaction('rw', database.sessions, database.activities, async () => {
    const session = await database.sessions.get(sessionId);
    if (!session) throw new Error('Session does not exist.');
    const activity = await resolveActivityInTransaction(activityName, now);
    await database.sessions.update(sessionId, {
      activityId: activity.id, title: activity.name, updatedAt: now
    });
    return activity;
  });
}
