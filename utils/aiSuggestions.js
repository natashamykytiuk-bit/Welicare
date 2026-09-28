// @ts-check
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebaseConfig';

/** @typedef {import('../types/models').GenerateSuggestionsRequest} GenerateSuggestionsRequest */
/** @typedef {import('../types/models').GenerateSuggestionsResponse} GenerateSuggestionsResponse */

// Typed with the shared request/response shapes, so a wrong `kind` or a
// renamed response field is caught by `npm run typecheck`.
const callGenerateSuggestions =
  /** @type {import('firebase/functions').HttpsCallable<GenerateSuggestionsRequest, GenerateSuggestionsResponse>} */ (
    httpsCallable(functions, 'generateSuggestions')
  );

// Thin client wrapper around the generateSuggestions Cloud Function, which
// builds the actual prompt and calls Anthropic server-side (the API key
// never ships in the app). Returns the suggestion text.
/**
 * @param {import('../types/models').SuggestionKind} kind
 * @param {import('../types/models').LifeStory | null | undefined} lifeStory
 * @returns {Promise<string>}
 */
export async function generateSuggestions(kind, lifeStory) {
  const result = await callGenerateSuggestions({ kind, lifeStory: lifeStory ?? null });
  return result.data.text;
}
