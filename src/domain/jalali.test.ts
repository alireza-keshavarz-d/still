import { describe, expect, it } from 'vitest';
import {
  addJalaliMonths, formatJalaliDate, formatJalaliDateInput, formatJalaliDay,
  formatJalaliMonthTitle, formatJalaliWeekday, gregorianToJalali,
  jalaliMonthGridDates, jalaliMonthKey, jalaliToGregorian, parseJalaliDate
} from './jalali';

describe('Gregorian and Jalali conversion', () => {
  it.each([
    ['2026-03-21', { year: 1405, month: 1, day: 1 }],
    ['2026-11-06', { year: 1405, month: 8, day: 15 }],
    ['2025-03-20', { year: 1403, month: 12, day: 30 }],
    ['2026-03-20', { year: 1404, month: 12, day: 29 }]
  ])('converts Gregorian %s to Jalali', (gregorian, jalali) => {
    expect(gregorianToJalali(gregorian)).toEqual(jalali);
    expect(jalaliToGregorian(jalali)).toBe(gregorian);
  });

  it('round trips dates across Nowruz and leap-year boundaries', () => {
    for (const date of ['2024-03-19', '2024-03-20', '2024-03-21', '2025-03-20', '2025-03-21', '2026-03-20', '2026-03-21', '2027-03-21']) {
      expect(jalaliToGregorian(gregorianToJalali(date))).toBe(date);
    }
  });

  it.each(['2026-02-30', '26-11-06', '2026-11-6', ''])('rejects invalid Gregorian date %s', (date) => {
    expect(() => gregorianToJalali(date)).toThrow('A valid Gregorian date is required.');
    expect(() => formatJalaliDate(date)).toThrow('A valid Gregorian date is required.');
  });

  it.each([
    [{ year: 1405, month: 0, day: 1 }],
    [{ year: 1405, month: 13, day: 1 }],
    [{ year: 1405, month: 1, day: 0 }],
    [{ year: 1405, month: 1, day: 32 }],
    [{ year: 1404, month: 12, day: 30 }],
    [{ year: 0, month: 1, day: 1 }],
    [{ year: 1405.5, month: 1, day: 1 }]
  ])('rejects invalid or nonexistent Jalali date %o', (date) => {
    expect(() => jalaliToGregorian(date)).toThrow();
  });
});

describe('Jalali calendar navigation and formatting', () => {
  it('derives Jalali month keys and a Saturday-first 42-day grid', () => {
    expect(jalaliMonthKey('2026-11-06')).toBe('1405-08');
    const dates = jalaliMonthGridDates('1405-08');
    expect(dates).toHaveLength(42);
    expect(dates[0]).toBe('2026-10-17');
    expect(dates[6]).toBe('2026-10-23');
    expect(dates[7]).toBe('2026-10-24');
    expect(dates[41]).toBe('2026-11-27');
  });

  it('navigates across month and year boundaries', () => {
    expect(addJalaliMonths('1405-01', -1)).toBe('1404-12');
    expect(addJalaliMonths('1405-12', 1)).toBe('1406-01');
    expect(addJalaliMonths('1405-08', 4)).toBe('1405-12');
    expect(() => addJalaliMonths('1405-08', 1.5)).toThrow('A whole-month offset is required.');
    expect(() => addJalaliMonths('1405-08', Number.NaN)).toThrow('A whole-month offset is required.');
  });

  it('rejects malformed and out-of-range Jalali month keys', () => {
    for (const month of ['1405-1', '1405-001', '1405-08-01', 'bad']) {
      expect(() => jalaliMonthGridDates(month)).toThrow('Month must use YYYY-MM format.');
      expect(() => formatJalaliMonthTitle(month)).toThrow('Month must use YYYY-MM format.');
    }
    for (const month of ['1405-00', '1405-13', '0000-01', '3001-01']) {
      expect(() => jalaliMonthGridDates(month)).toThrow('Month is invalid.');
    }
    expect(() => addJalaliMonths('1405-13', 1)).toThrow('Month is invalid.');
    expect(() => addJalaliMonths('1405-12', 24_000)).toThrow('Month is outside the supported range.');
  });

  it('formats Persian dates, numbers, month titles, and weekdays', () => {
    expect(formatJalaliDate('2026-11-06')).toContain('آبان');
    expect(formatJalaliDateInput('2026-11-06')).toBe('۱۴۰۵/۰۸/۱۵');
    expect(formatJalaliDay('2026-11-06')).toBe('۱۵');
    expect(formatJalaliMonthTitle('1405-08')).toContain('آبان');
    expect(formatJalaliWeekday('2026-11-06')).toBe('جمعه');
  });
});

describe('Jalali date input parsing', () => {
  it.each([
    ['1405/08/15', '2026-11-06'],
    ['۱۴۰۵/۰۸/۱۵', '2026-11-06'],
    ['١٤٠٥/٠٨/١٥', '2026-11-06'],
    ['1405-8-15', '2026-11-06'],
    [' ۱۴۰۵/۰۸/۱۵ ', '2026-11-06']
  ])('parses %s', (value, expected) => expect(parseJalaliDate(value)).toBe(expected));

  it.each(['', 'not a date', '1405/13/01', '1405/12/30', '1405/08/32', '1405/08', '۱۴۰۵-xx-۱۵'])(
    'rejects invalid input %s', (value) => expect(parseJalaliDate(value)).toBeNull()
  );
});
