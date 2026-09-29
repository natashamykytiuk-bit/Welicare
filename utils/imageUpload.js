// @ts-check
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { deleteObject, ref, uploadBytes } from 'firebase/storage';
import { auth, storage } from '../firebaseConfig';

// Shared picking, resizing and uploading for every photo in the app:
//   - the resident photo album (utils/residentPhotos.js) — several at once,
//     long edge ≤ 1600px;
//   - a resident's profile photo — one square, 800×800;
//   - a user's own avatar — one square, 512×512.
// (The last two live in utils/profilePhotos.js.)
//
// Every image is re-encoded as a JPEG at 80% quality before upload.
// Re-encoding also drops every bit of EXIF metadata — including the GPS
// location phones embed in photos. That's intentional, for privacy: a
// family photo shouldn't reveal where someone lives.

/**
 * @typedef {object} PreparedImage
 * @property {string} uri    local JPEG, already resized and re-encoded
 * @property {number} width
 * @property {number} height
 */

/** Resident profile photo size (px, square). */
export const RESIDENT_PHOTO_SIZE = 800;
/** User avatar size (px, square). */
export const AVATAR_SIZE = 512;

/** The width/height to resize to so the long edge is at most maxEdge. */
export function fitWithin(width, height, maxEdge) {
  const longest = Math.max(width, height);
  if (!longest || longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * The centred square to crop from a width×height image. The picker's own
 * square crop (allowsEditing + aspect [1, 1]) isn't available everywhere
 * (web, multi-select), so we crop again here — a no-op on an
 * already-square image — and never stretch a photo to fit.
 */
export function centreSquare(width, height) {
  const size = Math.min(width, height);
  return {
    originX: Math.floor((width - size) / 2),
    originY: Math.floor((height - size) / 2),
    width: size,
    height: size,
  };
}

/** Asks for photo library access, throwing a friendly Error if refused. */
async function requireLibraryAccess() {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error(
      'Welicare needs access to your photos to share them. You can allow it in your device settings.'
    );
  }
}

/** Re-encodes a manipulated image as JPEG at 80% (this strips EXIF/GPS). */
async function saveJpeg(context) {
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}

/**
 * Picks up to `limit` images and resizes each so its long edge is at most
 * `maxEdge`. Returns [] if the person cancels.
 * @returns {Promise<PreparedImage[]>}
 */
export async function pickImages({ limit, maxEdge }) {
  await requireLibraryAccess();
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: limit > 1,
    selectionLimit: limit,
    quality: 1,
  });
  if (result.canceled) return [];
  // selectionLimit isn't honoured everywhere (e.g. some web browsers).
  return Promise.all(
    result.assets.slice(0, limit).map((asset) => {
      const size = fitWithin(asset.width, asset.height, maxEdge);
      const context = ImageManipulator.manipulate(asset.uri);
      // Only shrink, never enlarge.
      if (size.width !== asset.width || size.height !== asset.height) context.resize(size);
      return saveJpeg(context);
    })
  );
}

/**
 * Picks ONE image with the picker's square crop, then crops/resizes it to
 * exactly size×size. Returns null if the person cancels.
 * @param {number} size RESIDENT_PHOTO_SIZE or AVATAR_SIZE
 * @returns {Promise<PreparedImage | null>}
 */
export async function pickSquareImage(size) {
  await requireLibraryAccess();
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  const context = ImageManipulator.manipulate(asset.uri)
    .crop(centreSquare(asset.width, asset.height))
    .resize({ width: size, height: size });
  return saveJpeg(context);
}

/**
 * Uploads a prepared JPEG to `path`, stamped with the uploader's uid —
 * storage.rules check that stamp, and use it to let the uploader delete
 * their own file later.
 * @param {string} path
 * @param {PreparedImage} image
 * @returns {Promise<import('firebase/storage').StorageReference>}
 */
export async function uploadJpeg(path, image) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Please sign in again to share photos.');
  const fileRef = ref(storage, path);
  const blob = await (await fetch(image.uri)).blob();
  await uploadBytes(fileRef, blob, {
    contentType: 'image/jpeg',
    customMetadata: { uploadedBy: uid },
  });
  return fileRef;
}

/** Deletes a Storage file, treating "already gone" as success. */
export async function deleteFileIfExists(path) {
  try {
    await deleteObject(ref(storage, path));
  } catch (e) {
    if (e?.code !== 'storage/object-not-found') throw e;
  }
}
