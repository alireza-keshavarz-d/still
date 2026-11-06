/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import JalaliDatePicker from './JalaliDatePicker';

describe('JalaliDatePicker', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('shows the Jalali date, accepts Persian and Latin digits, and emits Gregorian storage keys', () => {
    const onChange = vi.fn();
    render(<JalaliDatePicker label="DATE" value="2026-11-06" onChange={onChange} />);
    const input = screen.getByRole('textbox', { name: 'DATE' });
    expect((input as HTMLInputElement).value).toBe('۱۴۰۵/۰۸/۱۵');
    fireEvent.change(input, { target: { value: '1405/08/16' } });
    expect(onChange).toHaveBeenCalledWith('2026-11-07');
    fireEvent.change(input, { target: { value: '۱۴۰۵/۰۸/۱۷' } });
    expect(onChange).toHaveBeenLastCalledWith('2026-11-08');
  });

  it('opens the month grid and lets the user select a date', () => {
    const onChange = vi.fn();
    render(<JalaliDatePicker label="DATE" value="2026-11-06" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'نمایش تقویم' }));
    expect(screen.getByRole('dialog', { name: 'انتخاب تاریخ' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'ماه بعد' }));
    fireEvent.click(screen.getByRole('button', { name: '۱ آذر ۱۴۰۵' }));
    expect(onChange).toHaveBeenCalledWith('2026-11-22');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('resets invalid draft text and respects disabled state', () => {
    const onChange = vi.fn();
    const { rerender } = render(<JalaliDatePicker label="DATE" value="2026-11-06" onChange={onChange} />);
    const input = screen.getByRole('textbox', { name: 'DATE' });
    fireEvent.change(input, { target: { value: 'not a date' } });
    fireEvent.blur(input);
    expect((input as HTMLInputElement).value).toBe('۱۴۰۵/۰۸/۱۵');
    rerender(<JalaliDatePicker label="DATE" value="2026-11-06" onChange={onChange} disabled />);
    expect((screen.getByRole('textbox', { name: 'DATE' }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'نمایش تقویم' })).toHaveProperty('disabled', true);
  });
});
