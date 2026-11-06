import { describe, expect, it } from 'vitest';
import { addCalendarDays, assertTimeZone, dateKeyAt, isValidDateKey, isValidTime, monthGridDates } from './dateMath';

describe('date validation', () => {
  it.each([
    ['2024-02-29', true], ['2000-02-29', true], ['2026-02-28', true],
    ['2026-02-29', false], ['1900-02-29', false], ['2026-13-01', false],
    ['2026-00-10', false], ['2026-04-31', false], ['26-04-01', false],
    ['2026-4-01', false], ['', false], ['2026-01-01T00:00:00Z', false]
  ])('validates %s as %s', (value, expected) => expect(isValidDateKey(value)).toBe(expected));
  it.each([
    ['00:00', true], ['09:05', true], ['23:59', true], ['24:00', false],
    ['12:60', false], ['1:05', false], ['12:5', false], ['', false]
  ])('validates time %s as %s', (value, expected) => expect(isValidTime(value)).toBe(expected));
  it('validates IANA timezones', () => {
    expect(() => assertTimeZone('Asia/Tehran')).not.toThrow();
    expect(() => assertTimeZone('UTC')).not.toThrow();
    expect(() => assertTimeZone('Mars/Olympus')).toThrow('A valid IANA timezone is required.');
    expect(() => assertTimeZone('')).toThrow('A valid IANA timezone is required.');
  });
});

describe('calendar-day arithmetic', () => {
  it.each([
    ['2024-02-28', 1, '2024-02-29'], ['2024-02-29', 1, '2024-03-01'],
    ['2026-12-31', 1, '2027-01-01'], ['2026-01-01', -1, '2025-12-31'],
    ['2026-03-01', -1, '2026-02-28'], ['2026-11-06', 0, '2026-11-06'],
    ['2026-01-01', 365, '2027-01-01']
  ])('adds %i days to %s', (date, offset, expected) => expect(addCalendarDays(date, offset)).toBe(expected));
  it.each([
    ['2026-02-30', 1], ['not-a-date', 1], ['2026-01-01', 1.5],
    ['2026-01-01', Number.NaN], ['2026-01-01', Number.POSITIVE_INFINITY]
  ])('rejects invalid date or offset %s / %s', (date, offset) => {
    expect(() => addCalendarDays(date, offset)).toThrow('A valid date and whole-day offset are required.');
  });
});

describe('timezone and month grid', () => {
  it('extracts local dates across timezone boundaries and rejects invalid zones', () => {
    const instant = Date.UTC(2026, 10, 3, 20, 59);
    expect(dateKeyAt(instant, 'UTC')).toBe('2026-11-03');
    expect(dateKeyAt(instant, 'Asia/Tehran')).toBe('2026-11-04');
    expect(() => dateKeyAt(instant, 'Mars/Olympus')).toThrow();
  });
  it('returns 42 consecutive days with Sunday-first week alignment', () => {
    const dates = monthGridDates('2026-11');
    expect(dates).toHaveLength(42);
    expect(dates[0]).toBe('2026-11-01');
    expect(dates[41]).toBe('2026-12-12');
    expect(monthGridDates('2026-08')[0]).toBe('2026-07-26');
    expect(monthGridDates('2026-02')[0]).toBe('2026-02-01');
  });
  it.each(['2026-1', '2026-001', '26-11', '2026-11-01', 'invalid'])(
    'rejects malformed month %s', month => expect(() => monthGridDates(month)).toThrow('Month must use YYYY-MM format.')
  );
  it.each(['2026-00', '2026-13'])(
    'rejects out-of-range month %s', month => expect(() => monthGridDates(month)).toThrow('Month is invalid.')
  );
});
