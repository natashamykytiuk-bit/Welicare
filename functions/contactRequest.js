// The public website's Contact form (web/src/pages/ContactPage.tsx).
//
// Submissions used to be written straight to Firestore by the browser,
// which let a bot write to contactRequests as fast as it liked with the
// site's public config. They now come through this function instead, which:
// - checks the fields (the checks firestore.rules used to do; the rules now
//   refuse every client write to contactRequests),
// - limits how many messages one IP address can send, plus a shared daily
//   total (rateLimit.js), and
// - when CONTACT_APP_CHECK=on (functions/.env), also requires an App Check
//   token, so only the real website can call it. It's a switch rather than
//   always on because App Check needs a reCAPTCHA key set up first, and
//   enforcing it before the site sends tokens would break the form.
//
// validateContactRequest and clientKey don't load firebase-functions, so
// they can be unit-tested directly (tests/contactRequest.test.js).

const { createHash } = require('crypto');

// Must match ROLES in ContactPage.tsx.
const ROLES = [
  'Care home administrator',
  'Staff caregiver / recreation therapist',
  'Family member',
  'Other (care aide, nurse, researcher…)',
];

// Max lengths, matching the form's maxLength attributes.
const MAX = { name: 100, email: 200, organization: 150, message: 3000 };

// Limits (see rateLimit.js). Real visitors send one message, maybe two, so
// these are far above genuine use; the shared total is the backstop against
// a bot rotating through many IP addresses.
const PER_HOUR = 5;
const PER_DAY = 10;
const GLOBAL_PER_DAY = 200;

// Checks a submission and returns the cleaned fields to store, or null if
// anything is missing, the wrong type, too long or not one of the options.
// Text is trimmed first, so whitespace-only answers count as empty.
function validateContactRequest(data) {
  if (!data || typeof data !== 'object') return null;
  const text = (key) => (typeof data[key] === 'string' ? data[key].trim() : null);
  const clean = {
    name: text('name'),
    email: text('email'),
    organization: text('organization') ?? '',
    message: text('message'),
  };
  if (!clean.name || !clean.email || !clean.message) return null;
  for (const [key, max] of Object.entries(MAX)) {
    if (clean[key].length > max) return null;
  }
  if (!ROLES.includes(data.role)) return null;
  if (typeof data.wantsPilot !== 'boolean') return null;
  return { ...clean, role: data.role, wantsPilot: data.wantsPilot };
}

// The rate-limit key for a request: a hash of the caller's IP address, so
// rateLimits/* never holds raw addresses. The LAST X-Forwarded-For entry,
// not the first: Google's front end appends the address it actually saw to
// whatever the caller sent, so the first entry is caller-chosen — a bot
// sending a made-up one per request would get a fresh limit every time and
// could use up the shared daily total, shutting the form for everyone. Same
// reasoning as resolveSignInEmail in index.js. rawRequest.ip is the
// fallback (e.g. in the emulator).
function clientKey(rawRequest) {
  const forwarded = rawRequest?.headers?.['x-forwarded-for'];
  const ip =
    (typeof forwarded === 'string' && forwarded.split(',').pop().trim()) ||
    rawRequest?.ip ||
    'unknown';
  return createHash('sha256').update(`contact:${ip}`).digest('hex').slice(0, 32);
}

// Same lazy Admin SDK set-up as ai.js and youtube.js.
function getDb() {
  const { getApps, initializeApp } = require('firebase-admin/app');
  const app = getApps()[0] ?? initializeApp();
  return require('firebase-admin/firestore').getFirestore(app);
}

// Loaded only by index.js (not by the unit tests), so firebase-functions
// stays out of the test's require graph.
function makeSubmitContactRequest() {
  const { onCall, HttpsError } = require('firebase-functions/v2/https');
  const { requireUsage } = require('./authChecks');

  // Callable, but works signed out: request.auth is never required.
  return onCall(async (request) => {
    // Checked per request rather than with onCall's enforceAppCheck option,
    // so turning it on is a .env change, not a code change.
    if (process.env.CONTACT_APP_CHECK === 'on' && !request.app) {
      throw new HttpsError('failed-precondition', 'Please reload the page and try again.');
    }
    const clean = validateContactRequest(request.data);
    if (!clean) {
      throw new HttpsError('invalid-argument', 'Please fill in your name, email and message.');
    }
    const db = getDb();
    // Counted before the write, so refused bots never reach contactRequests.
    await requireUsage(db, {
      feature: 'contact',
      uid: clientKey(request.rawRequest),
      perHour: PER_HOUR,
      perDay: PER_DAY,
      globalPerDay: GLOBAL_PER_DAY,
      label: 'messages',
    });
    const { FieldValue } = require('firebase-admin/firestore');
    await db.collection('contactRequests').add({
      ...clean,
      createdAt: FieldValue.serverTimestamp(),
      status: 'new',
    });
    return { ok: true };
  });
}

module.exports = { ROLES, MAX, validateContactRequest, clientKey, makeSubmitContactRequest };
