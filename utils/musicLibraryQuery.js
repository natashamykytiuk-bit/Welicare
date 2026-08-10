import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';

// Shared server-side portion of the musicLibrary filter bar used by
// MusicSelectionScreen and CurateResidentMusicScreen: decade is an equality
// filter, genres (when any are selected) is an array-contains-any filter.
// Artist is deliberately left out of this query and applied client-side by
// callers instead — folding it in here would mean every {decade, genres,
// artist} combination needs its own Firestore composite index, instead of
// just one (decade + genres) for this query plus zero extra indexes for
// artist.
//
// If Firestore doesn't have a composite index for the decade/genres
// combination requested, this throws with e.code === 'failed-precondition'
// and e.message containing a one-click console link to create it — that
// error is left to propagate unchanged so callers can surface it as-is.
export async function queryMusicLibrarySubset({ decade, genres } = {}) {
  const constraints = [];
  if (decade) constraints.push(where('decade', '==', decade));
  if (genres && genres.length > 0) constraints.push(where('genres', 'array-contains-any', genres));
  const snapshot = await getDocs(query(collection(db, 'musicLibrary'), ...constraints));
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// A musicLibrary doc's genres as an array regardless of whether it's been
// through scripts/migrateMusicLibrarySchema.js yet — pre-migration docs
// only have a singular `genre` string.
export function genresOf(entry) {
  return entry.genres ?? (entry.genre ? [entry.genre] : []);
}

// The artist filter's dropdown options: distinct artist values present in
// whatever subset is currently on screen (so it never offers a choice that
// would produce zero results), falling back to channelTitle for
// pre-migration docs that don't have `artist` yet.
export function distinctArtists(entries) {
  return Array.from(new Set(entries.map((e) => e.artist || e.channelTitle).filter(Boolean))).sort();
}

// Fetches the musicLibrary docs matching a resident's favouriteMusicVideoIds
// (MusicSelectionScreen's Favourites view). Firestore's 'in' operator only
// accepts up to 10 values, so this chunks the id list and runs the chunks
// in parallel. Matches on the `videoId` field rather than the Firestore
// document id — favouriteMusicVideoIds stores YouTube video ids, and a
// musicLibrary doc's own id is an unrelated auto-generated addDoc id (same
// as how selectedMusicVideoIds is already matched elsewhere).
export async function queryMusicLibraryByVideoIds(videoIds) {
  if (!videoIds || videoIds.length === 0) return [];
  const chunks = [];
  for (let i = 0; i < videoIds.length; i += 10) chunks.push(videoIds.slice(i, i + 10));
  const snapshots = await Promise.all(
    chunks.map((chunk) => getDocs(query(collection(db, 'musicLibrary'), where('videoId', 'in', chunk))))
  );
  return snapshots.flatMap((snapshot) => snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
}

// Pulls a bare https:// URL out of a Firestore "missing index" error
// message, e.g. "...You can create it here: https://console.firebase...".
// Firestore always appends the console link verbatim, so this is just
// making it tappable rather than parsing anything structured. Shared by
// MusicSelectionScreen and CurateResidentMusicScreen, both of which run
// queryMusicLibrarySubset and need to surface this the same way.
export function extractConsoleLink(message) {
  const match = typeof message === 'string' ? message.match(/https?:\/\/\S+/) : null;
  return match ? match[0] : null;
}
