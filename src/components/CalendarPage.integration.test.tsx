/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import CalendarPage from './CalendarPage';

const mocks = vi.hoisted(() => ({
  createPlannedSession: vi.fn(), createStudyPlan: vi.fn(), getAllPlannedSessions: vi.fn(),
  skipSession: vi.fn(), cancelSession: vi.fn(), rescheduleSession: vi.fn(), updatePlannedSession: vi.fn()
}));
vi.mock('../data/planningRepository', () => mocks);

const today = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());
const planned = (overrides: Record<string, unknown> = {}) => ({
  id: 'p1', planId: null, title: 'Review chapter', activityId: null, note: '',
  subjectName: null, topicName: null, status: 'scheduled', schedulingMode: 'fixed',
  scheduledDate: today(), scheduledTime: null, timezone: 'Asia/Tehran', predecessorId: null,
  intervalDays: null, estimatedDurationMinutes: null, studySessionId: null, completedAt: null,
  reminderEnabled: false, reminderMinutesBefore: null, reminderTime: null, skippedAt: null,
  cancelledAt: null, createdAt: 0, updatedAt: 0, ...overrides
});
function setup() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() })
  });
}

describe('CalendarPage regression integration', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });
  beforeEach(() => {
    vi.clearAllMocks(); setup();
    let id = 0;
    vi.stubGlobal('crypto', { randomUUID: () => 'id-' + (++id) });
    mocks.getAllPlannedSessions.mockResolvedValue([]);
    mocks.createPlannedSession.mockResolvedValue({ id: 'new' });
    mocks.createStudyPlan.mockResolvedValue({ id: 'plan' });
    mocks.skipSession.mockResolvedValue(undefined);
    mocks.cancelSession.mockResolvedValue(undefined);
    mocks.rescheduleSession.mockResolvedValue(undefined);
    mocks.updatePlannedSession.mockResolvedValue(undefined);
  });

  it('switches month, week, and agenda views and navigates calendar periods', async () => {
    render(<CalendarPage onStartPlannedSession={vi.fn()} />);
    await screen.findByText('Calendar');
    fireEvent.click(screen.getByRole('button', { name: 'week' }));
    expect(screen.getByText(/Week of/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next week' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous week' }));
    fireEvent.click(screen.getByRole('button', { name: 'agenda' }));
    expect(screen.getByText('Upcoming activities')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'month' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    fireEvent.click(screen.getByRole('button', { name: 'Jump to today' }));
  });

  it('uses agenda by default on a narrow viewport and reports load failures', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true, value: () => ({ matches: true, addListener: vi.fn(), removeListener: vi.fn() })
    });
    render(<CalendarPage onStartPlannedSession={vi.fn()} />);
    expect(await screen.findByText('Upcoming activities')).toBeTruthy();
    cleanup();
    mocks.getAllPlannedSessions.mockRejectedValueOnce(new Error('database unavailable'));
    render(<CalendarPage onStartPlannedSession={vi.fn()} />);
    expect((await screen.findByRole('alert')).textContent).toContain('Could not load your calendar.');
  });

  it('creates a timed session with duration and default reminder', async () => {
    render(<CalendarPage onStartPlannedSession={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: /Plan session/ }));
    fireEvent.change(screen.getByLabelText('ACTIVITY'), { target: { value: 'Review chapter' } });
    fireEvent.change(screen.getByLabelText('DATE'), { target: { value: '2026-11-05' } });
    fireEvent.change(screen.getByLabelText('TIME (OPTIONAL)'), { target: { value: '10:00' } });
    fireEvent.change(screen.getByLabelText('DURATION (OPTIONAL)'), { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save planned session' }));
    await waitFor(() => expect(mocks.createPlannedSession).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Review chapter', scheduledDate: '2026-11-05', scheduledTime: '10:00',
      estimatedDurationMinutes: 45, reminderEnabled: true, reminderMinutesBefore: 15
    })));
  });

  it('creates a flexible session with a custom reminder and validates empty titles', async () => {
    render(<CalendarPage onStartPlannedSession={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: /Plan session/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save planned session' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Activity title is required.');
    fireEvent.change(screen.getByLabelText('ACTIVITY'), { target: { value: 'Practice' } });
    fireEvent.change(screen.getByLabelText('REMINDER TIME ON THIS DATE (OPTIONAL)'), { target: { value: '18:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save planned session' }));
    await waitFor(() => expect(mocks.createPlannedSession).toHaveBeenCalledWith(expect.objectContaining({
      scheduledTime: null, reminderEnabled: true, reminderMinutesBefore: null, reminderTime: '18:30'
    })));
  });

  it('surfaces persistence errors from planner actions', async () => {
    mocks.createPlannedSession.mockRejectedValueOnce(new Error('write failed'));
    render(<CalendarPage onStartPlannedSession={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: /Plan session/ }));
    fireEvent.change(screen.getByLabelText('ACTIVITY'), { target: { value: 'Failing' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save planned session' }));
    expect((await screen.findByRole('alert')).textContent).toContain('write failed');
  });

  it('creates a sequence with relative dates and rejects incomplete sequences', async () => {
    render(<CalendarPage onStartPlannedSession={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Build a sequence' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save sequence' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Enter a plan name');
    fireEvent.change(screen.getByLabelText('PLAN NAME'), { target: { value: 'Biology revision' } });
    fireEvent.change(screen.getByLabelText('FIRST ACTIVITY DATE'), { target: { value: '2026-11-05' } });
    fireEvent.change(screen.getByPlaceholderText('Read the chapter'), { target: { value: 'Read chapter' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add activity' }));
    fireEvent.change(screen.getByPlaceholderText('Practice questions'), { target: { value: 'Practice' } });
    fireEvent.change(screen.getByLabelText('DAYS AFTER PREVIOUS'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save sequence' }));
    await waitFor(() => expect(mocks.createStudyPlan).toHaveBeenCalledWith('Biology revision', [
      expect.objectContaining({ scheduledDate: '2026-11-05', schedulingMode: 'fixed' }),
      expect.objectContaining({ scheduledDate: '2026-11-09', schedulingMode: 'relative', intervalDays: 4 })
    ]));
  });

  it('renders planned lifecycle states and invokes start, edit, reschedule, skip, and cancel actions', async () => {
    mocks.getAllPlannedSessions.mockResolvedValue([
      planned(), planned({ id: 'running', title: 'Running', status: 'in_progress' }),
      planned({ id: 'done', title: 'Done', status: 'completed' })
    ]);
    const start = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(window, 'prompt').mockReturnValueOnce('Renamed').mockReturnValueOnce('09:30')
      .mockReturnValueOnce('2026-11-12').mockReturnValueOnce('1');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<CalendarPage onStartPlannedSession={start} />);
    expect(await screen.findByText('IN PROGRESS')).toBeTruthy();
    expect(screen.getByText('COMPLETED')).toBeTruthy();
    const card = screen.getByText('Review chapter').closest('article') as HTMLElement;
    fireEvent.click(within(card).getByTitle('Start session'));
    await waitFor(() => expect(start).toHaveBeenCalledWith('p1'));
    fireEvent.click(within(card).getByTitle('Edit activity'));
    await waitFor(() => expect(mocks.updatePlannedSession).toHaveBeenCalledWith('p1', { title: 'Renamed', scheduledTime: '09:30' }));
    fireEvent.click(within(card).getByTitle('Reschedule'));
    await waitFor(() => expect(mocks.rescheduleSession).toHaveBeenCalledWith('p1', '2026-11-12', true));
    fireEvent.click(within(card).getByTitle('Skip'));
    await waitFor(() => expect(mocks.skipSession).toHaveBeenCalledWith('p1', 'keep-dates'));
    fireEvent.click(within(card).getByTitle('Cancel'));
    await waitFor(() => expect(mocks.cancelSession).toHaveBeenCalledWith('p1'));
  });

  it('filters past entries from agenda and handles rejected operations', async () => {
    mocks.getAllPlannedSessions.mockResolvedValue([
      planned({ id: 'past', title: 'Past activity', scheduledDate: '2000-01-01' }),
      planned({ id: 'future', title: 'Future activity', scheduledDate: '2999-01-01' })
    ]);
    mocks.cancelSession.mockRejectedValueOnce('unexpected');
    render(<CalendarPage onStartPlannedSession={vi.fn()} />);
    expect(await screen.findByText('Future activity')).toBeTruthy();
    expect(screen.queryByText('Past activity')).toBeNull();
    const card = screen.getByText('Future activity').closest('article') as HTMLElement;
    fireEvent.click(within(card).getByTitle('Cancel'));
    expect((await screen.findByRole('alert')).textContent).toContain('Calendar update failed.');
  });
});
