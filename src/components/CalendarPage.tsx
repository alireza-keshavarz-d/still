import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Play, CheckCircle2, SkipForward, XCircle } from 'lucide-react';
import { createPlannedSession, createStudyPlan, getAllPlannedSessions, skipSession, cancelSession, rescheduleSession } from '../data/planningRepository';
import { addCalendarDays, monthGridDates } from '../domain/planning/dateMath';
import { DEFAULT_TIME_ZONE } from '../domain/types';
import type { PlannedSession } from '../domain/planning/types';

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: DEFAULT_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const monthLabel = (month: string) => new Intl.DateTimeFormat('en', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(month + '-01T12:00:00Z'));

interface CalendarPageProps { onStartPlannedSession: (id: string) => Promise<void>; }

export default function CalendarPage({ onStartPlannedSession }: CalendarPageProps) {
  const [items, setItems] = useState<PlannedSession[]>([]);
  const [month, setMonth] = useState(today().slice(0, 7));
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'agenda'>('month');
  const [selected, setSelected] = useState(today());
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(today());
  const [time, setTime] = useState('');
  const [reminderTime, setReminderTime] = useState('');
  const [duration, setDuration] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showSequence, setShowSequence] = useState(false);
  const [planTitle, setPlanTitle] = useState('');
  const [sequence, setSequence] = useState([{ id: crypto.randomUUID(), title: '', daysAfter: 0 }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reload = useCallback(async () => setItems(await getAllPlannedSessions()), []);
  useEffect(() => { void reload().catch(() => setError('Could not load your calendar.')); }, [reload]);

  const days = useMemo(() => monthGridDates(month), [month]);
  const selectedItems = items.filter((item) => item.scheduledDate === selected).sort((a,b) => (a.scheduledTime ?? '').localeCompare(b.scheduledTime ?? ''));
  const weekStart = addCalendarDays(selected, -new Date(selected + 'T12:00:00Z').getUTCDay());
  const weekDays = Array.from({ length: 7 }, (_, index) => addCalendarDays(weekStart, index));
  const agendaItems = viewMode === 'agenda' ? items.filter((item) => item.status !== 'cancelled').sort((a,b) => a.scheduledDate.localeCompare(b.scheduledDate)) : selectedItems;
  const countFor = (day: string) => items.filter((item) => item.scheduledDate === day && item.status !== 'cancelled').length;

  async function perform(action: () => Promise<unknown>) {
    setBusy(true); setError('');
    try { await action(); await reload(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Calendar update failed.'); }
    finally { setBusy(false); }
  }

  async function add() {
    if (!title.trim()) { setError('Activity title is required.'); return; }
    await perform(async () => {
      await createPlannedSession({ title, scheduledDate: date, scheduledTime: time || null, timezone: DEFAULT_TIME_ZONE,
        estimatedDurationMinutes: duration ? Number(duration) : null, reminderEnabled: Boolean(time || reminderTime), reminderMinutesBefore: time ? 15 : null, reminderTime: !time && reminderTime ? reminderTime : null });
      setTitle(''); setTime(''); setDuration(''); setReminderTime(''); setShowCreate(false); setSelected(date); setMonth(date.slice(0,7));
    });
  }

  async function addSequence() {
    if (!planTitle.trim() || sequence.some((item) => !item.title.trim())) { setError('Enter a plan name and a title for every activity.'); return; }
    await perform(async () => {
      let activityDate = date;
      const inputs = sequence.map((item, index) => { if (index > 0) activityDate = addCalendarDays(activityDate, Math.max(1, item.daysAfter)); return { id: item.id, title: item.title, scheduledDate: activityDate, timezone: DEFAULT_TIME_ZONE, schedulingMode: index === 0 ? 'fixed' as const : 'relative' as const, predecessorId: index === 0 ? null : sequence[index - 1].id, intervalDays: index === 0 ? null : Math.max(1, item.daysAfter) }; });
      await createStudyPlan(planTitle, inputs); setPlanTitle(''); setSequence([{ id: crypto.randomUUID(), title: '', daysAfter: 0 }]); setShowSequence(false); setSelected(date); setMonth(date.slice(0,7));
    });
  }

  async function skip(item: PlannedSession) {
    const choice = window.confirm('Keep the remaining dates unchanged? Choose Cancel to recalculate the sequence.');
    await perform(() => skipSession(item.id, choice ? 'keep-dates' : 'recalculate'));
  }

  async function move(item: PlannedSession) {
    const next = window.prompt('New date (YYYY-MM-DD)', item.scheduledDate);
    if (next && next !== item.scheduledDate) {
      const cascade = window.confirm('Recalculate dependent activities too? Choose Cancel to move only this activity.');
      await perform(() => rescheduleSession(item.id, next, cascade));
    }
  }

  return <section className="calendar-page">
    <div className="calendar-heading">
      <div><div className="eyebrow">YOUR STUDY SCHEDULE</div><h2>Calendar</h2></div>
      <div className="calendar-heading-actions"><div className="calendar-view-switch" aria-label="Calendar view">{(['month', 'week', 'agenda'] as const).map((mode) => <button key={mode} className={viewMode === mode ? 'active' : ''} onClick={() => setViewMode(mode)}>{mode}</button>)}</div><button className="quiet-button" onClick={() => { setDate(selected); setShowSequence((v) => !v); setShowCreate(false); }}>Build a sequence</button><button className="primary-button" onClick={() => { setDate(selected); setShowCreate((v) => !v); setShowSequence(false); }}><Plus size={15}/> Plan session</button></div>
    </div>
    {error && <div className="error-banner" role="alert">{error}</div>}
    {showSequence && <form className="calendar-create" onSubmit={(event) => { event.preventDefault(); void addSequence(); }}>
      <div className="eyebrow">LEARNING SEQUENCE</div><h3 className="sequence-title">Plan what comes next</h3>
      <label className="field-label" htmlFor="plan-title">PLAN NAME</label><input id="plan-title" className="title-input" value={planTitle} onChange={(e) => setPlanTitle(e.target.value)} placeholder="e.g. Cell biology revision"/>
      <label className="field-label" htmlFor="sequence-start">FIRST ACTIVITY DATE</label><input id="sequence-start" type="date" value={date} onChange={(e) => setDate(e.target.value)} required/>
      {sequence.map((item,index)=><div className="sequence-row" key={item.id}><label>ACTIVITY {index+1}<input className="title-input" value={item.title} onChange={(e)=>setSequence((rows)=>rows.map((row,i)=>i===index?{...row,title:e.target.value}:row))} placeholder={index===0?'Read the chapter':'Practice questions'}/></label>{index>0&&<label>DAYS AFTER PREVIOUS<input type="number" min="1" max="365" value={item.daysAfter} onChange={(e)=>setSequence((rows)=>rows.map((row,i)=>i===index?{...row,daysAfter:Number(e.target.value)}:row))}/></label>}<button type="button" className="sequence-remove" disabled={sequence.length===1} onClick={()=>setSequence((rows)=>rows.filter((row)=>row.id!==item.id))}>Remove</button></div>)}
      <div className="calendar-form-actions"><button type="button" className="quiet-button" onClick={()=>setSequence((rows)=>[...rows,{id:crypto.randomUUID(),title:'',daysAfter:3}])}>Add activity</button><button className="primary-button" type="submit" disabled={busy}>Save sequence</button><button type="button" className="quiet-button" onClick={()=>setShowSequence(false)}>Cancel</button></div>
    </form>}
    {showCreate && <form className="calendar-create" onSubmit={(event) => { event.preventDefault(); void add(); }}>
      <label className="field-label" htmlFor="planned-title">ACTIVITY</label>
      <input id="planned-title" className="title-input" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Review chapter 4"/>
      <div className="calendar-form-grid">
        <label>DATE<input type="date" value={date} onChange={(e) => setDate(e.target.value)} required/></label>
        <label>TIME (OPTIONAL)<input type="time" value={time} onChange={(e) => setTime(e.target.value)}/></label>
        <label>DURATION (OPTIONAL)<input type="number" min="1" max="1440" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="Minutes"/></label>
      </div>
      {!time && <label className="reminder-time-field">REMINDER TIME ON THIS DATE (OPTIONAL)<input type="time" value={reminderTime} onChange={(e) => setReminderTime(e.target.value)}/></label>}
      {time && <p className="reminder-note">A reminder is scheduled 15 minutes before this time. Browser notifications require permission; otherwise Still shows an in-app reminder while open.</p>}
      <div className="calendar-form-actions"><button className="primary-button" type="submit" disabled={busy}>Save planned session</button><button className="quiet-button" type="button" onClick={() => setShowCreate(false)}>Cancel</button></div>
    </form>}
    <div className={viewMode === 'agenda' ? 'calendar-layout agenda-only' : 'calendar-layout'}>
      {viewMode === 'month' && <div className="calendar-month">
        <div className="calendar-month-head"><button aria-label="Previous month" onClick={() => { const d=new Date(month+'-01T12:00:00Z'); d.setUTCMonth(d.getUTCMonth()-1); setMonth(d.toISOString().slice(0,7)); }}><ChevronLeft size={17}/></button><h3>{monthLabel(month)}</h3><button aria-label="Next month" onClick={() => { const d=new Date(month+'-01T12:00:00Z'); d.setUTCMonth(d.getUTCMonth()+1); setMonth(d.toISOString().slice(0,7)); }}><ChevronRight size={17}/></button></div>
        <div className="calendar-grid">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day) => <span className="calendar-weekday" key={day}>{day}</span>)}
          {days.map((day) => <button key={day} className={'calendar-day'+(day.slice(0,7)!==month?' outside':'')+(day===selected?' selected':'')+(day===today()?' today':'')} onClick={() => setSelected(day)}><span>{Number(day.slice(-2))}</span>{countFor(day)>0&&<i>{countFor(day)}</i>}</button>)}
        </div>
        <button className="calendar-today" onClick={() => { setSelected(today()); setMonth(today().slice(0,7)); }}>Jump to today</button>
      </div>}
      {viewMode === 'week' && <div className="calendar-month calendar-week-view">
        <div className="calendar-month-head"><button aria-label="Previous week" onClick={() => setSelected(addCalendarDays(selected, -7))}><ChevronLeft size={17}/></button><h3>Week of {weekDays[0]}</h3><button aria-label="Next week" onClick={() => setSelected(addCalendarDays(selected, 7))}><ChevronRight size={17}/></button></div>
        <div className="calendar-week-days">{weekDays.map((day) => <button key={day} className={day === selected ? 'selected' : ''} onClick={() => setSelected(day)}><small>{new Intl.DateTimeFormat('en',{weekday:'short',timeZone:'UTC'}).format(new Date(day+'T12:00:00Z'))}</small><strong>{Number(day.slice(-2))}</strong><i>{countFor(day)} planned</i></button>)}</div>
        <button className="calendar-today" onClick={() => setSelected(today())}>Jump to today</button>
      </div>}
      <div className="calendar-agenda">
        <div className="calendar-agenda-head"><div><div className="eyebrow">AGENDA</div><h3>{viewMode === 'agenda' ? 'Upcoming activities' : new Intl.DateTimeFormat('en',{timeZone:'UTC',weekday:'long',month:'long',day:'numeric'}).format(new Date(selected+'T12:00:00Z'))}</h3></div><span>{agendaItems.length} ACTIVITIES</span></div>
        {agendaItems.length===0?<div className="calendar-empty">Nothing planned for this day.<button className="quiet-button" onClick={() => {setDate(selected);setShowCreate(true);}}>Add an activity <Plus size={13}/></button></div>:
          <div className="planned-list">{agendaItems.map((item)=><article className="planned-card" key={item.id}><div className="planned-card-main"><span className={'planned-status status-'+item.status}></span><div><strong>{item.title}</strong><small>{viewMode === 'agenda' ? item.scheduledDate + ' · ' : ''}{item.scheduledTime ?? 'Flexible time'}{item.estimatedDurationMinutes ? ' · '+item.estimatedDurationMinutes+' min' : ''} · {item.status.replace('_',' ')}</small></div></div>
            {item.status==='scheduled'&&<div className="planned-actions"><button title="Start session" disabled={busy} onClick={()=>void perform(()=>onStartPlannedSession(item.id))}><Play size={14}/></button><button title="Reschedule" disabled={busy} onClick={()=>void move(item)}><ChevronRight size={14}/></button><button title="Skip" disabled={busy} onClick={()=>void skip(item)}><SkipForward size={14}/></button><button title="Cancel" disabled={busy} onClick={()=>void perform(()=>cancelSession(item.id))}><XCircle size={14}/></button></div>}
            {item.status==='in_progress'&&<span className="planned-in-progress">IN PROGRESS</span>}
            {item.status==='completed'&&<span className="planned-in-progress"><CheckCircle2 size={13}/> COMPLETED</span>}
          </article>)}</div>}
      </div>
    </div>
}
