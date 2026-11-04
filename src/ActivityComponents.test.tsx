// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { useState } from 'react';
import { randomUUID } from 'node:crypto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivityNameInput, ActivitySettings } from './ActivityComponents';
import { database } from './data/database';
import { createActivity, listActivities } from './data/activityRepository';
import { getAllIntervals, getAllSessions, startSession } from './data/sessionRepository';

function InputHarness() {
  const [value, setValue] = useState('');
  return <ActivityNameInput value={value} onChange={setValue} />;
}

describe('activity autocomplete interactions', () => {
  beforeEach(async () => {
    vi.stubGlobal('crypto', { randomUUID } as Crypto);
    await database.delete();
    await database.open();
  });

  afterEach(async () => {
    cleanup();
    await database.delete();
    vi.unstubAllGlobals();
  });

  it('recognizes an exact normalized match without opening suggestions', async () => {
    await createActivity('Physics');
    render(<ActivityNameInput value=" PHYSICS " onChange={vi.fn()} />);
    expect(await screen.findByText(/Recognized activity/)).toBeTruthy();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('requires explicit selection when multiple suggestions are available', async () => {
    await createActivity('Operating Systems');
    await createActivity('Operating System Design');
    const onChange = vi.fn();
    render(<ActivityNameInput value="operating" onChange={onChange} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    const first = await screen.findByRole('option', { name: /Operating Systems/ });
    expect(screen.getAllByRole('option').length).toBeGreaterThan(1);
    fireEvent.click(first);
    expect(onChange).toHaveBeenCalledWith('Operating Systems');
  });

  it('supports arrow-key navigation and Enter selection', async () => {
    await createActivity('Operating Systems');
    await createActivity('Operating System Design');
    const onChange = vi.fn();
    render(<ActivityNameInput value="operating" onChange={onChange} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    await screen.findByRole('option', { name: /Operating System Design/ });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('Operating System Design');
  });


  it('does not accept an ambiguous suggestion with Tab', async () => {
    await createActivity('Operating Systems');
    await createActivity('Operating System Design');
    const onChange = vi.fn();
    render(<ActivityNameInput value="operating" onChange={onChange} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    await screen.findByRole('listbox');
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('accepts a single unambiguous suggestion with Tab', async () => {
    await createActivity('Physics');
    const onChange = vi.fn();
    render(<ActivityNameInput value="phys" onChange={onChange} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    await screen.findByRole('option', { name: /Physics/ });
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(onChange).toHaveBeenCalledWith('Physics');
  });

  it('closes suggestions with Escape without changing the input', async () => {
    await createActivity('Physics');
    const onChange = vi.fn();
    render(<ActivityNameInput value="phys" onChange={onChange} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    await screen.findByRole('listbox');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });


  it('associates inline-created activities with an existing session transactionally', async () => {
    const session = await startSession('Physics', '', 1_000);
    const intervalsBefore = await getAllIntervals();
    const onChange = vi.fn();
    render(<ActivityNameInput value="Quantum Mechanics" onChange={onChange} sessionId={session.id} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.click(await screen.findByRole('option', { name: /Create/ }));
    await waitFor(async () => {
      const [stored] = await getAllSessions();
      expect(stored.title).toBe('Quantum Mechanics');
      expect(stored.activityId).not.toBe('');
    });
    expect(await getAllIntervals()).toEqual(intervalsBefore);
    expect(onChange).toHaveBeenCalledWith('Quantum Mechanics');
  });

  it('creates an unknown activity inline', async () => {
    render(<InputHarness />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'Quantum Mechanics' } });
    fireEvent.focus(input);
    fireEvent.click(await screen.findByRole('option', { name: /Create/ }));
    await waitFor(async () => {
      expect((await listActivities()).map((activity) => activity.name)).toContain('Quantum Mechanics');
    });
  });
});

describe('activity settings interactions', () => {
  beforeEach(async () => {
    await database.delete();
    await database.open();
  });

  afterEach(async () => {
    cleanup();
    await database.delete();
  });

  it('renames an activity from Settings', async () => {
    await createActivity('Physics');
    render(<ActivitySettings />);
    fireEvent.click(await screen.findByRole('button', { name: 'Rename' }));
    const edit = screen.getByDisplayValue('Physics');
    fireEvent.change(edit, { target: { value: 'Natural Science' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(async () => {
      expect((await listActivities()).map((activity) => activity.name)).toEqual(['Natural Science']);
    });
  });

  it('archives and restores an activity from Settings', async () => {
    await createActivity('Physics');
    render(<ActivitySettings />);
    fireEvent.click(await screen.findByRole('button', { name: 'Archive' }));
    await waitFor(async () => expect(await listActivities()).toEqual([]));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show archived' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));
    await waitFor(async () => {
      expect((await listActivities()).map((activity) => activity.name)).toEqual(['Physics']);
    });
  });
});
