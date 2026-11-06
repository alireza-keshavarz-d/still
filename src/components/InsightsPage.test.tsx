/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import InsightsPage from './InsightsPage';
import type { StudyInterval, StudySession } from '../domain/types';

const at = (date: string) => new Date(date + 'T08:00:00+03:30').getTime();
const sessions: StudySession[] = [
  { id: 's1', activityId: 'math', title: 'Mathematics', note: '', status: 'completed', startedAt: at('2026-11-04'), endedAt: at('2026-11-04') + 3600000, timezone: 'Asia/Tehran', createdAt: 0, updatedAt: 0 },
  { id: 's2', activityId: 'reading', title: 'Reading', note: '', status: 'completed', startedAt: at('2026-11-05'), endedAt: at('2026-11-05') + 1800000, timezone: 'Asia/Tehran', createdAt: 0, updatedAt: 0 }
];
const intervals: StudyInterval[] = [
  { id: 'i1', sessionId: 's1', startedAt: at('2026-11-04'), endedAt: at('2026-11-04') + 3600000, checkpointAt: 0 },
  { id: 'i2', sessionId: 's2', startedAt: at('2026-11-05'), endedAt: at('2026-11-05') + 1800000, checkpointAt: 0 }
];
describe('InsightsPage regression integration', () => {
  afterEach(cleanup);
  it('renders empty state and supports every analytics range', () => {
    render(<InsightsPage sessions={[]} intervals={[]} now={at('2026-11-06')} />);
    expect(screen.getByText('Your patterns start here.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '7 days' }));
    fireEvent.click(screen.getByRole('button', { name: '30 days' }));
    fireEvent.click(screen.getByRole('button', { name: '90 days' }));
    fireEvent.click(screen.getByRole('button', { name: 'All time' }));
  });
  it('renders date-key labels, daily focus, activities, and historical highlights', () => {
    render(<InsightsPage sessions={sessions} intervals={intervals} now={at('2026-11-06')} />);
    expect(screen.getByText('Mathematics')).toBeTruthy();
    expect(screen.getByText('Reading')).toBeTruthy();
    expect(screen.getByText('Longest focus day')).toBeTruthy();
    expect(screen.getByText('Best streak')).toBeTruthy();
    expect(screen.getByText(/2026-11-04/)).toBeTruthy();
    expect(screen.getAllByText('1h').length).toBeGreaterThan(0);
  });
  it('updates chart range and exposes horizontal-scroll guidance for long ranges', () => {
    render(<InsightsPage sessions={sessions} intervals={intervals} now={at('2026-11-06')} />);
    expect(screen.getByText('30-day view')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '7 days' }));
    expect(screen.getByText('7-day view')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '90 days' }));
    expect(screen.getByText('Scroll horizontally to explore')).toBeTruthy();
  });
});
