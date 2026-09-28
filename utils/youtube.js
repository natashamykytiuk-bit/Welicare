import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebaseConfig';

const callSearchYouTube = httpsCallable(functions, 'searchYouTube');

// Thin client wrapper around the searchYouTube Cloud Function, which calls
// the YouTube Data API server-side (the API key never ships in the app).
// Returns the trimmed { videoId, title, channelTitle, thumbnailUrl } array.
// Staff-only: used by MusicLibraryScreen ('music') and MovieLibraryScreen
// ('video') to find videos to add to the curated libraries. Residents never
// search YouTube directly — they browse those libraries.
export async function searchYouTube(query, category = 'music') {
  const result = await callSearchYouTube({ query, category });
  return result.data.results;
}
