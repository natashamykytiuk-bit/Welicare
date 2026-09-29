// @ts-check
// Resident engagement: turns the activitySessions play-time log (written by
// hooks/useActivitySession.js) into time per activity for the caregiver's
// Resident Profile screen. The summarising is pure so it's unit-tested
// (tests/engagementStats.test.js); only loadResidentSessions talks to
// Firestore.

import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';

/**
 * Friendly names for each activityId the app logs. An id missing here (a
 * newer activity on an older app) still shows, just with its raw id.
 */
export const ACTIVITY_LABELS = {
  memoryMatch: 'Memory Match',
  molehunt: 'Molehunt',
  wordGames: 'Finish the Phrase',
  music: 'Music',
  movies: 'Movies & Videos',
  trivia: 'Trivia',
  photoAlbum: 'Photo Album',
  guidedMeditation: 'Guided Meditation & Exercise',
  conversationStarters: 'Conversation Starters',
};

/** The time ranges the screen offers, newest-first defaults. */
export const PERIODS = [
  { key: '7d', label: 'Last 7 days', days: 7 },
  { key: '30d', label: 'Last 30 days', days: 30 },
  { key: 'all', label: 'All time', days: null },
];

/**
 * @typedef {{
 *   activityId: string,
 *   durationSeconds: number,
 *   roundsCompleted?: number,
 *   startedAt: Date | { toDate(): Date },
 * }} SessionRecord
 *
 * @typedef {{
 *   activityId: string,
 *   label: string,
 *   seconds: number,
 *   sessions: number,
 *   roundsCompleted: number,
 *   lastPlayedAt: Date,
 * }} ActivityTotal
 */

/** Firestore Timestamps and plain Dates both become Dates. */
function toDate(value) {
  return value instanceof Date ? value : value.toDate();
}

/**
 * Totals a resident's sessions per activity, keeping only those that
 * started within the last `days` days (all of them when days is null).
 * @param {SessionRecord[]} sessions
 * @param {{ days: number | null, now?: Date }} options
 * @returns {{ totalSeconds: number, activities: ActivityTotal[] }} activities
 *   sorted by most time first
 */
export function summarizeSessions(sessions, { days, now = new Date() }) {
  const since = days == null ? null : now.getTime() - days * 24 * 60 * 60 * 1000;
  /** @type {Map<string, ActivityTotal>} */
  const byActivity = new Map();
  let totalSeconds = 0;
  for (const s of sessions) {
    const startedAt = toDate(s.startedAt);
    if (since != null && startedAt.getTime() < since) continue;
    const seconds = Math.max(0, s.durationSeconds || 0);
    totalSeconds += seconds;
    const entry = byActivity.get(s.activityId) ?? {
      activityId: s.activityId,
      label: ACTIVITY_LABELS[s.activityId] ?? s.activityId,
      seconds: 0,
      sessions: 0,
      roundsCompleted: 0,
      lastPlayedAt: startedAt,
    };
    entry.seconds += seconds;
    entry.sessions += 1;
    entry.roundsCompleted += s.roundsCompleted ?? 0;
    if (startedAt > entry.lastPlayedAt) entry.lastPlayedAt = startedAt;
    byActivity.set(s.activityId, entry);
  }
  const activities = [...byActivity.values()].sort((a, b) => b.seconds - a.seconds);
  return { totalSeconds, activities };
}

/**
 * Engagement time in words for staff: "2 h 15 min", "45 min", "Under 1 min".
 * Hours plus minutes rather than decimal hours ("2.25 h"), which read
 * ambiguously at a glance.
 * @param {number} seconds
 */
export function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return seconds > 0 ? 'Under 1 min' : '0 min';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/**
 * Every logged session for one resident. The query filters on facilityId as
 * well as residentId because firestore.rules only allow listing sessions
 * in your own facility, and a list query must include that filter to be
 * accepted. Two equality filters need no composite index. Guest Mode visits
 * have no residentId, so they never appear here.
 * @param {string} facilityId
 * @param {string} residentId
 * @returns {Promise<SessionRecord[]>}
 */
export async function loadResidentSessions(facilityId, residentId) {
  const snapshot = await getDocs(
    query(
      collection(db, 'activitySessions'),
      where('facilityId', '==', facilityId),
      where('residentId', '==', residentId)
    )
  );
  return snapshot.docs.map((d) => /** @type {SessionRecord} */ (d.data()));
}
