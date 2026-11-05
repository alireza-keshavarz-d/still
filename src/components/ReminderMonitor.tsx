import { useEffect, useState } from 'react';
import { findDueReminders } from '../application/reminderService';
import { getAllPlannedSessions, markReminderNotified } from '../data/planningRepository';

export default function ReminderMonitor() {
  const [message, setMessage] = useState('');
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(
    'Notification' in window ? Notification.permission : 'unsupported'
  );

  useEffect(() => {
    let previous = Date.now() - 30_000;
    const check = async () => {
      const now = Date.now();
      const due = findDueReminders(await getAllPlannedSessions(), previous, now);
      previous = now;
      for (const item of due) {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('Study session coming up', { body: item.title });
        } else {
          setMessage(item.title + ' is coming up.');
        }
        await markReminderNotified(item.id, now);
      }
    };
    void check().catch(() => undefined);
    const timer = window.setInterval(() => { void check().catch(() => undefined); }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  async function enable() {
    if (!('Notification' in window)) { setPermission('unsupported'); return; }
    const result = await Notification.requestPermission();
    setPermission(result);
  }

  return <div className="reminder-monitor">
    {permission !== 'granted' && permission !== 'unsupported' && <button className="reminder-enable" onClick={() => void enable()}>Enable browser notifications</button>}
    {permission === 'unsupported' && <span className="reminder-note">Browser notifications are unavailable; in-app reminders are used while this page is open.</span>}
    {message && <div className="calendar-reminder" role="status">{message}<button onClick={() => setMessage('')}>Dismiss</button></div>}
  </div>;
}
