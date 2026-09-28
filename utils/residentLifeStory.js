// @ts-check
import { deleteField, doc, getDoc, runTransaction } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { hasAnyLifeStoryData } from './lifeStory';

// Where a resident's life story lives, and the one place that reads and
// saves it.
//
// The life story is kept in its own document,
//   residents/{residentId}/private/lifeStory
// not as a field on the resident. Firestore rules work per document — they
// can't hide one field — so this is what lets firestore.rules give
// volunteers the resident's name and activity info without the life story
// (unless their organization turns on "Volunteers can view life stories"
// under Manage Volunteer Permissions).
//
// The resident doc keeps two small copies everyone who can see the resident
// may use: `preferredName` (so volunteers can greet residents properly) and
// `hasLifeStory` (for the "complete their profile" prompts).
//
// Older residents may still have the life story as a `lifeStory` field on
// the resident doc until scripts/migrateLifeStories.js has run — reads fall
// back to it, and saving moves it into the private doc.

/** @param {string} residentId */
export function lifeStoryRef(residentId) {
  return doc(db, 'residents', residentId, 'private', 'lifeStory');
}

/**
 * Loads a resident's life story.
 * @param {string} residentId
 * @param {object} [residentData] The resident doc, if already loaded — used
 *   for the pre-migration fallback.
 * @returns {Promise<{ lifeStory: import('../types/models').LifeStory | null, denied: boolean }>}
 *   `denied` is true when this person isn't allowed to see life stories
 *   (e.g. a volunteer whose organization hasn't allowed it). Other errors
 *   are thrown for the caller to handle.
 */
export async function loadLifeStory(residentId, residentData) {
  try {
    const snap = await getDoc(lifeStoryRef(residentId));
    if (snap.exists()) return { lifeStory: snap.data(), denied: false };
  } catch (e) {
    if (e?.code === 'permission-denied') return { lifeStory: null, denied: true };
    throw e;
  }
  // Not moved yet: use the old field on the resident doc, if any.
  return { lifeStory: residentData?.lifeStory ?? null, denied: false };
}

/**
 * True if the resident has a life story, from the resident doc alone
 * (works for people who can't read the life story itself).
 * @param {{ hasLifeStory?: boolean, lifeStory?: object | null } | null | undefined} residentData
 */
export function residentHasLifeStory(residentData) {
  if (typeof residentData?.hasLifeStory === 'boolean') return residentData.hasLifeStory;
  return hasAnyLifeStoryData(residentData?.lifeStory);
}

/**
 * The fields of `edited` whose value differs from `original` (both in the
 * shape BuildProfileScreen saves). Lists are compared by content.
 * @param {Record<string, any>} original
 * @param {Record<string, any>} edited
 */
export function changedFields(original, edited) {
  /** @type {Record<string, any>} */
  const changes = {};
  for (const [key, value] of Object.entries(edited)) {
    if (JSON.stringify(value ?? null) !== JSON.stringify(original?.[key] ?? null)) {
      changes[key] = value;
    }
  }
  return changes;
}

/**
 * Saves a resident's name and life story: the life story into the private
 * doc, and name / preferredName / hasLifeStory onto the resident. Also
 * removes any old `lifeStory` field from the resident doc, so a save doubles
 * as that resident's migration.
 *
 * Only what this person actually changed is written. Two caregivers editing
 * the same profile at once used to overwrite each other: each save sent back
 * every field as it was when *their* form loaded. Now, inside a transaction,
 * the current saved story is read fresh and only the changed fields are
 * applied on top — so one person's edit to "career" can't undo another's
 * edit to "hobbies". (If both change the same field, the later save wins.)
 * The transaction retries automatically if the story changes mid-save.
 *
 * @param {string} residentId
 * @param {{
 *   name: string,
 *   lifeStory: Record<string, any>,
 *   original: { name: string, lifeStory: Record<string, any> },
 *   fields: string[],
 * }} profile `original` is the form as it loaded; `fields` the
 *   questionnaire's own keys (anything else is dropped — firestore.rules
 *   refuse unknown keys).
 */
export async function saveResidentProfile(residentId, { name, lifeStory, original, fields }) {
  const residentRef = doc(db, 'residents', residentId);
  const storyRef = lifeStoryRef(residentId);
  const changes = changedFields(original.lifeStory, lifeStory);
  await runTransaction(db, async (tx) => {
    const residentSnap = await tx.get(residentRef);
    const storySnap = await tx.get(storyRef);
    // Current saved story: the private doc, or (not migrated yet) the old
    // field on the resident.
    const current = storySnap.exists()
      ? storySnap.data()
      : (residentSnap.data()?.lifeStory ?? {});
    /** @type {Record<string, any>} */
    const merged = {};
    for (const key of fields) {
      const value = key in changes ? changes[key] : current?.[key];
      if (value !== undefined) merged[key] = value;
    }
    tx.set(storyRef, merged);
    tx.update(residentRef, {
      // Keep someone else's rename unless this person changed the name too.
      ...(name !== original.name ? { name } : {}),
      preferredName: merged.preferredName || null,
      hasLifeStory: hasAnyLifeStoryData(merged),
      lifeStory: deleteField(),
    });
  });
}
