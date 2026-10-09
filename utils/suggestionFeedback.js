// @ts-check
// Good/bad ratings on AI suggestions: one Firestore document in the
// top-level `suggestionFeedback` collection per tap. Ratings tell us which
// prompt versions work, and later become labelled examples for the
// suggestion classifier (welicare-ml).
//
// Privacy: a rating holds the rated suggestion text, the kind, the prompt
// version, who rated it and when — never the life story and no resident id.
// The ratings are about the prompt, not the resident. firestore.rules
// enforces the exact field list too.
//
// The pure part (buildFeedbackDoc) is kept separate from the write so it's
// easy to test (tests/suggestionFeedback.test.js).

import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';

/** The two ratings a caregiver can give. */
export const RATINGS = /** @type {const} */ (['good', 'bad']);

/** Longest suggestion text stored — the same cap firestore.rules sets. */
export const MAX_ITEM_TEXT = 500;

/**
 * Builds the Firestore document for one rating, or null when it can't be
 * saved (unknown rating, empty text, or no facility/role to file it under).
 * Every field here is one firestore.rules allows — nothing else may be added.
 * @param {{
 *   kind: string,
 *   promptVersion: string,
 *   itemText: string,
 *   rating: string,
 *   userId: string,
 *   profile: { orgId?: string, role?: string } | null,
 * }} input
 */
export function buildFeedbackDoc({ kind, promptVersion, itemText, rating, userId, profile }) {
  if (!RATINGS.includes(/** @type {any} */ (rating))) return null;
  const text = typeof itemText === 'string' ? itemText.trim().slice(0, MAX_ITEM_TEXT) : '';
  if (!text) return null;
  // Filed under the rater's own facility: the rules only let facility staff
  // rate, and only in their own organization.
  if (!profile?.orgId || !profile?.role) return null;
  return {
    facilityId: profile.orgId,
    kind,
    promptVersion,
    itemText: text,
    rating,
    userId,
    userRole: profile.role,
    // The rules require the server's clock, so a device with a wrong date
    // can't skew when ratings were given.
    createdAt: serverTimestamp(),
  };
}

/**
 * Saves one rating. Unlike activity sessions this is awaited and throws on
 * failure, so the screen can tell the caregiver their tap didn't save.
 * @param {Omit<Parameters<typeof buildFeedbackDoc>[0], 'userId'>} input
 * @returns {Promise<void>}
 */
export async function saveSuggestionFeedback(input) {
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('Not signed in.');
  const data = buildFeedbackDoc({ ...input, userId });
  if (!data) throw new Error('This rating could not be saved.');
  await addDoc(collection(db, 'suggestionFeedback'), data);
}
