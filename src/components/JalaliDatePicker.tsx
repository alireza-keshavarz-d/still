import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import {
  addJalaliMonths, formatJalaliDate, formatJalaliDateInput, formatJalaliDay,
  formatJalaliMonthTitle, gregorianToJalali, jalaliMonthGridDates,
  jalaliMonthKey, parseJalaliDate
} from '../domain/jalali';

interface JalaliDatePickerProps {
  label: string;
  value: string;
  onChange: (gregorianDate: string) => void;
  required?: boolean;
  disabled?: boolean;
}
const weekdays = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

export default function JalaliDatePicker({ label, value, onChange, required, disabled }: JalaliDatePickerProps) {
  const [draft, setDraft] = useState(() => formatJalaliDateInput(value));
  const [visibleMonth, setVisibleMonth] = useState(() => jalaliMonthKey(value));
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setDraft(formatJalaliDateInput(value));
    setVisibleMonth(jalaliMonthKey(value));
  }, [value]);

  const dates = jalaliMonthGridDates(visibleMonth);
  function changeDraft(next: string) {
    setDraft(next);
    const parsed = parseJalaliDate(next);
    if (parsed) {
      onChange(parsed);
      setVisibleMonth(jalaliMonthKey(parsed));
    }
  }
  function chooseDate(date: string) {
    onChange(date);
    setDraft(formatJalaliDateInput(date));
    setVisibleMonth(jalaliMonthKey(date));
    setOpen(false);
  }

  return (
    <div className="jalali-date-picker">
      <div className="jalali-date-input-row">
        <input type="text" inputMode="numeric" dir="rtl" aria-label={label} aria-haspopup="dialog"
          aria-expanded={open} autoComplete="off" placeholder="۱۴۰۵/۰۸/۱۵" value={draft}
          required={required} disabled={disabled} onChange={(event) => { const next = event.target.value; event.currentTarget.setCustomValidity(parseJalaliDate(next) ? '' : 'Enter a valid Jalali date.'); changeDraft(next); }}
          onBlur={(event) => { if (!parseJalaliDate(draft)) { setDraft(formatJalaliDateInput(value)); event.currentTarget.setCustomValidity(''); } }}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === 'Escape') setOpen(false); }} />
        <button type="button" aria-label="نمایش تقویم" aria-expanded={open} disabled={disabled}
          onClick={() => setOpen((current) => !current)}><CalendarDays size={15} /></button>
      </div>
      {open && (
        <div className="jalali-date-popover" role="dialog" aria-label="انتخاب تاریخ">
          <div className="jalali-date-month">
            <button type="button" aria-label="ماه قبل" onClick={() => setVisibleMonth((month) => addJalaliMonths(month, -1))}><ChevronRight size={16} /></button>
            <strong>{formatJalaliMonthTitle(visibleMonth)}</strong>
            <button type="button" aria-label="ماه بعد" onClick={() => setVisibleMonth((month) => addJalaliMonths(month, 1))}><ChevronLeft size={16} /></button>
          </div>
          <div className="jalali-date-grid" dir="rtl">
            {weekdays.map((weekday) => <span className="jalali-weekday" key={weekday}>{weekday}</span>)}
            {dates.map((date) => {
              const inMonth = jalaliMonthKey(date) === visibleMonth;
              const active = date === value;
              return <button key={date} type="button"
                className={'jalali-day' + (!inMonth ? ' outside' : '') + (active ? ' selected' : '')}
                aria-label={formatJalaliDate(date)} aria-pressed={active} onClick={() => chooseDate(date)}>
                {formatJalaliDay(date)}
              </button>;
            })}
          </div>
          <div className="jalali-date-footer"><span>{formatJalaliDate(value)}</span>
            <button type="button" onClick={() => setOpen(false)}>بستن</button></div>
        </div>
      )}
      <span className="sr-only">{(() => { const date = gregorianToJalali(value); return `${date.year}/${date.month}/${date.day}`; })()}</span>
    </div>
  );
}
