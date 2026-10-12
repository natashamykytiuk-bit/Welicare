// Tests for the usage limits on the paid functions (functions/rateLimit.js).
//
// What each test pins down:
// - A counter allows calls up to its maximum, then refuses, and starts again
//   once its window has passed.
// - A refused call counts against nothing: being over the daily limit must
//   not also use up the hourly one.
// - Limits are per person, with one shared daily total as the backstop
//   against many accounts each staying under their own limit.
//
// fakeDb() stands in for Firestore: just enough of doc/runTransaction for
// enforceLimits, with the stored counters visible to the test.

import { enforceUsageLimits, nextWindowState } from '../functions/rateLimit';

const HOUR = 60 * 60 * 1000;

function fakeDb() {
  const store = new Map();
  return {
    store,
    doc: (path) => ({ path }),
    runTransaction: async (fn) => {
      const writes = [];
      await fn({
        get: async (ref) => ({ data: () => store.get(ref.path) }),
        set: (ref, data) => writes.push([ref.path, data]),
      });
      // Applied only if fn didn't throw — all-or-nothing, like the real one.
      for (const [path, data] of writes) store.set(path, data);
    },
  };
}

const limits = (uid, overrides = {}) => ({
  feature: 'ai',
  uid,
  perHour: 2,
  perDay: 3,
  globalPerDay: 100,
  label: 'suggestions',
  ...overrides,
});

describe('nextWindowState', () => {
  it('starts a window on the first call', () => {
    expect(nextWindowState(undefined, 5000, 2, HOUR)).toEqual({
      allowed: true,
      next: { windowStart: 5000, count: 1 },
    });
  });

  it('refuses once the maximum is reached inside the window', () => {
    expect(nextWindowState({ windowStart: 0, count: 2 }, 1000, 2, HOUR).allowed).toBe(false);
  });

  it('starts afresh once the window has passed', () => {
    expect(nextWindowState({ windowStart: 0, count: 2 }, HOUR, 2, HOUR)).toEqual({
      allowed: true,
      next: { windowStart: HOUR, count: 1 },
    });
  });
});

describe('enforceUsageLimits', () => {
  it('allows calls up to the hourly limit, then refuses with a readable message', async () => {
    const db = fakeDb();
    await enforceUsageLimits(db, limits('ann'));
    await enforceUsageLimits(db, limits('ann'));
    await expect(enforceUsageLimits(db, limits('ann'))).rejects.toMatchObject({
      rateLimited: true,
      message: expect.stringContaining('hourly limit for suggestions'),
    });
  });

  it('counts nothing for a refused call', async () => {
    const db = fakeDb();
    // Already at the daily limit, with the hour still open.
    db.store.set('rateLimits/ai_day_ann', { windowStart: Date.now(), count: 3 });
    await expect(enforceUsageLimits(db, limits('ann'))).rejects.toMatchObject({
      message: expect.stringContaining("today's limit"),
    });
    expect(db.store.has('rateLimits/ai_hour_ann')).toBe(false);
    expect(db.store.has('rateLimits/ai_global_day')).toBe(false);
  });

  it("keeps each person's limit separate", async () => {
    const db = fakeDb();
    await enforceUsageLimits(db, limits('ann'));
    await enforceUsageLimits(db, limits('ann'));
    await expect(enforceUsageLimits(db, limits('bob'))).resolves.toBeUndefined();
  });

  it('stops everyone at the shared daily total', async () => {
    const db = fakeDb();
    await enforceUsageLimits(db, limits('ann', { globalPerDay: 2 }));
    await enforceUsageLimits(db, limits('bob', { globalPerDay: 2 }));
    await expect(enforceUsageLimits(db, limits('cara', { globalPerDay: 2 }))).rejects.toMatchObject(
      { message: expect.stringContaining('unavailable for the rest of today') }
    );
  });

  it('keeps separate counters per feature', async () => {
    const db = fakeDb();
    await enforceUsageLimits(db, limits('ann'));
    await enforceUsageLimits(db, limits('ann'));
    await expect(
      enforceUsageLimits(db, limits('ann', { feature: 'youtube' }))
    ).resolves.toBeUndefined();
  });
});
