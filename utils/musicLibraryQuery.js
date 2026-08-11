import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';

// The signed-in caregiver/staff account's own organization — same
// users/{uid}.orgId field AddResidentScreen reads to stamp a resident's
// facilityId. musicLibrary entries are scoped the same way (see
// firestore.rules): every read/write below is either "global" (the shared
// admin-curated baseline) or this value.
export async function getCurrentUserFacilityId() {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.data()?.orgId ?? null;
}

// Shared server-side portion of the musicLibrary filter bar used by
// MusicSelectionScreen, CurateResidentMusicScreen, and MusicLibraryScreen:
// decade is an equality filter, genres (when any are selected) is an
// array-contains-any filter. Artist is deliberately left out of this query
// and applied client-side by callers instead — folding it in here would
// mean every {decade, genres, artist} combination needs its own Firestore
// composite index, instead of just one (decade + genres) for this query
// plus zero extra indexes for artist.
//
// facilityId is queried as two separate `==` requests (global, then the
// caregiver's own org) run in parallel and merged, rather than a single
// `in` — Firestore can't validate a list/query request against a rule that
// ORs a plain-value branch ("global") with a get()-based branch (the org
// match), the exact same reason the residents collection's rules
// (firestore.rules) are split into multiple `allow list` statements
// instead of one combined `read`. Two single-value equality queries each
// validate cleanly against their corresponding split rule.
//
// If Firestore doesn't have a composite index for a combination requested,
// this throws with e.code === 'failed-precondition' and e.message
// containing a one-click console link to create it — that error is left to
// propagate unchanged so callers can surface it as-is.
export async function queryMusicLibrarySubset({ decade, genres, facilityId } = {}) {
  const extraConstraints = [];
  if (decade) extraConstraints.push(where('decade', '==', decade));
  if (genres && genres.length > 0) extraConstraints.push(where('genres', 'array-contains-any', genres));

  const facilityValues = facilityId ? ['global', facilityId] : ['global'];
  const snapshots = await Promise.all(
    facilityValues.map((value) =>
      getDocs(query(collection(db, 'musicLibrary'), where('facilityId', '==', value), ...extraConstraints))
    )
  );
  return snapshots.flatMap((snapshot) => snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
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
// accepts up to 10 values, so this chunks the id list; it's then crossed
// with the same two facilityId values queryMusicLibrarySubset uses (for
// the same "can't combine an `in` with an OR'd get()-based rule" reason —
// and Firestore only allows one `in`/`array-contains-any` clause per query
// anyway, so videoId's `in` and a facilityId `in` couldn't share a query
// even if the rule allowed it). Matches on the `videoId` field rather than
// the Firestore document id — favouriteMusicVideoIds stores YouTube video
// ids, and a musicLibrary doc's own id is an unrelated auto-generated
// addDoc id (same as how selectedMusicVideoIds is already matched
// elsewhere).
export async function queryMusicLibraryByVideoIds(videoIds, facilityId) {
  if (!videoIds || videoIds.length === 0) return [];
  const chunks = [];
  for (let i = 0; i < videoIds.length; i += 10) chunks.push(videoIds.slice(i, i + 10));
  const facilityValues = facilityId ? ['global', facilityId] : ['global'];
  const snapshots = await Promise.all(
    chunks.flatMap((chunk) =>
      facilityValues.map((value) =>
        getDocs(
          query(collection(db, 'musicLibrary'), where('videoId', 'in', chunk), where('facilityId', '==', value))
        )
      )
    )
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
