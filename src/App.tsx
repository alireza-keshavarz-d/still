import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityNameInput, ActivitySettings } from './ActivityComponents';
import {
  ArrowRight, CalendarDays, Check, ChevronRight, CircleDot, Clock3, History,
  MoonStar, Pause, Pencil, Play, Plus, RotateCcw, Sparkles, Square, Timer, X
} from 'lucide-react';
import {
  checkpointRunningSession, getAllIntervals, getAllSessions, getRecoveryCandidate,
  pauseSession, recoverInterruptedSession, resumeSession, startSession, stopSession,
  updateSessionDetails
} from './data/sessionRepository';
import {
  buildDailyHistory, formatClock, formatCompactDuration, formatDateLabel,
  formatDuration, getDateKey, getSessionDurationMs
} from './domain/time';
import { DEFAULT_TIME_ZONE } from './domain/types';
import type { DailyHistoryEntry, RecoveryCandidate, StudyInterval, StudySession } from './domain/types';

type View = 'focus' | 'history' | 'insights' | 'settings';
const TIME_ZONE = DEFAULT_TIME_ZONE;
const CHECKPOINT_INTERVAL_MS = 30_000;

function dateLabel(timestamp: number): string {
  return new Intl.DateTimeFormat('en', {
    timeZone: TIME_ZONE, weekday: 'long', month: 'long', day: 'numeric'
  }).format(new Date(timestamp));
}

function statusLabel(status: StudySession['status']): string {
  return status === 'running' ? 'IN FOCUS' : status === 'paused' ? 'PAUSED' : 'COMPLETED';
}

function App() {
  const [view, setView] = useState<View>('focus');
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [intervals, setIntervals] = useState<StudyInterval[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(true);
  const [title, setTitle] = useState('Study session');
  const [note, setNote] = useState('');
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [recovery, setRecovery] = useState<RecoveryCandidate | null>(null);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  const currentSession = !creating ? sessions.find((session) => session.id === selectedId) : undefined;
  const runningSession = sessions.find((session) => session.status === 'running');
  const pausedSessions = sessions.filter((session) => session.status === 'paused')
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const reload = useCallback(async () => {
    const [nextSessions, nextIntervals] = await Promise.all([getAllSessions(), getAllIntervals()]);
    setSessions(nextSessions);
    setIntervals(nextIntervals);
  }, []);

  const persistSessionDetails = useCallback(async (id: string, nextTitle: string, nextNote: string): Promise<boolean> => {
    try {
      await updateSessionDetails(id, nextTitle, nextNote);
      await reload();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save session details.');
      return false;
    }
  }, [reload]);

  useEffect(() => {
    let mounted = true;
    async function initialize() {
      try {
        const [nextSessions, nextIntervals, candidate] = await Promise.all([
          getAllSessions(), getAllIntervals(), getRecoveryCandidate()
        ]);
        if (!mounted) return;
        setSessions(nextSessions);
        setIntervals(nextIntervals);
        setRecovery(candidate);
        const selected = nextSessions.find((item) => item.status === 'running')
          ?? nextSessions.filter((item) => item.status === 'paused')
            .sort((a, b) => b.updatedAt - a.updatedAt)[0];
        setSelectedId(selected?.id ?? null);
        setCreating(!selected);
        if (selected) {
          setTitle(selected.title);
          setNote(selected.note);
        }
      } catch (caught) {
        if (mounted) setError(caught instanceof Error ? caught.message : 'Unable to open local storage.');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void initialize();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!runningSession) return;
    const checkpoint = () => {
      void checkpointRunningSession().catch(() => setError('Could not save the latest timer checkpoint.'));
    };
    const intervalId = window.setInterval(checkpoint, CHECKPOINT_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') checkpoint();
    };
    window.addEventListener('pagehide', checkpoint);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('pagehide', checkpoint);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [runningSession?.id]);

  useEffect(() => {
    if (!currentSession) return;
    setTitle(currentSession.title);
    setNote(currentSession.note);
  }, [currentSession?.id]);

  useEffect(() => {
    if (!currentSession || (title === currentSession.title && note === currentSession.note)) return;
    const timeout = window.setTimeout(() => {
      setSaving(true);
      void persistSessionDetails(currentSession.id, title, note)
        .finally(() => setSaving(false));
    }, 450);
    return () => window.clearTimeout(timeout);
  }, [title, note, currentSession?.id, persistSessionDetails]);

  const dailyHistory = useMemo(
    () => buildDailyHistory(sessions, intervals, TIME_ZONE, now),
    [sessions, intervals, now]
  );
  const todayKey = getDateKey(now, TIME_ZONE);
  const todayTotal = dailyHistory.find((day) => day.date === todayKey)?.durationMs ?? 0;
  const activeIntervals = currentSession
    ? intervals.filter((interval) => interval.sessionId === currentSession.id) : [];
  const activeDuration = getSessionDurationMs(activeIntervals, now);

  async function perform(action: () => Promise<void>): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setError('');
    try {
      await action();
      await reload();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function startNewSession() {
    if (busy) return;
    if (currentSession && (title !== currentSession.title || note !== currentSession.note)) {
      const saved = await persistSessionDetails(currentSession.id, title, note);
      if (!saved) return;
    }
    setSelectedId(null);
    setCreating(true);
    setTitle('Study session');
    setNote('');
    setView('focus');
  }

  async function toggleSession() {
    if (currentSession?.status === 'running') {
      await perform(() => pauseSession(currentSession.id));
      return;
    }
    if (currentSession?.status === 'paused') {
      await perform(() => resumeSession(currentSession.id));
      return;
    }
    const succeeded = await perform(async () => {
      const session = await startSession(title, note);
      setSelectedId(session.id);
      setCreating(false);
      setTitle(session.title);
      setNote(session.note);
    });
    if (succeeded) setCreating(false);
  }

  async function finishSession() {
    if (!currentSession) return;
    const session = currentSession;
    const succeeded = await perform(async () => {
      // Flush the latest text edits before the session is finalized.
      await updateSessionDetails(session.id, title, note);
      await stopSession(session.id);
    });
    if (succeeded) {
      setSelectedId(null);
      setCreating(true);
      setTitle('Study session');
      setNote('');
    }
  }

  async function chooseRecovery(countGap: boolean) {
    if (!recovery) return;
    const sessionId = recovery.session.id;
    const succeeded = await perform(() => recoverInterruptedSession(sessionId, countGap));
    if (succeeded) {
      setRecovery(null);
      setSelectedId(sessionId);
      setCreating(false);
    }
  }

  function selectPausedSession(session: StudySession) {
    setSelectedId(session.id);
    setCreating(false);
    setTitle(session.title);
    setNote(session.note);
    setView('focus');
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
      const target = event.target;
      if (target instanceof HTMLElement &&
        (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName))) return;
      if (recovery || loading || busy || view !== 'focus') return;
      event.preventDefault();
      void toggleSession();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentSession?.id, currentSession?.status, title, note, recovery, loading, busy, view]);

  const todaySessions = dailyHistory.find((day) => day.date === todayKey)?.sessions.length ?? 0;
  const clock = formatClock(now, TIME_ZONE);

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#focus" onClick={(event) => { event.preventDefault(); setView('focus'); }}>
          <span className="brand-mark"><Clock3 size={18} strokeWidth={1.7} /></span>
          <span className="brand-copy"><span className="brand-name">STILL</span><span className="brand-tagline">A little more intentional.</span></span>
        </a>
        <div className="topbar-right">
          <div className="local-clock"><span className="live-dot" /><span className="clock-zone">TEHRAN · IRST</span><span className="clock-value">{clock}</span></div>
          <div className="topbar-divider" />
          <span className="offline-indicator"><span /> LOCAL STORAGE</span>
        </div>
      </header>

      <main className="main-content">
        <div className="page-intro">
          <div>
            {/* <div className="eyebrow">YOUR PERSONAL TIMEKEEPER</div> */}
            <h1>{view === 'focus' ? 'Stay with the work.' : view === 'history' ? 'Look back, clearly.' : view === 'settings' ? 'Keep your catalog clear.' : 'Insights, in time.'}</h1>
            <p>{view === 'focus' ? 'Give your attention to one thing at a time.' : view === 'history' ? 'Every focused interval, accounted for.' : view === 'settings' ? 'Manage the activities attached to your sessions.' : 'A clearer picture of how you spend your focus.'}</p>
          </div>
          <div className="today-date"><CalendarDays size={14} /> {dateLabel(now)}</div>
        </div>

        <nav className="view-tabs" aria-label="Main navigation">
          <button className={view === 'focus' ? 'view-tab active' : 'view-tab'} onClick={() => setView('focus')}><Timer size={16} /> Focus</button>
          <button className={view === 'history' ? 'view-tab active' : 'view-tab'} onClick={() => setView('history')}><History size={16} /> History</button>
          <button className={view === 'insights' ? 'view-tab active' : 'view-tab'} onClick={() => setView('insights')}><Sparkles size={16} /> Insights <span className="soon-tag">LATER</span></button>
          <button className={view === 'settings' ? 'view-tab active' : 'view-tab'} onClick={() => setView('settings')}><Pencil size={16} /> Settings</button>
        </nav>

        {error && <div className="error-banner" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError('')}><X size={16} /></button></div>}

        {loading ? (
          <div className="loading-state"><span className="loading-spinner" /> Opening your workspace…</div>
        ) : view === 'focus' ? (
          <section className="focus-layout">
            <div className={'timer-card ' + (currentSession?.status === 'running' ? 'is-running' : '')}>
              <div className="timer-card-top">
                <span className="session-kicker">CURRENT SESSION</span>
                <span className={'session-status ' + (currentSession?.status === 'running' ? 'status-running' : '')}>
                  <span className="status-indicator" />{currentSession ? statusLabel(currentSession.status) : 'READY TO BEGIN'}
                </span>
              </div>
              <div className="timer-center">
                <div className="timer-digits" aria-label={'Study time ' + formatDuration(activeDuration)}>{formatDuration(activeDuration)}</div>
                {/* <div className="timer-label">TIME IN FOCUS</div> */}
                {/* <p className="timer-description">
                  {currentSession?.status === 'running' ? 'Your attention is being counted.' :
                    currentSession?.status === 'paused' ? 'Paused time stays outside your total.' :
                    'Start when you are ready. The rest can wait.'}
                </p> */}
              </div>
              <div className="timer-controls">
                <button className="primary-button" disabled={busy} onClick={() => void toggleSession()}>
                  {currentSession?.status === 'running' ? <><Pause size={17} fill="currentColor" /> Pause session</> :
                    currentSession?.status === 'paused' ? <><Play size={17} fill="currentColor" /> Resume session</> :
                    <><Play size={17} fill="currentColor" /> Start studying</>}
                </button>
                {currentSession && <button className="stop-button" disabled={busy} onClick={() => void finishSession()}><Square size={14} fill="currentColor" /> Stop</button>}
                {currentSession?.status === 'paused' && <button className="quiet-button" onClick={startNewSession}><Plus size={15} /> New session</button>}
              </div>
              <div className="keyboard-hint"><kbd>SPACE</kbd><span>pause or resume</span></div>
              {/* <div className="timer-bottom">
                <span><span className="bottom-dot" /> {currentSession?.status === 'running' ? 'Counting active time' : 'Only active intervals are counted'}</span>
                <span>NO DISTRACTIONS, JUST TIME.</span>
              </div> */}
            </div>

            <div className="detail-grid">
              <section className="detail-card session-detail">
                <div className="detail-heading">
                  <span className="detail-icon"><Pencil size={15} /></span><span>SESSION DETAILS</span>
                  {currentSession && <span className="autosave"><Check size={12} /> {saving ? 'SAVING' : 'SAVED'}</span>}
                </div>
                <label className="field-label" htmlFor="session-title">SESSION NAME</label>
                <ActivityNameInput value={title} onChange={setTitle} disabled={busy} />
                <label className="field-label note-label" htmlFor="session-note">NOTE</label>
                <textarea id="session-note" className="note-input" value={note} maxLength={4000}
                  onChange={(event) => setNote(event.target.value)}
                  onBlur={() => {
                    if (currentSession && (title !== currentSession.title || note !== currentSession.note)) {
                      void persistSessionDetails(currentSession.id, title, note);
                    }
                  }}
                  placeholder="Capture a thought, a question, or where to continue…" rows={3} />
                {!currentSession && <p className="field-footnote">Your title and note will be saved when you start.</p>}
              </section>

              <section className="detail-card today-card">
                <div className="detail-heading"><span className="detail-icon"><MoonStar size={15} /></span><span>YOUR DAY</span></div>
                <div className="today-total">{formatCompactDuration(todayTotal)}</div>
                <div className="today-caption">FOCUSED TODAY · TEHRAN TIME</div>
                <div className="today-footnote"><span>{todaySessions} sessions</span><button onClick={() => setView('history')}>View history <ArrowRight size={13} /></button></div>
              </section>
            </div>

            {creating && pausedSessions.length > 0 && (
              <section className="paused-list">
                <div className="paused-list-heading"><div><div className="eyebrow">PICK UP WHERE YOU LEFT OFF</div><h2>Paused sessions</h2></div><span>{pausedSessions.length} SAVED</span></div>
                {pausedSessions.map((session) => {
                  const duration = getSessionDurationMs(intervals.filter((item) => item.sessionId === session.id), now);
                  return (
                    <button key={session.id} className="paused-row" onClick={() => selectPausedSession(session)}>
                      <span className="paused-row-icon"><CircleDot size={15} /></span>
                      <span className="paused-row-copy"><strong>{session.title}</strong><small>{session.note || 'No note attached'}</small></span>
                      <span className="paused-row-time">{formatCompactDuration(duration)}</span><ChevronRight size={16} />
                    </button>
                  );
                })}
              </section>
            )}
          </section>
        ) : view === 'history' ? (
          <section className="history-layout">
            <div className="history-header"><div><div className="eyebrow">YOUR STUDY RECORD</div><h2>Past sessions</h2></div><div className="history-zone">DAILY TOTALS · ASIA/TEHRAN</div></div>
            {dailyHistory.length === 0 ? (
              <div className="empty-history"><div className="empty-icon"><History size={23} /></div><h3>Nothing here yet.</h3><p>Your sessions will appear here, grouped by day.</p><button className="primary-button" onClick={() => setView('focus')}>Start your first session <ArrowRight size={15} /></button></div>
            ) : (
              <div className="history-days">
                {dailyHistory.map((day) => (
                  <HistoryDay key={day.date} day={day} expandedId={expandedHistoryId}
                    onSelect={(id) => setExpandedHistoryId((current) => current === id ? null : id)}
                    onEdit={persistSessionDetails} />
                ))}
              </div>
            )}
          </section>
        ) : view === 'settings' ? (
          <ActivitySettings />
        ) : (
          <section className="insights-placeholder">
            <div className="insights-orb"><Sparkles size={25} /></div><div className="eyebrow">A FUTURE VIEW</div>
            <h2>Meaningful patterns, not noise.</h2>
            <p>Analytics will be designed around your actual study history. First, every minute needs to be recorded correctly.</p>
            <button className="quiet-button" onClick={() => setView('history')}>Explore your history <ArrowRight size={14} /></button>
          </section>
        )}
      </main>

      {/* <footer className="app-footer">
        <span>STILL <i>·</i> FOCUS TIME</span>
        <span><span className="footer-status-dot" /> {storagePersistent ? 'PERSISTENT LOCAL STORAGE' : 'LOCAL STORAGE · KEEP A BACKUP'}</span>
        <span>BUILT FOR YOUR ATTENTION</span>
      </footer> */}

      {recovery && (
        <div className="modal-backdrop" role="presentation">
          <section className="recovery-modal" role="dialog" aria-modal="true" aria-labelledby="recovery-title">
            <div className="recovery-icon"><RotateCcw size={19} /></div><div className="eyebrow">SESSION RECOVERY</div>
            <h2 id="recovery-title">Welcome back.</h2>
            <p className="recovery-copy"><strong>{recovery.session.title}</strong> was running when Still was last closed. Should the time since the last checkpoint count as study time?</p>
            <div className="checkpoint-row"><span>LAST CHECKPOINT</span><strong>{formatClock(recovery.interval.checkpointAt, TIME_ZONE)}</strong></div>
            <button className="primary-button recovery-primary" disabled={busy} onClick={() => void chooseRecovery(true)}><Check size={16} /> Count the time & continue</button>
            <button className="recovery-secondary" disabled={busy} onClick={() => void chooseRecovery(false)}>Exclude the gap & pause session</button>
            <p className="recovery-footnote">Time before the checkpoint is saved and will not be lost.</p>
          </section>
        </div>
      )}
    </div>
  );
}

interface HistoryDayProps {
  day: DailyHistoryEntry;
  expandedId: string | null;
  onSelect: (id: string) => void;
  onEdit: (id: string, title: string, note: string) => Promise<boolean>;
}

function HistoryDay({ day, expandedId, onSelect, onEdit }: HistoryDayProps) {
  return (
    <section className="history-day">
      <div className="history-day-heading">
        <div><h3>{formatDateLabel(day.date, TIME_ZONE)}</h3><span>{day.sessions.length} {day.sessions.length === 1 ? 'SESSION' : 'SESSIONS'}</span></div>
        <strong>{formatCompactDuration(day.durationMs)}</strong>
      </div>
      <div className="history-session-list">
        {day.sessions.map(({ session, durationMs }) => (
          <HistorySessionRow
            key={day.date + '-' + session.id}
            session={session}
            durationMs={durationMs}
            expanded={expandedId === session.id}
            onSelect={() => onSelect(session.id)}
            onEdit={onEdit}
          />
        ))}
      </div>
    </section>
  );
}

interface HistorySessionRowProps {
  session: StudySession;
  durationMs: number;
  expanded: boolean;
  onSelect: () => void;
  onEdit: HistoryDayProps['onEdit'];
}

function HistorySessionRow({ session, durationMs, expanded, onSelect, onEdit }: HistorySessionRowProps) {
  const [titleDraft, setTitleDraft] = useState(session.title);
  const [noteDraft, setNoteDraft] = useState(session.note);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    setTitleDraft(session.title);
    setNoteDraft(session.note);
  }, [session.id, session.title, session.note]);

  useEffect(() => {
    if (!expanded || (titleDraft === session.title && noteDraft === session.note)) return;
    const timeout = window.setTimeout(() => {
      setSaving(true);
      setSaveError('');
      void onEdit(session.id, titleDraft, noteDraft)
        .then((success) => {
          if (!success) setSaveError('Not saved. Please retry.');
        })
        .finally(() => setSaving(false));
    }, 450);
    return () => window.clearTimeout(timeout);
  }, [expanded, titleDraft, noteDraft, session.id, session.title, session.note, onEdit]);

  return (
    <article className="history-session">
      <button className="history-session-main" onClick={onSelect} aria-expanded={expanded}>
        <span className={'history-session-mark ' + (session.status === 'running' ? 'mark-running' : '')}><CircleDot size={15} /></span>
        <span className="history-session-copy">
          <strong>{session.title}</strong>
          <span>{formatClock(session.startedAt, TIME_ZONE).slice(0, 5)} · {statusLabel(session.status)}</span>
        </span>
        <span className="history-session-duration">{formatCompactDuration(durationMs)}</span>
        <ChevronRight className={expanded ? 'chevron-open' : ''} size={16} />
      </button>
      {expanded && (
        <div className="history-session-details">
          <label className="field-label" htmlFor={'history-title-' + session.id}>SESSION NAME</label>
          <input id={'history-title-' + session.id} className="title-input" value={titleDraft}
            maxLength={80} onChange={(event) => setTitleDraft(event.target.value)}
            onBlur={() => {
              if (titleDraft !== session.title || noteDraft !== session.note) {
                void onEdit(session.id, titleDraft, noteDraft);
              }
            }} />
          <label className="field-label note-label" htmlFor={'history-note-' + session.id}>NOTE</label>
          <textarea id={'history-note-' + session.id} className="note-input" value={noteDraft}
            maxLength={4000} rows={3} onChange={(event) => setNoteDraft(event.target.value)}
            onBlur={() => {
              if (titleDraft !== session.title || noteDraft !== session.note) {
                void onEdit(session.id, titleDraft, noteDraft);
              }
            }}
            placeholder="Add a note about this session…" />
          <span>Started {formatClock(session.startedAt, TIME_ZONE)}{session.endedAt ? ' · Finished ' + formatClock(session.endedAt, TIME_ZONE) : ''}</span>
          <span className="history-save-status">{saveError || (saving ? 'Saving changes…' : 'Changes are saved automatically')}</span>
        </div>
      )}
    </article>
  );
}
export default App;