// Tests for functions/residentAccess.js: what generateSuggestions may load
// about a resident, and for whom.
//
// These are the same decisions firestore.rules make for the life story and
// safety notes; the function repeats them because the Admin SDK it reads
// with skips the rules. What each test pins down:
// - Only people linked to a resident get anything; an unknown resident and
//   someone else's resident are refused the same way.
// - Volunteers get the safety notes but not the life story, unless their
//   organization switched that on.
// - A Family Caregiver in the same organization isn't "staff": they need a
//   direct link.
// - A read that fails is an error, never "no safety notes".
//
// fakeDb() stands in for Firestore: doc(path).get() over a plain object.
// Residents here are fictional.

import { linkedToResident, loadResidentContext } from '../functions/residentAccess';

function fakeDb(docs) {
  return {
    doc: (path) => ({
      get: async () => {
        const value = docs[path];
        if (value instanceof Error) throw value;
        return { data: () => value };
      },
    }),
  };
}

const RESIDENT = { name: 'Ann', facilityId: 'orgA', createdBy: 'creator', assignedCaregivers: [] };
const STORY = { career: 'Farmer' };
const SAFETY = { topicsToAvoid: 'No water activities' };

function docsFor(user, overrides = {}) {
  return {
    'residents/r1': RESIDENT,
    'residents/r1/private/lifeStory': STORY,
    'residents/r1/private/safety': SAFETY,
    'users/me': user,
    'organizations/orgA': {},
    ...overrides,
  };
}

describe('linkedToResident', () => {
  it('accepts the creator, an assigned caregiver, a linked family member and facility staff', () => {
    expect(linkedToResident(RESIDENT, {}, 'creator')).toBe(true);
    expect(linkedToResident({ ...RESIDENT, assignedCaregivers: ['me'] }, {}, 'me')).toBe(true);
    expect(linkedToResident({ ...RESIDENT, familyMembers: ['me'] }, {}, 'me')).toBe(true);
    expect(linkedToResident(RESIDENT, { role: 'Caregiver', orgId: 'orgA' }, 'me')).toBe(true);
  });

  it('refuses staff of another facility and family who are only in the same organization', () => {
    expect(linkedToResident(RESIDENT, { role: 'Caregiver', orgId: 'orgB' }, 'me')).toBe(false);
    expect(linkedToResident(RESIDENT, { role: 'Family Caregiver', orgId: 'orgA' }, 'me')).toBe(
      false
    );
  });

  it('does not treat two missing facilities as the same facility', () => {
    const atHome = { ...RESIDENT, facilityId: null };
    expect(linkedToResident(atHome, { role: 'Caregiver' }, 'me')).toBe(false);
  });
});

describe('loadResidentContext', () => {
  it('gives facility staff the life story and the safety notes', async () => {
    const db = fakeDb(docsFor({ role: 'Caregiver', orgId: 'orgA' }));
    expect(await loadResidentContext(db, 'r1', 'me')).toEqual({
      lifeStory: STORY,
      topicsToAvoid: 'No water activities',
    });
  });

  it('gives a volunteer the safety notes but not the life story', async () => {
    const db = fakeDb(docsFor({ role: 'Volunteer', orgId: 'orgA' }));
    expect(await loadResidentContext(db, 'r1', 'me')).toEqual({
      lifeStory: null,
      topicsToAvoid: 'No water activities',
    });
  });

  it('gives a volunteer the life story once their organization allows it', async () => {
    const db = fakeDb(
      docsFor(
        { role: 'Volunteer', orgId: 'orgA' },
        { 'organizations/orgA': { volunteerPermissions: { canViewLifeStories: true } } }
      )
    );
    expect((await loadResidentContext(db, 'r1', 'me')).lifeStory).toEqual(STORY);
  });

  it('refuses someone not linked to the resident, and an unknown resident, the same way', async () => {
    const db = fakeDb(docsFor({ role: 'Caregiver', orgId: 'orgB' }));
    const notLinked = await loadResidentContext(db, 'r1', 'me').catch((e) => e);
    const unknown = await loadResidentContext(db, 'nobody', 'me').catch((e) => e);
    expect(notLinked.denied).toBe(true);
    expect(unknown.denied).toBe(true);
    expect(unknown.message).toBe(notLinked.message);
  });

  it('refuses ids that could point somewhere else', async () => {
    const db = fakeDb(docsFor({ role: 'Caregiver', orgId: 'orgA' }));
    for (const bad of ['r1/private/lifeStory', '', 42, null]) {
      await expect(loadResidentContext(db, bad, 'me')).rejects.toMatchObject({ denied: true });
    }
  });

  it('falls back to the life story saved on the resident before it moved', async () => {
    const db = fakeDb(
      docsFor(
        { role: 'Caregiver', orgId: 'orgA' },
        {
          'residents/r1': { ...RESIDENT, lifeStory: { career: 'Nurse' } },
          'residents/r1/private/lifeStory': undefined,
        }
      )
    );
    expect((await loadResidentContext(db, 'r1', 'me')).lifeStory).toEqual({ career: 'Nurse' });
  });

  it('fails rather than carrying on without the safety notes', async () => {
    const db = fakeDb(
      docsFor(
        { role: 'Caregiver', orgId: 'orgA' },
        { 'residents/r1/private/safety': new Error('unavailable') }
      )
    );
    await expect(loadResidentContext(db, 'r1', 'me')).rejects.toThrow('unavailable');
  });
});
