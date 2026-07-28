import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebaseConfig';

const callSearchYouTube = httpsCallable(functions, 'searchYouTube');

// Thin client wrapper around the searchYouTube Cloud Function, which calls
// the YouTube Data API server-side (the API key never ships in the app).
// Returns the trimmed { videoId, title, channelTitle, thumbnailUrl } array.
export async function searchYouTube(query) {
  const result = await callSearchYouTube({ query });
  return result.data.results;
}
