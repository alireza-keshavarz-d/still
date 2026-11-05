import type { PlannedSession } from '../domain/planning/types';
import { assertTimeZone, isValidDateKey, isValidTime } from '../domain/planning/dateMath';

function zonedDateTimeToEpoch(date: string, time: string, timeZone: string): number {
  if (!isValidDateKey(date) || !isValidTime(time)) throw new Error('Reminder date or time is invalid.');
  assertTimeZone(timeZone);
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let guess = target;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });
  for (let index = 0; index < 5; index += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).map((part) => [part.type, part.value]));
    const observed = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    const delta = target - observed;
    guess += delta;
    if (delta === 0) return guess;
  }
  throw new Error('The selected local time does not exist in this timezone.');
}

export function getReminderDueAt(item: PlannedSession): number | null {
  if (!item.reminderEnabled || item.status !== 'scheduled' || item.reminderNotifiedAt) return null;
  if (item.scheduledTime) {
    return zonedDateTimeToEpoch(item.scheduledDate, item.scheduledTime, item.timezone) - (item.reminderMinutesBefore ?? 15) * 60_000;
  }
  if (item.reminderTime) return zonedDateTimeToEpoch(item.scheduledDate, item.reminderTime, item.timezone);
  return null;
}

export function findDueReminders(items: PlannedSession[], from: number, to: number): PlannedSession[] {
  return items.filter((item) => {
    const due = getReminderDueAt(item);
    return due !== null && due > from && due <= to;
  });
}
