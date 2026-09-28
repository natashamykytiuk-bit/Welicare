// @ts-check
import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../firebaseConfig';

// Adding a song or movie to an organization's library (MusicLibraryScreen,
// MovieLibraryScreen) without ever creating a duplicate.
//
// Entries used to get random ids, with a "does this video already exist?"
// query run first — two staff adding the same video at the same moment
// could both pass the check and both write. Now each new entry's id is
// fixed by what it is, `{facilityId}_{videoId}` (firestore.rules require
// that), and it's created inside a transaction that first reads that id: if
// someone else's add lands first, the transaction retries, sees it, and
// reports a duplicate instead of writing a second copy.
//
// Entries created before this change still have random ids, so the screens
// keep their duplicate query too, to catch those.

/**
 * The fixed document id for a library entry.
 * @param {string} facilityId
 * @param {string} videoId
 */
export function libraryEntryId(facilityId, videoId) {
  return `${facilityId}_${videoId}`;
}

/**
 * Creates the entry unless it already exists.
 * @param {'musicLibrary' | 'movieLibrary'} collectionName
 * @param {Record<string, any> & { facilityId: string, videoId: string }} data
 * @param {{ isRetry: boolean }} options isRetry: this same form already sent
 *   a save that may have landed — then finding the entry means that save
 *   worked, not that it's a duplicate.
 * @returns {Promise<{ added: true } | { added: false, existing: Record<string, any> }>}
 */
export async function addLibraryEntryOnce(collectionName, data, { isRetry }) {
  const ref = doc(db, collectionName, libraryEntryId(data.facilityId, data.videoId));
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists()) {
      /** @type {Record<string, any>} */
      const existing = { id: snap.id, ...snap.data() };
      if (isRetry && existing.addedByUid === data.addedByUid) return { added: true };
      return { added: false, existing };
    }
    tx.set(ref, data);
    return { added: true };
  });
}
