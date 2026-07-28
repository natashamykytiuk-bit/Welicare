import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebaseConfig';

const callSearchYouTube = httpsCallable(functions, 'searchYouTube');

// Thin client wrapper around the searchYouTube Cloud Function, which calls
// the YouTube Data API server-side (the API key never ships in the app).
// Returns the trimmed { videoId, title, channelTitle, thumbnailUrl } array.
// category defaults to 'music' (MusicSelectionScreen's usage); Movies &
// Videos passes 'video' explicitly via searchMovies below.
export async function searchYouTube(query, category = 'music') {
  const result = await callSearchYouTube({ query, category });
  return result.data.results;
}

// MoviesSelectionScreen's equivalent of searchYouTube — same Cloud
// Function, just always searching the 'video' category.
export async function searchMovies(query) {
  return searchYouTube(query, 'video');
}
