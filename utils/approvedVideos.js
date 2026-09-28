// @ts-check
import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../firebaseConfig';

// Saving a resident's approved songs / movies (CurateResidentMusicScreen,
// CurateResidentMoviesScreen: selectedMusicVideoIds / selectedMovieVideoIds).
//
// These screens used to write the whole ticked list back, so if two staff
// curated the same resident at once, the second save silently dropped the
// first person's additions. Now only this person's own ticks and unticks
// (compared with the list as their screen loaded it) are applied to the list
// as it is saved right now.

/**
 * The approved list after applying this person's changes to the saved one.
 * @param {string[] | undefined} current The list saved now (undefined = not
 *   curated: the resident sees the whole library).
 * @param {string[] | undefined} loaded The list as this screen loaded it.
 * @param {string[]} selected What's ticked on screen now.
 * @returns {string[]}
 */
export function mergeApprovedIds(current, loaded, selected) {
  // Nobody has curated this resident yet: the ticked list is simply the list.
  if (current === undefined) return [...selected];
  const before = new Set(loaded ?? []);
  const after = new Set(selected);
  const added = selected.filter((id) => !before.has(id));
  const removed = new Set([...before].filter((id) => !after.has(id)));
  const merged = current.filter((id) => !removed.has(id));
  for (const id of added) if (!merged.includes(id)) merged.push(id);
  return merged;
}

/**
 * Applies this person's approval changes in a transaction (so a save that
 * races another is retried against the fresh list) and returns the list
 * that was saved.
 * @param {string} residentId
 * @param {'selectedMusicVideoIds' | 'selectedMovieVideoIds'} field
 * @param {string[] | undefined} loaded
 * @param {string[]} selected
 */
export async function saveApprovedIds(residentId, field, loaded, selected) {
  const ref = doc(db, 'residents', residentId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.data()?.[field];
    const merged = mergeApprovedIds(Array.isArray(current) ? current : undefined, loaded, selected);
    tx.update(ref, { [field]: merged });
    return merged;
  });
}
