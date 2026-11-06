/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import CalendarPage from './CalendarPage';

const mocks = vi.hoisted(() => ({
  createPlannedSession: vi.fn(),
  createStudyPlan: vi.fn(),
  getAllPlannedSessions: vi.fn(),
  skipSession: vi.fn(),
  cancelSession: vi.fn(),
  rescheduleSession: vi.fn(),
  updatePlannedSession: vi.fn()
}));

vi.mock('../data/planningRepository', () => mocks);

describe('CalendarPage', () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    vi.clearAllMocks();
    let id = 0;
    vi.stubGlobal('crypto', { randomUUID: () => 'test-id-' + (++id) });
    mocks.getAllPlannedSessions.mockResolvedValue([]);
    mocks.createPlannedSession.mockResolvedValue({ id: 'new' });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() })
    });
  });

  it('switches between month, week and agenda views', async () => {
    render(<CalendarPage onStartPlannedSession={vi.fn()} />);
    await screen.findByText('Calendar');
    fireEvent.click(screen.getByRole('button', { name: 'week' }));
    expect(screen.getByText(/Week of/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'agenda' }));
    expect(screen.getByText('Upcoming activities')).toBeTruthy();
  });

  it('creates a standalone planned session from the quick planner', async () => {
    render(<CalendarPage onStartPlannedSession={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: /Plan session/ }));
    fireEvent.change(screen.getByLabelText('ACTIVITY'), { target: { value: 'Review chapter' } });
    fireEvent.change(screen.getByLabelText('DATE'), { target: { value: '۱۴۰۵/۰۸/۱۴' } });
    fireEvent.change(screen.getByLabelText('TIME (OPTIONAL)'), { target: { value: '10:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save planned session' }));
    await waitFor(() => expect(mocks.createPlannedSession).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Review chapter', scheduledDate: '2026-11-05', scheduledTime: '10:00', reminderEnabled: true, reminderMinutesBefore: 15
    })));
  });

  it('opens the learning sequence builder and adds another activity row', async () => {
    render(<CalendarPage onStartPlannedSession={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Build a sequence' }));
    expect(screen.getByText('Plan what comes next')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add activity' }));
    expect(screen.getByText('ACTIVITY 2')).toBeTruthy();
  });
});
