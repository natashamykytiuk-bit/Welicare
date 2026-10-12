// Usage limits for the functions that cost money per call (AI suggestions,
// YouTube search). Each limit is a counter in rateLimits/* — a collection
// the app can't read or write (firestore.rules), so a limit can't be reset
// from a device.
//
// The limits count CALLS to our function, before any provider is contacted,
// so they don't depend on which AI model or search provider sits behind it:
// swapping the model in ai.js leaves all of this working unchanged.
//
// Like suggestionPrompt.js, this file doesn't load firebase-functions, so it
// can be unit-tested without the Functions emulator (tests/rateLimit.test.js).
// A refusal is thrown as a plain Error marked `rateLimited`; requireUsage in
// authChecks.js turns it into the HttpsError the app receives.

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Pure step, kept apart from Firestore so it can be unit-tested
// (tests/rateLimit.test.js). Given the stored counter (or undefined), says
// whether one more call fits in the current window and what to store next.
// A window starts at the first call and lasts windowMs; once it has passed,
// the next call starts a fresh one.
function nextWindowState(data, now, max, windowMs) {
  const inWindow =
    !!data && typeof data.windowStart === 'number' && now - data.windowStart < windowMs;
  const count = inWindow && typeof data.count === 'number' ? data.count : 0;
  if (count >= max) return { allowed: false, next: null };
  return {
    allowed: true,
    next: { windowStart: inWindow ? data.windowStart : now, count: count + 1 },
  };
}

// Counts one call against every limit in `limits`, or throws a
// `rateLimited` Error (with the first exceeded limit's message) and counts
// nothing. Each limit is { id, max, windowMs, message }; `id` is the
// rateLimits doc id.
//
// All limits are checked and written in ONE transaction, so a call refused
// by a later limit (say, the daily one) doesn't still use up an earlier one
// (the hourly one), and two calls arriving together can't both take the last
// slot — Firestore retries whichever commits second.
async function enforceLimits(db, limits) {
  await db.runTransaction(async (tx) => {
    const now = Date.now();
    // Reads first — Firestore requires every read in a transaction to come
    // before its writes.
    const refs = limits.map((limit) => db.doc(`rateLimits/${limit.id}`));
    const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));
    const states = limits.map((limit, i) =>
      nextWindowState(snaps[i].data(), now, limit.max, limit.windowMs)
    );
    const blocked = states.findIndex((state) => !state.allowed);
    if (blocked !== -1) {
      throw Object.assign(new Error(limits[blocked].message), { rateLimited: true });
    }
    states.forEach((state, i) => tx.set(refs[i], state.next));
  });
}

// The usual set of limits for a paid feature: per person per hour, per
// person per day, and one shared daily total across everyone. The shared
// total is the backstop for the case the per-person limits can't cover —
// many throwaway accounts each staying under their own limit.
//
// `feature` names the counters (e.g. "ai" → rateLimits/ai_hour_{uid}).
async function enforceUsageLimits(db, { feature, uid, perHour, perDay, globalPerDay, label }) {
  await enforceLimits(db, [
    {
      id: `${feature}_hour_${uid}`,
      max: perHour,
      windowMs: HOUR_MS,
      message: `You've reached the hourly limit for ${label}. Please try again in a little while.`,
    },
    {
      id: `${feature}_day_${uid}`,
      max: perDay,
      windowMs: DAY_MS,
      message: `You've reached today's limit for ${label}. Please try again tomorrow.`,
    },
    {
      id: `${feature}_global_day`,
      max: globalPerDay,
      windowMs: DAY_MS,
      message: `${label[0].toUpperCase()}${label.slice(1)} are unavailable for the rest of today. Please try again tomorrow.`,
    },
  ]);
}

module.exports = { HOUR_MS, DAY_MS, nextWindowState, enforceLimits, enforceUsageLimits };
