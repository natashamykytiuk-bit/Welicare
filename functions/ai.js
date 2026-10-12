// AI suggestions (Conversation and Activities briefs for staff): builds the
// prompts from the resident's life story and safety notes
// (suggestionPrompt.js), calls Anthropic server-side, so the API key never
// ships in the app, and parses the reply into a structured brief.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { requireVerified } = require('./authChecks');
const {
  PROMPT_VERSION,
  resolveKind,
  sanitizeLifeStory,
  sanitizeTopicsToAvoid,
  buildSystemPrompt,
  buildPrompt,
  parseBrief,
  briefToText,
} = require('./suggestionPrompt');

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');

// How many times to ask the model before giving up on getting a usable
// brief. The second try covers the occasional reply that isn't valid JSON;
// more would mostly add cost and wait time for the caregiver.
const MAX_ATTEMPTS = 2;

// One call to the model. Returns the reply text, or throws an HttpsError
// (with only a stable reason code) if the provider fails.
async function callModel(system, prompt) {
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
      system,
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
      { reason: 'ai-provider-error' }
    );
  }

  const data = await response.json();
  return data.content?.map((block) => block.text ?? '').join('\n') ?? '';
}

exports.generateSuggestions = onCall({ secrets: [anthropicApiKey] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  requireVerified(request);

  // New kinds (conversation, activities) or the ones older app builds send,
  // mapped onto the new ones — see LEGACY_KINDS in suggestionPrompt.js.
  const kind = resolveKind(request.data?.kind);
  if (!kind) {
    throw new HttpsError('invalid-argument', 'kind must be conversation or activities.');
  }

  // topicsToAvoid: the resident's caregiver-written safety notes
  // (utils/residentSafety.js), sent by the app alongside the life story.
  // The sanitized life story stays in scope here so a later classifier call
  // (POST /score) can be sent it too, if that's ever wanted.
  const lifeStory = sanitizeLifeStory(request.data?.lifeStory);
  const prompt = buildPrompt(kind, lifeStory, sanitizeTopicsToAvoid(request.data?.topicsToAvoid));
  const system = buildSystemPrompt();

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const reply = await callModel(system, prompt);
    const brief = parseBrief(reply);
    if (brief) {
      // `text` is the same brief as plain text, for app builds from before
      // v2 that still read it.
      return { brief, text: briefToText(brief), promptVersion: PROMPT_VERSION, kind };
    }
    // Only the length is logged: the reply can contain resident details.
    console.warn('[generateSuggestions] unusable reply, attempt', attempt, 'length', reply.length);
  }

  throw new HttpsError('unavailable', 'Suggestions are unavailable right now. Please try again.', {
    reason: 'ai-bad-format',
  });
});
