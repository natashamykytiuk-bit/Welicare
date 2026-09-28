// Shared helpers for the curated musicLibrary collection (ManageMusicScreen,
// MusicLibraryScreen, CurateResidentMusicScreen, MusicSelectionScreen).

// Kept as a plain decade list rather than deriving from anything dynamic —
// mirrors the fixed RELATIONSHIP_OPTIONS/YES_NO style lists in
// BuildProfileScreen.js.
// The one rule for which library songs a resident may browse and play,
// used by every music path (All Music, Favourites) so they can't disagree:
// - No approved list saved (selectedMusicVideoIds missing): the resident
//   hasn't been curated, so they see the facility library.
// - A list saved — even an empty one: ONLY those songs. An empty list means
//   "nothing approved yet", not "everything"; and a song removed from the
//   list disappears from Favourites too.
// CurateResidentMusicScreen is where staff save the list or remove it
// ("Show the whole library instead").
export function isMusicCurated(resident) {
  return Array.isArray(resident?.selectedMusicVideoIds);
}
export function filterToApprovedMusic(entries, resident) {
  if (!isMusicCurated(resident)) return entries;
  const approved = new Set(resident.selectedMusicVideoIds);
  return entries.filter((entry) => approved.has(entry.videoId));
}

export const MUSIC_DECADE_OPTIONS = [
  '1940s',
  '1950s',
  '1960s',
  '1970s',
  '1980s',
  '1990s',
  '2000s+',
];

// Matches youtube.com/watch?v=ID, youtu.be/ID, and youtube.com/shorts/ID —
// the three URL shapes people are likely to paste in from a browser or the
// YouTube app's share sheet. Video IDs are always exactly 11 URL-safe
// characters.
const YOUTUBE_URL_PATTERN =
  /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;

export function extractYouTubeVideoId(url) {
  const match = typeof url === 'string' ? url.match(YOUTUBE_URL_PATTERN) : null;
  return match ? match[1] : null;
}

// YouTube serves a static thumbnail for any public video at this path, no
// API key required — used as a fallback when a musicLibrary entry has no
// thumbnailUrl stored (e.g. added via pasted URL rather than search).
export function thumbnailForVideoId(videoId) {
  return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
}
