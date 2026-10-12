// AI suggestions (Conversation and Activities briefs for staff): loads the
// resident's life story and safety notes itself (residentAccess.js), builds
// the prompts from them (suggestionPrompt.js), calls Anthropic server-side,
// so the API key never ships in the app, and parses the reply into a
// structured brief.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { requireVerified, requireUsage } = require('./authChecks');
const { loadResidentContext } = require('./residentAccess');
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

// Usage limits (see rateLimit.js). They count calls to this function, not
// tokens or provider requests, so they stay correct if the model or provider
// in callModel below is changed. Sized for real use: a staff member opening
// suggestions for each resident on a shift is a few dozen calls a day.
const AI_CALLS_PER_HOUR = 20;
const AI_CALLS_PER_DAY = 60;
// Shared across every account — the ceiling on a day's spend whatever
// happens. Raise it as real usage grows.
const AI_CALLS_GLOBAL_PER_DAY = 1000;

// Longest prompt (in characters) we'll send. Each field is capped in
// suggestionPrompt.js, but someone could still save a profile with every
// field filled to its cap; this bounds the total. A request over it is refused
// rather than cut short, because the caregivers' "never mention" rule is the
// LAST thing in the prompt and truncating would silently drop it. A very
// full real profile is well under half of this.
const MAX_PROMPT_CHARS = 24000;

// The Admin SDK's Firestore, loaded on first use so a cold start that fails
// the auth checks never pays for it. index.js initialises the default app
// the same lazy way; getApps() avoids initialising it twice.
function getDb() {
  const { getApps, initializeApp } = require('firebase-admin/app');
  const app = getApps()[0] ?? initializeApp();
  return require('firebase-admin/firestore').getFirestore(app);
}

// One call to the model. This is the only provider-specific part of the
// file: to switch model or provider, change the request and the reply
// parsing here — the limits and checks in generateSuggestions stay as-is. Returns the reply text, or throws an HttpsError
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

  // The app sends only which resident this is for; the life story and
  // safety notes are read here, as this caller may see them (see
  // residentAccess.js for why). No residentId means general suggestions.
  const residentId = request.data?.residentId ?? null;
  // App builds from before this change sent the life story and safety notes
  // themselves. Those are no longer trusted, and quietly ignoring them would
  // mean suggestions that skip the resident's "never mention" notes — so an
  // old build is told to update instead.
  if (!residentId && (request.data?.lifeStory != null || request.data?.topicsToAvoid != null)) {
    throw new HttpsError(
      'failed-precondition',
      'Please update Welicare to the latest version to get suggestions.',
      { reason: 'app-update-required' }
    );
  }

  // Counted before anything else is read or the model is called, and
  // whether or not the call then succeeds — it's the attempts that cost
  // money, and this also limits guessing at resident ids.
  const db = getDb();
  await requireUsage(db, {
    feature: 'ai',
    uid: request.auth.uid,
    perHour: AI_CALLS_PER_HOUR,
    perDay: AI_CALLS_PER_DAY,
    globalPerDay: AI_CALLS_GLOBAL_PER_DAY,
    label: 'suggestions',
  });

  let context = { lifeStory: null, topicsToAvoid: null };
  if (residentId) {
    try {
      context = await loadResidentContext(db, residentId, request.auth.uid);
    } catch (e) {
      if (e?.denied) throw new HttpsError('permission-denied', e.message);
      throw e;
    }
  }
  // Still cleaned and capped: what's saved is checked by firestore.rules,
  // but rules can't check the items inside a list. The sanitized life story
  // stays in scope here so a later classifier call (POST /score) can be sent
  // it too, if that's ever wanted.
  const lifeStory = sanitizeLifeStory(context.lifeStory);
  const prompt = buildPrompt(kind, lifeStory, sanitizeTopicsToAvoid(context.topicsToAvoid));
  const system = buildSystemPrompt();
  if (prompt.length > MAX_PROMPT_CHARS) {
    throw new HttpsError(
      'invalid-argument',
      "This resident's profile is too long to make suggestions from. Please shorten some answers.",
      { reason: 'prompt-too-long' }
    );
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const reply = await callModel(system, prompt);
    const brief = parseBrief(reply);
    if (brief) {
      // `text` is the same brief as plain text, for app builds from before
      // v2 that still read it.
      // hasProfile: whether personal details went into this brief — the app
      // shows its "add a profile" note when they didn't.
      return {
        brief,
        text: briefToText(brief),
        promptVersion: PROMPT_VERSION,
        kind,
        hasProfile: lifeStory !== null,
      };
    }
    // Only the length is logged: the reply can contain resident details.
    console.warn('[generateSuggestions] unusable reply, attempt', attempt, 'length', reply.length);
  }

  throw new HttpsError('unavailable', 'Suggestions are unavailable right now. Please try again.', {
    reason: 'ai-bad-format',
  });
});
