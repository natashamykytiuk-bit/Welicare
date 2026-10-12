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

// Thin client wrapper around the generateSuggestions Cloud Function. The
// app sends only which resident the suggestions are for: the function loads
// their life story and safety notes itself (as this person may see them),
// builds the prompts, calls the model server-side (the API key never ships
// in the app) and parses the reply. Nothing about the resident is sent from
// here, so the function never has to trust what a device claims.
// Returns the brief for staff, the prompt version that made it (stored with
// good/bad ratings), and whether the resident's profile was used.
/**
 * @param {import('../types/models').SuggestionKind} kind
 * @param {string | null | undefined} residentId null/undefined → general
 *   suggestions, not about anyone in particular.
 * @returns {Promise<{ brief: import('../types/models').SuggestionBrief, promptVersion: string, hasProfile: boolean }>}
 */
export async function generateSuggestions(kind, residentId) {
  const result = await callGenerateSuggestions({ kind, residentId: residentId ?? null });
  return {
    brief: result.data.brief,
    promptVersion: result.data.promptVersion,
    hasProfile: result.data.hasProfile === true,
  };
}
