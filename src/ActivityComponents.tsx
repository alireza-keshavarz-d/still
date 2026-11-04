import { useEffect, useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { archiveActivity, createActivity, listActivities, renameActivity, restoreActivity } from './data/activityRepository';
import { matchActivities } from './domain/activity';
import type { StudyActivity } from './domain/types';

interface ActivityNameInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function ActivityNameInput({ value, onChange, disabled = false }: ActivityNameInputProps) {
  const [activities, setActivities] = useState<StudyActivity[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [error, setError] = useState('');

  async function refresh() {
    setActivities(await listActivities());
  }

  useEffect(() => { void refresh(); }, []);

  const matches = useMemo(() => matchActivities(value, activities), [value, activities]);
  const options = matches.suggestions;
  const showCreate = value.trim().length > 0 && !matches.exact;
  const optionCount = options.length + (showCreate ? 1 : 0);

  function choose(activity: StudyActivity) {
    onChange(activity.name);
    setOpen(false);
    setError('');
  }

  async function createFromInput() {
    try {
      const activity = await createActivity(value);
      await refresh();
      choose(activity);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create activity.');
      setOpen(true);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (event.key === 'Tab' && options.length === 1) {
      choose(options[0].activity);
      return;
    }
    if (event.key === 'ArrowDown' && optionCount > 0) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => (index + 1) % optionCount);
    } else if (event.key === 'ArrowUp' && optionCount > 0) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => (index - 1 + optionCount) % optionCount);
    } else if (event.key === 'Enter' && open && optionCount > 0) {
      event.preventDefault();
      if (activeIndex < options.length) choose(options[activeIndex].activity);
      else void createFromInput();
    }
  }

  return (
    <div className="activity-input-wrap">
      <input id="session-title" className="title-input" value={value} maxLength={80}
        disabled={disabled} autoComplete="off" role="combobox" aria-autocomplete="list"
        aria-expanded={open && optionCount > 0} aria-controls="activity-options"
        onFocus={() => setOpen(true)} onKeyDown={onKeyDown}
        onChange={(event) => { onChange(event.target.value); setActiveIndex(0); setOpen(true); setError(''); }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        placeholder="What are you working on?" />
      {open && optionCount > 0 && (
        <div id="activity-options" className="activity-options" role="listbox" aria-label="Activity suggestions">
          {options.map(({ activity, kind }, index) => (
            <button type="button" role="option" aria-selected={activeIndex === index}
              className={activeIndex === index ? 'activity-option active' : 'activity-option'}
              key={activity.id} onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(activity)}>
              <span>{activity.name}</span><small>{kind === 'fuzzy' ? 'Similar name' : kind === 'token' ? 'Contains this term' : 'Starts with this'}</small>
            </button>
          ))}
          {showCreate && (
            <button type="button" role="option" aria-selected={activeIndex === options.length}
              className={activeIndex === options.length ? 'activity-option activity-create active' : 'activity-option activity-create'}
              onMouseDown={(event) => event.preventDefault()} onClick={() => void createFromInput()}>
              <span>Create “{value.trim()}”</span><small>New activity</small>
            </button>
          )}
        </div>
      )}
      {matches.exact && <span className="activity-hint">Recognized activity · {matches.exact.name}</span>}
      {error && <span className="activity-error" role="alert">{error}</span>}
    </div>
  );
}

export function ActivitySettings() {
  const [activities, setActivities] = useState<StudyActivity[]>([]);
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [search, setSearch] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setActivities(await listActivities(true));
  }
  useEffect(() => { void refresh(); }, []);

  const visible = activities.filter((activity) =>
    (includeArchived || activity.archivedAt === null) &&
    activity.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())
  );

  async function perform(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await action();
      await refresh();
      setName('');
      setEditingId(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update activities.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="activity-settings">
      <div className="history-header">
        <div><div className="eyebrow">YOUR PERSONAL CATALOG</div><h2>Activities</h2></div>
        <span className="history-zone">{activities.filter((item) => item.archivedAt === null).length} ACTIVE</span>
      </div>
      <p className="settings-description">Manage the names used to organize your study sessions. Archived activities remain attached to historical sessions.</p>
      <form className="activity-create-form" onSubmit={(event) => { event.preventDefault(); void perform(() => createActivity(name)); }}>
        <label className="field-label" htmlFor="new-activity">NEW ACTIVITY</label>
        <div className="activity-create-row">
          <input id="new-activity" className="title-input" value={name} maxLength={80}
            onChange={(event) => setName(event.target.value)} placeholder="e.g. Linear Algebra" />
          <button className="primary-button" type="submit" disabled={busy || !name.trim()}>Add activity</button>
        </div>
      </form>
      <div className="activity-settings-tools">
        <input className="activity-search" aria-label="Search activities" value={search}
          onChange={(event) => setSearch(event.target.value)} placeholder="Search activities…" />
        <label className="archived-toggle"><input type="checkbox" checked={includeArchived}
          onChange={(event) => setIncludeArchived(event.target.checked)} /> Show archived</label>
      </div>
      {error && <div className="error-banner" role="alert">{error}</div>}
      <div className="managed-activities">
        {visible.map((activity) => (
          <div className="managed-activity" key={activity.id}>
            {editingId === activity.id ? (
              <form className="activity-edit-form" onSubmit={(event) => {
                event.preventDefault();
                void perform(() => renameActivity(activity.id, editingName));
              }}>
                <input className="activity-search" autoFocus value={editingName}
                  onChange={(event) => setEditingName(event.target.value)} maxLength={80} />
                <button type="submit" disabled={busy}>Save</button>
                <button type="button" onClick={() => setEditingId(null)}>Cancel</button>
              </form>
            ) : (
              <>
                <span className={activity.archivedAt === null ? 'managed-activity-name' : 'managed-activity-name archived'}>{activity.name}</span>
                {activity.archivedAt === null ? (
                  <>
                    <button type="button" onClick={() => { setEditingId(activity.id); setEditingName(activity.name); }}>Rename</button>
                    <button type="button" onClick={() => void perform(() => archiveActivity(activity.id))}>Archive</button>
                  </>
                ) : <button type="button" onClick={() => void perform(() => restoreActivity(activity.id))}>Restore</button>}
              </>
            )}
          </div>
        ))}
        {visible.length === 0 && <p className="settings-empty">No activities found.</p>}
      </div>
    </section>
  );
}
