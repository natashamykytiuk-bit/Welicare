// Shared helpers for the curated musicLibrary collection (ManageMusicScreen,
// MusicLibraryScreen, CurateResidentMusicScreen, MusicSelectionScreen).

// Kept as a plain decade list rather than deriving from anything dynamic —
// mirrors the fixed RELATIONSHIP_OPTIONS/YES_NO style lists in
// BuildProfileScreen.js.
export const MUSIC_DECADE_OPTIONS = ['1940s', '1950s', '1960s', '1970s', '1980s', '1990s', '2000s+'];

// Matches youtube.com/watch?v=ID, youtu.be/ID, and youtube.com/shorts/ID —
// the three URL shapes people are likely to paste in from a browser or the
// YouTube app's share sheet. Video IDs are always exactly 11 URL-safe
// characters.
const YOUTUBE_URL_PATTERN = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;

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
