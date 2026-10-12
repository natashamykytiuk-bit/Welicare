// @ts-check
import {
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref } from 'firebase/storage';
import { auth, db, storage } from '../firebaseConfig';
import { deleteFileIfExists, fitWithin, pickImages, uploadJpeg } from './imageUpload';

// Re-exported for existing callers/tests.
export { fitWithin };

// Everything about a resident's photo album, so the screens stay thin:
// family members and caregivers add and remove photos
// (ResidentPhotoUploadScreen; caregivers also have ResidentPhotoManageScreen),
// and the resident sees them in Resident Mode (ResidentPhotoAlbumScreen).
//
// Each photo is two things sharing one photoId:
//   Storage:   residents/{residentId}/photos/{photoId}.jpg
//   Firestore: residents/{residentId}/photos/{photoId}
//              { storagePath, caption, uploadedBy, uploaderName,
//                uploadedAt, width, height }
// Download URLs are never stored — they're long-lived bearer links that
// would outlive a removed link to the resident. getPhotoUrl() fetches one
// at view time instead, which goes through storage.rules every time.
//
// Access rules: firestore.rules (match /photos/{photoId}) and storage.rules.

/** Most photos picked in one go. */
export const MAX_PHOTOS_PER_PICK = 10;
/**
 * Most photos one resident's album may hold. Checked by the upload screen
 * only (ResidentPhotoUploadScreen) — security rules can't count documents,
 * so nothing on the server enforces it.
 */
export const MAX_PHOTOS_PER_RESIDENT = 30;
/** Longest edge after resizing, in pixels. */
export const MAX_EDGE = 1600;
/** Caption length limit — firestore.rules enforces the same. */
export const MAX_CAPTION = 200;

/**
 * @typedef {object} PreparedPhoto
 * @property {string} uri    local JPEG, already resized and re-encoded
 * @property {number} width
 * @property {number} height
 */

/**
 * @typedef {object} ResidentPhoto
 * @property {string} id
 * @property {string} storagePath
 * @property {string} caption
 * @property {string} uploadedBy
 * @property {string} uploaderName
 * @property {Date | null} uploadedAt
 * @property {number} width
 * @property {number} height
 */

/**
 * Opens the photo library (images only, up to 10), resizing each pick so
 * its long edge is at most 1600px, re-encoded as JPEG (which strips EXIF,
 * including GPS — see utils/imageUpload.js). Returns [] if the person
 * cancels; throws a friendly Error if library access is refused.
 * @returns {Promise<PreparedPhoto[]>}
 */
export function pickAndPreparePhotos() {
  return pickImages({ limit: MAX_PHOTOS_PER_PICK, maxEdge: MAX_EDGE });
}

/** Where a photo's file lives in Storage. */
export function photoStoragePath(residentId, photoId) {
  return `residents/${residentId}/photos/${photoId}.jpg`;
}

/**
 * The signed-in user's display name, stored on each photo they upload so
 * the album can say "Shared by …" without reading other people's users
 * docs (which the rules don't allow).
 */
export async function loadUploaderName() {
  const uid = auth.currentUser?.uid;
  if (!uid) return '';
  const snap = await getDoc(doc(db, 'users', uid));
  const data = snap.data() ?? {};
  return String(data.fullName || data.username || '').slice(0, 100);
}

/**
 * Uploads one prepared photo: the file first, then its Firestore doc. The
 * doc is only written once the file is safely in Storage, and if writing
 * the doc fails the file is deleted again, so a failed upload never leaves
 * an orphaned file behind (or a doc pointing at nothing).
 * @param {object} args
 * @param {string} args.residentId
 * @param {PreparedPhoto} args.photo
 * @param {string} [args.caption]
 * @param {string} args.uploaderName
 * @returns {Promise<string>} the new photoId
 */
export async function uploadResidentPhoto({ residentId, photo, caption = '', uploaderName }) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Please sign in again to share photos.');
  // A fresh Firestore id doubles as the file name, so the two always match.
  const photoRef = doc(collection(db, 'residents', residentId, 'photos'));
  const storagePath = photoStoragePath(residentId, photoRef.id);
  // Stamped with uploadedBy — storage.rules check it.
  const fileRef = await uploadJpeg(storagePath, photo);

  try {
    await setDoc(photoRef, {
      storagePath,
      caption: caption.trim().slice(0, MAX_CAPTION),
      uploadedBy: uid,
      uploaderName,
      uploadedAt: serverTimestamp(),
      width: photo.width,
      height: photo.height,
    });
  } catch (e) {
    // Best effort: the original error is the one worth reporting.
    await deleteObject(fileRef).catch((cleanupError) =>
      console.error('[residentPhotos] could not remove orphaned upload:', cleanupError)
    );
    throw e;
  }
  return photoRef.id;
}

/** Firestore doc → ResidentPhoto. */
function toPhoto(snap) {
  const data = snap.data();
  return {
    id: snap.id,
    storagePath: data.storagePath,
    caption: data.caption ?? '',
    uploadedBy: data.uploadedBy,
    uploaderName: data.uploaderName ?? '',
    uploadedAt: data.uploadedAt?.toDate?.() ?? null,
    width: data.width,
    height: data.height,
  };
}

/**
 * Every photo for the resident, newest first — the Resident Mode album, the
 * "Photos in the album" list on the upload screen, and caregiver moderation.
 * @returns {Promise<ResidentPhoto[]>}
 */
export async function listResidentPhotos(residentId) {
  const snapshot = await getDocs(
    query(collection(db, 'residents', residentId, 'photos'), orderBy('uploadedAt', 'desc'))
  );
  return snapshot.docs.map(toPhoto);
}

/**
 * How many photos are in the resident's album, from everyone — for the
 * MAX_PHOTOS_PER_RESIDENT check. A count query rather than listing the
 * album: it costs one read however many photos there are, and the upload
 * screen never shows other people's photos anyway. Always asks the server,
 * so it includes photos someone else added a moment ago.
 * @returns {Promise<number>}
 */
export async function countResidentPhotos(residentId) {
  const snapshot = await getCountFromServer(collection(db, 'residents', residentId, 'photos'));
  return snapshot.data().count;
}

/**
 * Removes a photo — anyone who may add photos to the album may remove any
 * photo in it (firestore.rules / storage.rules). The file first, then the doc. If the file is already
 * gone that's fine. If removing the doc then fails, the album just skips
 * the missing file (see ResidentPhotoAlbumScreen) and a retry finishes it.
 * @param {string} residentId
 * @param {Pick<ResidentPhoto, 'id' | 'storagePath'>} photo
 */
export async function deleteResidentPhoto(residentId, photo) {
  await deleteFileIfExists(photo.storagePath);
  await deleteDoc(doc(db, 'residents', residentId, 'photos', photo.id));
}

/** A download URL for showing one photo, fetched at view time. */
export function getPhotoUrl(storagePath) {
  return getDownloadURL(ref(storage, storagePath));
}
