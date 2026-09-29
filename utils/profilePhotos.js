// @ts-check
import { deleteField, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref } from 'firebase/storage';
import { auth, db, storage } from '../firebaseConfig';
import {
  AVATAR_SIZE,
  RESIDENT_PHOTO_SIZE,
  deleteFileIfExists,
  pickSquareImage,
  uploadJpeg,
} from './imageUpload';

// Single "profile" photos — one per resident, one per user account —
// as opposed to the many-photo album in utils/residentPhotos.js.
//
// Resident photo:
//   Storage:   residents/{residentId}/profile.jpg
//   Firestore: residents/{residentId}.photoPath / .photoUpdatedAt
//   Set/removed by Caregivers and Administrators who may edit the resident,
//   and by the resident's creator — never volunteers, and never an
//   assigned family member who didn't create the resident (firestore.rules
//   and storage.rules both enforce this).
//
// User avatar (optional, any role):
//   Storage:   users/{uid}/avatar.jpg
//   Firestore: users/{uid}.avatarPath / .avatarUpdatedAt
//   Only the user themselves can set or remove it; people in the same
//   organization can see it.
//
// Replacing either photo overwrites the same file, so its download URL may
// not change — the *UpdatedAt timestamp goes into the image cache key
// instead (see components/ResidentAvatar.js / UserAvatar.js) so a new photo
// shows straight away.

/** Where a resident's profile photo lives in Storage. */
export function residentPhotoPath(residentId) {
  return `residents/${residentId}/profile.jpg`;
}

/** Where a user's avatar lives in Storage. */
export function avatarPath(uid) {
  return `users/${uid}/avatar.jpg`;
}

/** Opens the picker for a square resident photo (800×800). null = cancelled. */
export function pickResidentPhoto() {
  return pickSquareImage(RESIDENT_PHOTO_SIZE);
}

/** Opens the picker for a square avatar (512×512). null = cancelled. */
export function pickAvatar() {
  return pickSquareImage(AVATAR_SIZE);
}

/**
 * Uploads a prepared image as the resident's profile photo, then records
 * it on the resident doc. The resident doc must already exist — the
 * Storage rule reads it to check who may upload.
 * @param {string} residentId
 * @param {import('./imageUpload').PreparedImage} image
 */
export async function setResidentPhoto(residentId, image) {
  const path = residentPhotoPath(residentId);
  await uploadJpeg(path, image);
  await updateDoc(doc(db, 'residents', residentId), {
    photoPath: path,
    photoUpdatedAt: serverTimestamp(),
  });
}

/**
 * Removes the resident's profile photo: the doc fields first (so every
 * screen stops showing it even if the file delete then fails), then the
 * file.
 */
export async function removeResidentPhoto(residentId) {
  await updateDoc(doc(db, 'residents', residentId), {
    photoPath: deleteField(),
    photoUpdatedAt: deleteField(),
  });
  await deleteFileIfExists(residentPhotoPath(residentId));
}

/** Uploads the signed-in user's avatar and records it on their users doc. */
export async function setMyAvatar(image) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Please sign in again.');
  const path = avatarPath(uid);
  await uploadJpeg(path, image);
  await updateDoc(doc(db, 'users', uid), {
    avatarPath: path,
    avatarUpdatedAt: serverTimestamp(),
  });
  forgetAvatarUrl(uid);
}

/** Removes the signed-in user's avatar (doc fields, then the file). */
export async function removeMyAvatar() {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Please sign in again.');
  await updateDoc(doc(db, 'users', uid), {
    avatarPath: deleteField(),
    avatarUpdatedAt: deleteField(),
  });
  await deleteFileIfExists(avatarPath(uid));
  forgetAvatarUrl(uid);
}

/** A download URL for a Storage path (resident photo or avatar). */
export function photoUrl(path) {
  return getDownloadURL(ref(storage, path));
}

// uid → Promise<string | null>. Other people's avatars are looked up
// straight from Storage at their fixed path (users/{uid}/avatar.jpg): the
// Firestore rules only let you read your OWN users doc, so avatarPath
// isn't readable for anyone else. storage.rules decides who may see it
// (same organization). No avatar, or not allowed → null, remembered for
// the session so a list of members doesn't re-ask on every render.
const avatarUrls = new Map();

/**
 * The avatar URL for `uid`, or null when there isn't one or the viewer may
 * not see it. Never throws.
 * @returns {Promise<string | null>}
 */
export function avatarUrlFor(uid) {
  if (!uid) return Promise.resolve(null);
  if (!avatarUrls.has(uid)) {
    avatarUrls.set(
      uid,
      photoUrl(avatarPath(uid)).catch(() => null)
    );
  }
  return avatarUrls.get(uid);
}

/** Drops a remembered avatar URL (after the user changes their own). */
export function forgetAvatarUrl(uid) {
  avatarUrls.delete(uid);
}

/**
 * Whether this user may change the resident's profile photo — the same
 * people firestore.rules/storage.rules allow: the resident's creator, or a
 * Caregiver/Administrator who is linked to them or in their facility.
 * Everyone else sees the photo read-only. (The rules are the real check;
 * this only decides whether to show the buttons.)
 * @param {any} resident resident doc data
 * @param {string | undefined} uid
 * @param {{ role?: string, orgId?: string } | undefined} user the viewer's users doc
 */
export function canEditResidentPhoto(resident, uid, user) {
  if (!resident || !uid) return false;
  if (resident.createdBy === uid) return true;
  if (!['Caregiver', 'Administrator'].includes(user?.role ?? '')) return false;
  return (
    resident.caregiverId === uid ||
    (Array.isArray(resident.assignedCaregivers) && resident.assignedCaregivers.includes(uid)) ||
    (!!resident.facilityId && user?.orgId === resident.facilityId)
  );
}
