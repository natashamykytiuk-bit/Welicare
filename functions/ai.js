// AI suggestions (Activity Ideas, Conversation Starters, Music & Movie
// Recs): builds the prompt from the resident's life story and safety notes
// (suggestionPrompt.js) and calls Anthropic server-side, so the API key
// never ships in the app.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { requireVerified } = require('./authChecks');
const {
  KIND_PHRASES,
  sanitizeLifeStory,
  sanitizeTopicsToAvoid,
  buildPrompt,
} = require('./suggestionPrompt');

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');

exports.generateSuggestions = onCall({ secrets: [anthropicApiKey] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  requireVerified(request);

  const { kind } = request.data ?? {};
  // Object.hasOwn, not KIND_PHRASES[kind]: a plain lookup also accepts
  // inherited names like "toString" or "constructor".
  if (typeof kind !== 'string' || !Object.hasOwn(KIND_PHRASES, kind)) {
    throw new HttpsError(
      'invalid-argument',
      'kind must be one of activityIdeas, conversationStarters, musicMovieRecs.'
    );
  }

  // topicsToAvoid: the resident's caregiver-written safety notes
  // (utils/residentSafety.js), sent by the app alongside the life story.
  const prompt = buildPrompt(
    kind,
    sanitizeLifeStory(request.data?.lifeStory),
    sanitizeTopicsToAvoid(request.data?.topicsToAvoid)
  );

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': anthropicApiKey.value(),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  // The provider's error body stays in the server logs (truncated — it can
  // echo parts of the request) and the app only gets a stable reason code,
  // so nothing about the resident or our account setup reaches the client.
  if (!response.ok) {
    const errorText = await response.text();
    console.error(
      '[generateSuggestions] Anthropic error',
      response.status,
      errorText.slice(0, 500)
    );
    throw new HttpsError(
      'unavailable',
      'Suggestions are unavailable right now. Please try again.',
      {
        reason: 'ai-provider-error',
      }
    );
  }

  const data = await response.json();
  const text = data.content?.map((block) => block.text).join('\n') ?? '';
  return { text };
});
