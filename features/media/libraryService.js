// @ts-check
import { deleteDoc, doc, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';
import { findMovieEntryByVideoId, queryMovieLibrary, sortMovies } from '../../utils/movieLibrary';
import { thumbnailForVideoId } from '../../utils/musicLibrary';
import { findLibraryEntryByVideoId, queryMusicLibrarySubset } from '../../utils/musicLibraryQuery';

// Every Firestore write the staff library screens (MusicLibraryScreen,
// MovieLibraryScreen) make. Reads used elsewhere in the app stay in
// utils/musicLibraryQuery.js and utils/movieLibrary.js.
//
// Adding never creates a duplicate. Each new entry's id is fixed by what it
// is, `{facilityId}_{videoId}` (firestore.rules require that), and it's
// created inside a transaction that first reads that id: if someone else's
// add lands first, the transaction retries, sees it, and reports a
// duplicate instead of writing a second copy. Entries created before fixed
// ids still have random ids, so a query for the video runs first to catch
// those (and global entries).

/** @typedef {'musicLibrary' | 'movieLibrary'} LibraryCollection */

/** @typedef {import('../../types/models').LibraryEntry} LibraryEntry */

/**
 * The editable fields of the add/edit form.
 * @typedef {object} EntryFields
 * @property {string} title
 * @property {string} channelTitle
 * @property {string} [artist] Music only; movies have no artist field.
 * @property {string[]} genres
 * @property {string} decade
 */

/**
 * Tracks whether one open Add form has already sent its transaction. If a
 * save landed but reported an error (e.g. the connection dropped before the
 * reply) and the caregiver taps Save again, finding their own entry then
 * means the first save worked, not that it's a duplicate.
 * @typedef {{ sent: boolean }} AddAttempt
 */

/** @typedef {{ added: true } | { added: false, existing: LibraryEntry }} AddResult */

/**
 * The fixed document id for a library entry.
 * @param {string} facilityId
 * @param {string} videoId
 */
export function libraryEntryId(facilityId, videoId) {
  return `${facilityId}_${videoId}`;
}

/**
 * Creates the entry under its fixed id unless it already exists.
 * @param {LibraryCollection} collectionName
 * @param {Record<string, any> & { facilityId: string, videoId: string }} data
 * @param {{ isRetry: boolean }} options
 * @returns {Promise<AddResult>}
 */
export async function addLibraryEntryOnce(collectionName, data, { isRetry }) {
  const ref = doc(db, collectionName, libraryEntryId(data.facilityId, data.videoId));
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists()) {
      /** @type {LibraryEntry} */
      const existing = /** @type {LibraryEntry} */ ({ id: snap.id, ...snap.data() });
      if (isRetry && existing.addedByUid === data.addedByUid) return { added: true };
      return { added: false, existing };
    }
    tx.set(ref, data);
    return { added: true };
  });
}

/**
 * Shared add flow: the legacy-id/global duplicate query, then the atomic
 * fixed-id create.
 * @param {LibraryCollection} collectionName
 * @param {(videoId: string, facilityId: string) => Promise<LibraryEntry | null>} findExisting
 * @param {Record<string, any>} fields
 * @param {{ videoId: string, thumbnailUrl?: string, facilityId: string, attempt: AddAttempt }} target
 * @returns {Promise<AddResult>}
 */
async function addEntry(collectionName, findExisting, fields, target) {
  const { videoId, facilityId, attempt } = target;
  const existing = await findExisting(videoId, facilityId);
  if (existing && existing.id !== libraryEntryId(facilityId, videoId)) {
    return { added: false, existing };
  }
  const isRetry = attempt.sent;
  attempt.sent = true;
  return addLibraryEntryOnce(
    collectionName,
    {
      videoId,
      ...fields,
      thumbnailUrl: target.thumbnailUrl || thumbnailForVideoId(videoId),
      // Never "global": the app only adds entries scoped to the adding
      // caregiver's own organization (see firestore.rules).
      facilityId,
      addedAt: serverTimestamp(),
      addedByUid: auth.currentUser?.uid ?? null,
    },
    { isRetry }
  );
}

/**
 * Global + this organization's songs, sorted by title.
 * @param {string | null} facilityId
 * @returns {Promise<LibraryEntry[]>}
 */
export async function loadMusicLibrary(facilityId) {
  const results = /** @type {LibraryEntry[]} */ (await queryMusicLibrarySubset({ facilityId }));
  return results.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''));
}

/**
 * Global + this organization's movies, sorted by decade then title.
 * @param {string | null} facilityId
 * @returns {Promise<LibraryEntry[]>}
 */
export async function loadMovieLibrary(facilityId) {
  return sortMovies(await queryMovieLibrary(facilityId));
}

/**
 * @param {EntryFields} fields
 * @param {{ videoId: string, thumbnailUrl?: string, facilityId: string, attempt: AddAttempt }} target
 */
export function addMusicEntry(fields, target) {
  const { title, channelTitle, artist, genres, decade } = fields;
  return addEntry(
    'musicLibrary',
    findLibraryEntryByVideoId,
    { title, channelTitle, artist, genres, decade },
    target
  );
}

/**
 * @param {EntryFields} fields
 * @param {{ videoId: string, thumbnailUrl?: string, facilityId: string, attempt: AddAttempt }} target
 */
export function addMovieEntry(fields, target) {
  const { title, channelTitle, genres, decade } = fields;
  return addEntry(
    'movieLibrary',
    findMovieEntryByVideoId,
    { title, channelTitle, genres, decade },
    target
  );
}

/**
 * Edits only the form's fields; firestore.rules forbid changing videoId or
 * facilityId.
 * @param {string} entryId
 * @param {EntryFields} fields
 */
export function updateMusicEntry(entryId, { title, channelTitle, artist, genres, decade }) {
  return updateDoc(doc(db, 'musicLibrary', entryId), {
    title,
    channelTitle,
    artist,
    genres,
    decade,
  });
}

/**
 * @param {string} entryId
 * @param {EntryFields} fields
 */
export function updateMovieEntry(entryId, { title, channelTitle, genres, decade }) {
  return updateDoc(doc(db, 'movieLibrary', entryId), { title, channelTitle, genres, decade });
}

/**
 * @param {LibraryCollection} collectionName
 * @param {string} entryId
 */
export function removeLibraryEntry(collectionName, entryId) {
  return deleteDoc(doc(db, collectionName, entryId));
}
