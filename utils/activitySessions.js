// @ts-check
// Play-time logging for Resident Mode activities: one Firestore document in
// the top-level `activitySessions` collection per visit to an activity (a
// visit can include several rounds). These documents will later feed
// resident stats (Family Mode "My Residents", Caregiver "Overall Stats",
// volunteer hours).
//
// Privacy (Alberta HIA): this is health-adjacent data, so a session holds
// only ids, counts, the difficulty and times — never names, free text or
// resident details. firestore.rules enforces the exact field list too.
//
// The React side lives in hooks/useActivitySession.js; this file holds the
// parts that don't need React, so they're easy to test
// (tests/activitySessions.test.js).

import { addDoc, collection, doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';

/** Visits shorter than this aren't saved — usually an accidental tap. */
export const MIN_SESSION_SECONDS = 10;

/** The difficulties a game can report (see components/games/GameShell.js). */
const DIFFICULTIES = ['gentle', 'medium', 'challenge'];

/**
 * @typedef {{
 *   startedAt: number,          // ms since epoch
 *   roundsStarted: number,
 *   roundsCompleted: number,
 *   difficulty: string | null,  // the last difficulty played
 *   ended: boolean,             // set once, so a visit is saved at most once
 * }} LiveSession
 */

/**
 * A fresh, not-yet-saved visit starting now.
 * @param {number} [now]
 * @returns {LiveSession}
 */
export function newLiveSession(now = Date.now()) {
  return { startedAt: now, roundsStarted: 0, roundsCompleted: 0, difficulty: null, ended: false };
}

/**
 * Builds the Firestore document for a finished visit, or null when it
 * shouldn't be saved (too short, or no facility to file it under). Every
 * field here is one firestore.rules allows — nothing else may be added.
 * @param {{
 *   session: LiveSession,
 *   endedAt: number,
 *   activityType: string,
 *   activityId: string,
 *   residentId: string | null,
 *   userId: string,
 *   profile: { orgId?: string, role?: string } | null,
 *   residentFacilityId?: string | null,
 * }} input
 */
export function buildSessionDoc({
  session,
  endedAt,
  activityType,
  activityId,
  residentId,
  userId,
  profile,
  residentFacilityId = null,
}) {
  const durationSeconds = Math.floor((endedAt - session.startedAt) / 1000);
  if (durationSeconds < MIN_SESSION_SECONDS) return null;
  // Sessions are scoped to a facility like residents are. A resident visit
  // is filed under the resident's own facility, so a family member linked
  // by a family code (whose orgId is their personal org) still counts in
  // the care home's stats; a Guest Mode visit under the user's own org.
  // Without either there's nowhere (and no one) to file it for.
  const facilityId = (residentId && residentFacilityId) || profile?.orgId;
  if (!facilityId || !profile?.role) return null;
  return {
    facilityId,
    residentId: residentId ?? null,
    // No resident picked means Guest Mode (ResidentModeScreen's Guest Mode
    // button opens the activity menu without a residentId).
    isGuest: !residentId,
    activityType,
    activityId,
    difficulty: DIFFICULTIES.includes(session.difficulty ?? '') ? session.difficulty : null,
    roundsStarted: session.roundsStarted,
    roundsCompleted: Math.min(session.roundsCompleted, session.roundsStarted),
    // Plain Dates: the Firestore SDK stores them as timestamps.
    startedAt: new Date(session.startedAt),
    endedAt: new Date(endedAt),
    durationSeconds,
    userId,
    userRole: profile.role,
  };
}

/**
 * Reads the signed-in user's facility (orgId) and role from users/{uid} —
 * the same doc firestore.rules checks the session against. Returns null if
 * nobody is signed in or the read fails (e.g. offline before it was ever
 * cached), which just means this visit isn't logged.
 * @returns {Promise<{ orgId?: string, role?: string } | null>}
 */
export async function loadSessionProfile() {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    console.warn('[activitySessions] could not load profile:', e?.code, e?.message);
    return null;
  }
}

/**
 * The facility a resident belongs to, or null (no facility, or the read
 * failed — then the visit falls back to the user's own org).
 * @param {string} residentId
 * @returns {Promise<string | null>}
 */
async function loadResidentFacility(residentId) {
  try {
    const snap = await getDoc(doc(db, 'residents', residentId));
    return snap.data()?.facilityId ?? null;
  } catch (e) {
    console.warn('[activitySessions] could not load resident:', e?.code, e?.message);
    return null;
  }
}

/**
 * Saves one finished visit. Fire-and-forget by design: it never throws and
 * never shows anything to the resident — a failure is only logged. The
 * write isn't awaited by callers because addDoc's promise only settles once
 * the server confirms; on poor facility Wi-Fi Firestore keeps the write in
 * its offline queue and sends it when the connection returns.
 * @param {Omit<Parameters<typeof buildSessionDoc>[0], 'userId' | 'profile'> & {
 *   profile: { orgId?: string, role?: string } | null | Promise<{ orgId?: string, role?: string } | null>
 * }} input
 */
export async function saveActivitySession({ profile, ...rest }) {
  try {
    const userId = auth.currentUser?.uid;
    if (!userId) return;
    const residentFacilityId = rest.residentId ? await loadResidentFacility(rest.residentId) : null;
    const data = buildSessionDoc({ ...rest, userId, profile: await profile, residentFacilityId });
    if (!data) return;
    await addDoc(collection(db, 'activitySessions'), data);
  } catch (e) {
    console.warn('[activitySessions] could not save session:', e?.code, e?.message);
  }
}
