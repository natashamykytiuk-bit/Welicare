// @ts-check
import { deleteField, doc, getDoc, writeBatch } from 'firebase/firestore';
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
 * Saves a resident's name and life story together, in one batch: the life
 * story into the private doc, and name / preferredName / hasLifeStory onto
 * the resident. Also removes any old `lifeStory` field from the resident doc,
 * so a save doubles as that resident's migration.
 * @param {string} residentId
 * @param {{ name: string, lifeStory: import('../types/models').LifeStory }} profile
 */
export async function saveResidentProfile(residentId, { name, lifeStory }) {
  const batch = writeBatch(db);
  batch.set(lifeStoryRef(residentId), lifeStory);
  batch.update(doc(db, 'residents', residentId), {
    name,
    preferredName: lifeStory.preferredName || null,
    hasLifeStory: hasAnyLifeStoryData(lifeStory),
    lifeStory: deleteField(),
  });
  await batch.commit();
}
