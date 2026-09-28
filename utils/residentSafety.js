// @ts-check
import { doc, getDoc, runTransaction, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';

// A resident's caregiver-written safety notes: "topics to avoid" — things
// that upset them or aren't safe for them (a late spouse, water activities,
// a food they can't have). Kept at
//   residents/{residentId}/private/safety
// separate from the life story because the audience differs: everyone who
// runs sessions with the resident (volunteers included) should see what to
// avoid, but only Caregivers and Administrators may change it, and it never
// appears on the resident-facing profile form. See firestore.rules.
//
// The notes are also sent to the AI (generateSuggestions) as instructions
// about what never to suggest.

// Matches the length limit in firestore.rules (validSafetyNotes).
export const TOPICS_TO_AVOID_MAX_LENGTH = 2000;

/** @param {string} residentId */
export function safetyRef(residentId) {
  return doc(db, 'residents', residentId, 'private', 'safety');
}

/**
 * The resident's topics to avoid, or '' if none have been written.
 * Errors are thrown for the caller to handle.
 * @param {string} residentId
 * @returns {Promise<string>}
 */
export async function loadTopicsToAvoid(residentId) {
  const snap = await getDoc(safetyRef(residentId));
  return snap.exists() ? (snap.data().topicsToAvoid ?? '') : '';
}

/**
 * Replaces the topics to avoid (ResidentSafetyScreen's Save).
 * @param {string} residentId
 * @param {string} text
 */
export async function saveTopicsToAvoid(residentId, text) {
  await setDoc(safetyRef(residentId), {
    topicsToAvoid: text.trim().slice(0, TOPICS_TO_AVOID_MAX_LENGTH),
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser?.uid ?? null,
  });
}

/**
 * Adds one line to the topics to avoid ("Not for this resident" on an AI
 * suggestion). A transaction, so two people adding notes at once both keep
 * theirs. Oldest lines are dropped if the notes would exceed the limit.
 * @param {string} residentId
 * @param {string} line
 */
export async function appendTopicToAvoid(residentId, line) {
  const ref = safetyRef(residentId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists() ? (snap.data()?.topicsToAvoid ?? '') : '';
    let lines = [...current.split('\n').filter((l) => l.trim()), line.trim()];
    while (lines.join('\n').length > TOPICS_TO_AVOID_MAX_LENGTH && lines.length > 1) {
      lines = lines.slice(1);
    }
    tx.set(ref, {
      topicsToAvoid: lines.join('\n').slice(0, TOPICS_TO_AVOID_MAX_LENGTH),
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser?.uid ?? null,
    });
  });
}
