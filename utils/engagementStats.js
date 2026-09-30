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
 * @typedef {SessionRecord & {
 *   residentId?: string | null,
 *   isGuest?: boolean,
 *   userId?: string,
 * }} LoggedSession
 *
 * @typedef {{
 *   residentId: string,
 *   name: string,
 *   seconds: number,
 *   sessions: number,
 *   lastActiveAt: Date | null,
 * }} ResidentTotal
 */

/**
 * Keeps sessions that started within the last `days` days (all of them
 * when days is null). Shared by every summary below.
 * @template {{ startedAt: Date | { toDate(): Date } }} T
 * @param {T[]} sessions
 * @param {{ days: number | null, now?: Date }} options
 * @returns {T[]}
 */
export function inPeriod(sessions, { days, now = new Date() }) {
  if (days == null) return sessions;
  const since = now.getTime() - days * 24 * 60 * 60 * 1000;
  return sessions.filter((s) => toDate(s.startedAt).getTime() >= since);
}

/**
 * Overall Stats (Caregiver Mode): a whole facility's engagement over a
 * period. Every resident is listed, including those with no activity yet
 * (last, so staff can see who might like a visit); Guest Mode visits count
 * towards the totals but belong to no resident.
 * @param {LoggedSession[]} sessions The facility's sessions.
 * @param {{ id: string, name?: string, preferredName?: string | null }[]} residents
 * @param {{ days: number | null, now?: Date }} options
 */
export function summarizeFacility(sessions, residents, options) {
  const kept = inPeriod(sessions, options);
  const { totalSeconds, activities } = summarizeSessions(kept, { days: null });
  /** @type {Map<string, ResidentTotal>} */
  const byResident = new Map(
    residents.map((r) => [
      r.id,
      {
        residentId: r.id,
        name: r.preferredName || r.name || 'Unnamed resident',
        seconds: 0,
        sessions: 0,
        lastActiveAt: null,
      },
    ])
  );
  let guestSeconds = 0;
  let guestSessions = 0;
  for (const s of kept) {
    const seconds = Math.max(0, s.durationSeconds || 0);
    if (s.isGuest || !s.residentId) {
      guestSeconds += seconds;
      guestSessions += 1;
      continue;
    }
    // A session for a resident who's since been removed isn't listed,
    // though its time still counts in the facility total.
    const entry = byResident.get(s.residentId);
    if (!entry) continue;
    const startedAt = toDate(s.startedAt);
    entry.seconds += seconds;
    entry.sessions += 1;
    if (!entry.lastActiveAt || startedAt > entry.lastActiveAt) entry.lastActiveAt = startedAt;
  }
  const residentTotals = [...byResident.values()].sort(
    (a, b) => b.seconds - a.seconds || a.name.localeCompare(b.name)
  );
  return {
    totalSeconds,
    sessions: kept.length,
    activities,
    residents: residentTotals,
    residentsEngaged: residentTotals.filter((r) => r.sessions > 0).length,
    guestSeconds,
    guestSessions,
  };
}

/**
 * The Monday (00:00 local time) of the week `date` falls in.
 * @param {Date} date
 */
export function weekStart(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // getDay(): Sunday 0 … Saturday 6; step back to Monday.
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/**
 * Hour Tracker (Volunteer Mode): one volunteer's own time. Hours come from
 * the Resident Mode visits they ran (the activitySessions log), so nothing
 * has to be entered by hand.
 * @param {LoggedSession[]} sessions This volunteer's sessions.
 * @param {{ days: number | null, now?: Date, weeks?: number }} options
 *   `weeks` is how many recent weeks the week-by-week chart shows.
 */
export function summarizeVolunteer(sessions, { days, now = new Date(), weeks = 8 }) {
  const kept = inPeriod(sessions, { days, now });
  const totalSeconds = kept.reduce((sum, s) => sum + Math.max(0, s.durationSeconds || 0), 0);
  const residentsVisited = new Set(kept.filter((s) => s.residentId).map((s) => s.residentId)).size;

  // The chart always shows the last `weeks` weeks, whatever the period, so
  // it reads as a steady timeline; the oldest week is first.
  const thisWeek = weekStart(now);
  const weekTotals = Array.from({ length: weeks }, (_, i) => {
    const start = new Date(thisWeek);
    start.setDate(start.getDate() - (weeks - 1 - i) * 7);
    return { weekStart: start, seconds: 0 };
  });
  for (const s of sessions) {
    const start = weekStart(toDate(s.startedAt)).getTime();
    const week = weekTotals.find((w) => w.weekStart.getTime() === start);
    if (week) week.seconds += Math.max(0, s.durationSeconds || 0);
  }

  const recent = [...kept]
    .sort((a, b) => toDate(b.startedAt).getTime() - toDate(a.startedAt).getTime())
    .slice(0, 10)
    .map((s) => ({
      activityId: s.activityId,
      label: ACTIVITY_LABELS[s.activityId] ?? s.activityId,
      residentId: s.residentId ?? null,
      startedAt: toDate(s.startedAt),
      seconds: Math.max(0, s.durationSeconds || 0),
    }));

  return { totalSeconds, sessions: kept.length, residentsVisited, weeks: weekTotals, recent };
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
 * Every logged session in a facility (Overall Stats). Staff only — the
 * rules let Caregivers, Administrators and Volunteers list their own
 * facility's sessions.
 * @param {string} facilityId
 * @returns {Promise<LoggedSession[]>}
 */
export async function loadFacilitySessions(facilityId) {
  const snapshot = await getDocs(
    query(collection(db, 'activitySessions'), where('facilityId', '==', facilityId))
  );
  return snapshot.docs.map((d) => /** @type {LoggedSession} */ (d.data()));
}

/**
 * One person's own sessions in their facility (Hour Tracker). Two equality
 * filters, so no composite index is needed; facilityId is what the rules
 * check.
 * @param {string} facilityId
 * @param {string} userId
 * @returns {Promise<LoggedSession[]>}
 */
export async function loadUserSessions(facilityId, userId) {
  const snapshot = await getDocs(
    query(
      collection(db, 'activitySessions'),
      where('facilityId', '==', facilityId),
      where('userId', '==', userId)
    )
  );
  return snapshot.docs.map((d) => /** @type {LoggedSession} */ (d.data()));
}

/**
 * Every logged session for one resident, filed under the resident's
 * facility (see utils/activitySessions.js). The query filters on facilityId
 * as well as residentId: staff may only list their own facility's sessions,
 * and a list query must include that filter to be accepted. Family members
 * are allowed through the residentId filter instead (their rule checks
 * they're linked to that resident). Two equality filters need no composite index. Guest Mode visits
 * have no residentId, so they never appear here.
 * @param {string | null} facilityId
 * @param {string} residentId
 * @returns {Promise<SessionRecord[]>}
 */
export async function loadResidentSessions(facilityId, residentId) {
  // No facility (a resident a family caregiver added outside any
  // organization): residentId alone, which the family rule allows.
  const filters = facilityId
    ? [where('facilityId', '==', facilityId), where('residentId', '==', residentId)]
    : [where('residentId', '==', residentId)];
  const snapshot = await getDocs(query(collection(db, 'activitySessions'), ...filters));
  return snapshot.docs.map((d) => /** @type {SessionRecord} */ (d.data()));
}
