import { useMemo, useState } from 'react';
import { Activity, CalendarDays, ChevronLeft, ChevronRight, Clock3, Flame, Target, TrendingUp } from 'lucide-react';
import { buildStudyAnalytics, type AnalyticsRange } from '../domain/analytics';
import { formatCompactDuration } from '../domain/time';
import type { StudyInterval, StudySession } from '../domain/types';
interface InsightsPageProps { sessions: StudySession[]; intervals: StudyInterval[]; now: number }
const ranges: { value: AnalyticsRange; label: string }[] = [
  { value: '7d', label: '7 days' }, { value: '30d', label: '30 days' }, { value: '90d', label: '90 days' }, { value: 'all', label: 'All time' }
];
function InsightsPage({ sessions, intervals, now }: InsightsPageProps) {
  const [range, setRange] = useState<AnalyticsRange>('30d');
  const [chartEndIndex, setChartEndIndex] = useState<number | null>(null);
  const data = useMemo(() => buildStudyAnalytics(sessions, intervals, range, now), [sessions, intervals, range, now]);
  const chartWindowSize = 30;
  const chartEnd = Math.min(chartEndIndex ?? data.daily.length, data.daily.length);
  const chartStart = Math.max(0, chartEnd - chartWindowSize);
  const visibleDays = data.daily.slice(chartStart, chartEnd);
  const maxDay = Math.max(1, ...visibleDays.map((day) => day.durationMs));
  const canMoveChartBack = chartStart > 0;
  const canMoveChartForward = chartEnd < data.daily.length;
  const maxActivity = Math.max(1, ...data.activities.map((activity) => activity.durationMs));
  return <section className="insights-page" aria-label="Study analytics">
    <div className="insights-toolbar"><div><div className="eyebrow">YOUR STUDY PATTERNS</div><p>Built from saved focus intervals · Asia/Tehran</p></div>
      <div className="insights-range" role="group" aria-label="Analytics date range">{ranges.map((item) => <button key={item.value} className={range === item.value ? 'active' : ''} aria-pressed={range === item.value} onClick={() => { setRange(item.value); setChartEndIndex(null); }}>{item.label}</button>)}</div>
    </div>
    <div className="insights-metrics">
      <article className="insight-metric insight-primary"><span><Clock3 size={14} /> TOTAL FOCUS</span><strong>{formatCompactDuration(data.totalDurationMs)}</strong><small>{data.sessionCount} sessions in this period</small></article>
      <article className="insight-metric"><span><CalendarDays size={14} /> DAILY AVERAGE</span><strong>{formatCompactDuration(data.averageDailyDurationMs)}</strong><small>Across calendar days in range</small></article>
      <article className="insight-metric"><span><Target size={14} /> ACTIVE DAYS</span><strong>{data.activeDays}<small> / {data.daily.length}</small></strong><small>Days with recorded focus</small></article>
      <article className="insight-metric"><span><Flame size={14} /> CURRENT STREAK</span><strong>{data.currentStreak}<small> days</small></strong><small>Consecutive days with focus</small></article>
    </div>
    {data.sessionCount === 0 ? <div className="insights-empty"><div className="insights-orb"><TrendingUp size={22} /></div><h2>Your patterns start here.</h2><p>Complete a few focus sessions and this space will show how your study time is distributed.</p></div> : <>
      <section className="insight-panel"><div className="insight-panel-heading"><div><div className="eyebrow">CONSISTENCY</div><h2>Daily focus</h2></div><div className="daily-chart-controls"><span>{data.activeDays} active days</span><button type="button" aria-label="Show earlier days" disabled={!canMoveChartBack} onClick={() => setChartEndIndex(Math.max(chartWindowSize, chartEnd - chartWindowSize))}><ChevronLeft size={14} /></button><button type="button" aria-label="Show later days" disabled={!canMoveChartForward} onClick={() => setChartEndIndex(Math.min(data.daily.length, chartEnd + chartWindowSize))}><ChevronRight size={14} /></button></div></div>
        <div className="daily-chart-window" aria-label={`Daily focus from ${visibleDays[0]?.date ?? '—'} to ${visibleDays[visibleDays.length - 1]?.date ?? '—'}`}>
          <div className="daily-chart" style={{ gridTemplateColumns: `repeat(${visibleDays.length}, minmax(0, 1fr))` }}>{visibleDays.map((day) => <div className="daily-chart-column" key={day.date} title={day.date + ': ' + formatCompactDuration(day.durationMs)}><div className="daily-chart-track"><span style={{ height: (day.durationMs / maxDay * 100) + '%' }} /></div><small>{day.date.slice(-2)}</small></div>)}</div>
        </div>
        <div className="chart-window-caption"><span>{visibleDays[0]?.date ?? '—'} – {visibleDays[visibleDays.length - 1]?.date ?? '—'}</span><span>{data.daily.length > chartWindowSize ? '30-day window · navigate to explore' : `${visibleDays.length}-day view`}</span></div>
        <div className="chart-legend"><span>LOW</span><span>HIGH</span></div>
      </section>
      <div className="insights-two-column">
        <section className="insight-panel"><div className="insight-panel-heading"><div><div className="eyebrow">WHERE TIME GOES</div><h2>Activities</h2></div><Activity size={16} /></div>
          <div className="activity-breakdown">{data.activities.map((activity) => <div className="activity-breakdown-row" key={activity.activityId}><div className="activity-breakdown-copy"><strong>{activity.title}</strong><span>{activity.sessionCount} {activity.sessionCount === 1 ? 'session' : 'sessions'}</span></div><div className="activity-breakdown-bar"><span style={{ width: (activity.durationMs / maxActivity * 100) + '%' }} /></div><b>{formatCompactDuration(activity.durationMs)}</b></div>)}</div>
        </section>
        <section className="insight-panel"><div className="insight-panel-heading"><div><div className="eyebrow">YOUR RECORDS</div><h2>Highlights</h2></div><TrendingUp size={16} /></div>
          <div className="insight-highlights"><div><span>Longest focus day</span><strong>{data.bestDay ? formatCompactDuration(data.bestDay.durationMs) : '—'}</strong><small>{data.bestDay?.date ?? 'No data yet'}</small></div>
            <div><span>Longest session</span><strong>{formatCompactDuration(data.longestSessionMs)}</strong><small>Single session record</small></div>
            <div><span>Best streak</span><strong>{data.longestStreak} days</strong><small>Longest run of active days</small></div>
            <div><span>Average session</span><strong>{formatCompactDuration(data.averageSessionDurationMs)}</strong><small>Across {data.sessionCount} sessions</small></div>
          </div>
        </section>
      </div>
    </>}
  </section>;
}
export default InsightsPage;
