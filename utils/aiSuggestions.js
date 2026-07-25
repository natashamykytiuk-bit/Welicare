import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebaseConfig';

const callGenerateSuggestions = httpsCallable(functions, 'generateSuggestions');

// Thin client wrapper around the generateSuggestions Cloud Function, which
// builds the actual prompt and calls Anthropic server-side (the API key
// never ships in the app). Returns the suggestion text.
export async function generateSuggestions(kind, lifeStory) {
  const result = await callGenerateSuggestions({ kind, lifeStory: lifeStory ?? null });
  return result.data.text;
}
