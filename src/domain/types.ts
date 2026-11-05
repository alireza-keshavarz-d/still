export const DEFAULT_TIME_ZONE = 'Asia/Tehran';

export type SessionStatus = 'running' | 'paused' | 'completed';

export interface StudyActivity {
  id: string;
  name: string;
  normalizedName: string;
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
}

export interface StudySession {
  id: string;
  activityId: string;
  plannedSessionId?: string | null;
  title: string;
  note: string;
  status: SessionStatus;
  startedAt: number;
  endedAt: number | null;
  timezone: string;
  createdAt: number;
  updatedAt: number;
}

export interface StudyInterval {
  id: string;
  sessionId: string;
  startedAt: number;
  endedAt: number | null;
  checkpointAt: number;
}

export interface RecoveryCandidate {
  session: StudySession;
  interval: StudyInterval;
}

export interface DailySessionEntry {
  session: StudySession;
  durationMs: number;
}

export interface DailyHistoryEntry {
  date: string;
  durationMs: number;
  sessions: DailySessionEntry[];
}
