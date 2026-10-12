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
// builds the actual prompts, calls Anthropic server-side (the API key never
// ships in the app) and parses the reply. Returns the brief for staff and
// the prompt version that made it (stored with good/bad ratings).
/**
 * @param {import('../types/models').SuggestionKind} kind
 * @param {import('../types/models').LifeStory | null | undefined} lifeStory
 * @param {string} [topicsToAvoid] The resident's safety notes
 *   (utils/residentSafety.js); the function tells the model never to suggest
 *   anything involving them.
 * @returns {Promise<{ brief: import('../types/models').SuggestionBrief, promptVersion: string }>}
 */
export async function generateSuggestions(kind, lifeStory, topicsToAvoid = '') {
  const result = await callGenerateSuggestions({
    kind,
    lifeStory: lifeStory ?? null,
    topicsToAvoid: topicsToAvoid || null,
  });
  return { brief: result.data.brief, promptVersion: result.data.promptVersion };
}
