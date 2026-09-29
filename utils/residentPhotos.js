// @ts-check
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, db, storage } from '../firebaseConfig';

// Everything about a resident's photo album, so the screens stay thin:
// family members and caregivers add photos (ResidentPhotoUploadScreen),
// caregivers moderate them (ResidentPhotoManageScreen), and the resident
// sees them in Resident Mode (ResidentPhotoAlbumScreen).
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

/** The width/height to resize to so the long edge is at most MAX_EDGE. */
export function fitWithin(width, height, maxEdge = MAX_EDGE) {
  const longest = Math.max(width, height);
  if (!longest || longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * Opens the photo library (images only, up to 10), then resizes and
 * re-encodes each pick as a JPEG. Returns [] if the person cancels.
 * Throws an Error with a friendly message if library access is refused.
 * @returns {Promise<PreparedPhoto[]>}
 */
export async function pickAndPreparePhotos() {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error(
      'Welicare needs access to your photos to share them. You can allow it in your device settings.'
    );
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: MAX_PHOTOS_PER_PICK,
    quality: 1,
  });
  if (result.canceled) return [];
  // selectionLimit isn't honoured everywhere (e.g. some web browsers), so
  // cap it here too.
  const assets = result.assets.slice(0, MAX_PHOTOS_PER_PICK);
  return Promise.all(assets.map((asset) => preparePhoto(asset)));
}

/**
 * Resizes one picked image and saves it as a JPEG at 80% quality.
 *
 * Re-encoding also drops every bit of EXIF metadata — including the GPS
 * location phones embed in photos. That's intentional, for privacy: a
 * family photo shouldn't reveal where someone lives.
 * @param {{ uri: string, width: number, height: number }} asset
 * @returns {Promise<PreparedPhoto>}
 */
async function preparePhoto(asset) {
  const size = fitWithin(asset.width, asset.height);
  const context = ImageManipulator.manipulate(asset.uri);
  // Only shrink, never enlarge; resizing to the same size is skipped.
  if (size.width !== asset.width || size.height !== asset.height) context.resize(size);
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
  return { uri: saved.uri, width: saved.width, height: saved.height };
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
  const fileRef = ref(storage, storagePath);

  const blob = await (await fetch(photo.uri)).blob();
  await uploadBytes(fileRef, blob, {
    contentType: 'image/jpeg',
    // storage.rules checks this matches the signed-in user, and uses it to
    // let the uploader delete their own file later.
    customMetadata: { uploadedBy: uid },
  });

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

/** Newest first; a just-written doc with no server time yet counts as newest. */
function newestFirst(a, b) {
  return (b.uploadedAt?.getTime() ?? Infinity) - (a.uploadedAt?.getTime() ?? Infinity);
}

/**
 * Every photo for the resident, newest first — the Resident Mode album and
 * caregiver moderation.
 * @returns {Promise<ResidentPhoto[]>}
 */
export async function listResidentPhotos(residentId) {
  const snapshot = await getDocs(
    query(collection(db, 'residents', residentId, 'photos'), orderBy('uploadedAt', 'desc'))
  );
  return snapshot.docs.map(toPhoto);
}

/**
 * Only the photos the signed-in user uploaded for this resident ("Your
 * uploads" on the upload screen). Sorted here rather than with orderBy so
 * the query doesn't need a composite index.
 * @returns {Promise<ResidentPhoto[]>}
 */
export async function listMyUploads(residentId) {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  const snapshot = await getDocs(
    query(collection(db, 'residents', residentId, 'photos'), where('uploadedBy', '==', uid))
  );
  return snapshot.docs.map(toPhoto).sort(newestFirst);
}

/**
 * Removes a photo: the file first, then the doc. If the file is already
 * gone that's fine. If removing the doc then fails, the album just skips
 * the missing file (see ResidentPhotoAlbumScreen) and a retry finishes it.
 * @param {string} residentId
 * @param {Pick<ResidentPhoto, 'id' | 'storagePath'>} photo
 */
export async function deleteResidentPhoto(residentId, photo) {
  try {
    await deleteObject(ref(storage, photo.storagePath));
  } catch (e) {
    if (e?.code !== 'storage/object-not-found') throw e;
  }
  await deleteDoc(doc(db, 'residents', residentId, 'photos', photo.id));
}

/** A download URL for showing one photo, fetched at view time. */
export function getPhotoUrl(storagePath) {
  return getDownloadURL(ref(storage, storagePath));
}
