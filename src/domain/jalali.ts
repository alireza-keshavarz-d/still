const persianPartsFormatter = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', {
  calendar: 'persian', numberingSystem: 'latn', timeZone: 'UTC',
  year: 'numeric', month: 'numeric', day: 'numeric'
});
const persianDateFormatter = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  calendar: 'persian', timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric'
});
const persianMonthFormatter = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  calendar: 'persian', timeZone: 'UTC', year: 'numeric', month: 'long'
});
const persianWeekdayFormatter = new Intl.DateTimeFormat('fa-IR', {
  timeZone: 'UTC', weekday: 'short'
});
const persianNumberFormatter = new Intl.NumberFormat('fa-IR', { useGrouping: false });
const jalaliToGregorianCache = new Map<string, string>();
const gregorianToJalaliCache = new Map<string, JalaliDate>();

export interface JalaliDate { year: number; month: number; day: number }

const pad = (value: number) => String(value).padStart(2, '0');
const persianDigits = (value: string) => value.replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]);
const dateKey = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;
const epochDay = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day, 12) / 86_400_000);
};
const keyFromEpochDay = (day: number) => {
  const date = new Date(day * 86_400_000);
  return dateKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
};
const compareParts = (left: JalaliDate, right: JalaliDate) =>
  left.year - right.year || left.month - right.month || left.day - right.day;

export function isValidGregorianDateKey(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() + 1 === Number(month) && date.getUTCDate() === Number(day);
}

export function gregorianToJalali(value: string): JalaliDate {
  if (!isValidGregorianDateKey(value)) throw new Error('A valid Gregorian date is required.');
  const cached = gregorianToJalaliCache.get(value);
  if (cached) return { ...cached };
  const parts = Object.fromEntries(persianPartsFormatter.formatToParts(new Date(value + 'T12:00:00Z'))
    .map((part) => [part.type, part.value]));
  const result = { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
  gregorianToJalaliCache.set(value, result);
  return { ...result };
}

export function jalaliToGregorian(value: JalaliDate): string {
  const { year, month, day } = value;
  if (!Number.isInteger(year) || year < 1 || year > 3000 ||
      !Number.isInteger(month) || month < 1 || month > 12 ||
      !Number.isInteger(day) || day < 1 || day > 31) {
    throw new Error('A valid Jalali date is required.');
  }
  const key = dateKey(year, month, day);
  const cached = jalaliToGregorianCache.get(key);
  if (cached) return cached;

  // A Jalali year begins in March of Gregorian year + 621. Binary search
  // Gregorian days instead of assuming a fixed Nowruz offset or leap rule.
  let low = epochDay(dateKey(year + 620, 1, 1));
  let high = epochDay(dateKey(year + 623, 1, 1));
  const target = { year, month, day };
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = gregorianToJalali(keyFromEpochDay(middle));
    if (compareParts(candidate, target) < 0) low = middle + 1;
    else high = middle;
  }
  const result = keyFromEpochDay(low);
  if (compareParts(gregorianToJalali(result), target) !== 0) {
    throw new Error('The Jalali date does not exist.');
  }
  jalaliToGregorianCache.set(key, result);
  return result;
}

export function jalaliMonthKey(value: string): string {
  const { year, month } = gregorianToJalali(value);
  return `${year}-${pad(month)}`;
}

export function jalaliMonthGridDates(monthKey: string): string[] {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) throw new Error('Month must use YYYY-MM format.');
  const [year, month] = monthKey.split('-').map(Number);
  if (year < 1 || year > 3000 || month < 1 || month > 12) throw new Error('Month is invalid.');
  const first = jalaliToGregorian({ year, month, day: 1 });
  const offset = (new Date(first + 'T12:00:00Z').getUTCDay() + 1) % 7;
  const start = epochDay(first) - offset;
  return Array.from({ length: 42 }, (_, index) => keyFromEpochDay(start + index));
}

export function addJalaliMonths(monthKey: string, offset: number): string {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) throw new Error('Month must use YYYY-MM format.');
  if (!Number.isInteger(offset)) throw new Error('A whole-month offset is required.');
  const [year, month] = monthKey.split('-').map(Number);
  if (year < 1 || year > 3000 || month < 1 || month > 12) throw new Error('Month is invalid.');
  const total = year * 12 + month - 1 + offset;
  const nextYear = Math.floor(total / 12);
  const nextMonth = total % 12 + 1;
  if (nextYear < 1 || nextYear > 3000) throw new Error('Month is outside the supported range.');
  return `${nextYear}-${pad(nextMonth)}`;
}

export function formatJalaliDate(value: string): string {
  if (!isValidGregorianDateKey(value)) throw new Error('A valid Gregorian date is required.');
  return persianDateFormatter.format(new Date(value + 'T12:00:00Z'));
}

export function formatJalaliDateInput(value: string): string {
  const { year, month, day } = gregorianToJalali(value);
  return [String(year), pad(month), pad(day)].map(persianDigits).join('/');
}

export function formatJalaliMonthTitle(monthKey: string): string {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) throw new Error('Month must use YYYY-MM format.');
  const [year, month] = monthKey.split('-').map(Number);
  const first = jalaliToGregorian({ year, month, day: 1 });
  return persianMonthFormatter.format(new Date(first + 'T12:00:00Z'));
}

export function formatJalaliDay(value: string): string {
  return persianNumberFormatter.format(gregorianToJalali(value).day);
}

export function formatJalaliWeekday(value: string): string {
  if (!isValidGregorianDateKey(value)) throw new Error('A valid Gregorian date is required.');
  return persianWeekdayFormatter.format(new Date(value + 'T12:00:00Z'));
}

export function parseJalaliDate(value: string): string | null {
  const normalized = value.trim().replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
  const match = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(normalized);
  if (!match) return null;
  try {
    return jalaliToGregorian({ year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) });
  } catch {
    return null;
  }
}
