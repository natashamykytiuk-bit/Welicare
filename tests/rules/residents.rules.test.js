// Firestore security-rules tests for facility-scoped residents. Unlike the
// app tests, nothing is mocked: @firebase/rules-unit-testing loads the real
// firestore.rules into the local Firestore emulator and we try reads and
// writes as different users.
//
// Run with `npm run test:rules` — it starts the emulator (project
// "demo-welicare", which can never reach real data), runs this file, and
// shuts the emulator down.
//
// Pattern for each test:
//   const db = as('some-uid');                       // pick who is asking
//   await assertSucceeds(getDoc(doc(db, ...)));      // should be allowed
//   await assertFails(updateDoc(doc(db, ...), ...)); // should be denied
// Test data is written with rules switched off (seed()), so setup never
// depends on the rules being tested.

const fs = require('fs');
const path = require('path');
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require('@firebase/rules-unit-testing');
const {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  setLogLevel,
  updateDoc,
  where,
  writeBatch,
  deleteField,
} = require('firebase/firestore');

let env;

// Two facilities, a user of every role in facility A, and one caregiver in
// facility B who should never see A's residents.
const USERS = {
  adminA: { role: 'Administrator', orgId: 'orgA' },
  caregiverA: { role: 'Caregiver', orgId: 'orgA' },
  volunteerA: { role: 'Volunteer', orgId: 'orgA' },
  familyA: { role: 'Family Caregiver', orgId: 'orgA' },
  caregiverB: { role: 'Caregiver', orgId: 'orgB' },
};

/** Firestore as seen by a signed-in user (or signed-out if uid is null). */
// Test users have a verified email unless a test asks otherwise — the
// rules require email_verified for resident, library and org data.
function as(uid, { verified = true } = {}) {
  return uid
    ? env.authenticatedContext(uid, { email_verified: verified }).firestore()
    : env.unauthenticatedContext().firestore();
}

/** Writes test data with rules disabled, so setup can't be blocked by them. */
async function seed() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [uid, data] of Object.entries(USERS)) {
      await setDoc(doc(db, 'users', uid), data);
    }
    // The two facilities themselves — new residents and library entries are
    // only accepted for an organization that exists and isn't being deleted.
    await setDoc(doc(db, 'organizations', 'orgA'), {
      name: 'Maple',
      createdBy: 'adminA',
      adminId: 'adminA',
      isPersonal: false,
    });
    await setDoc(doc(db, 'organizations', 'orgB'), {
      name: 'Oak',
      createdBy: 'caregiverB',
      adminId: 'caregiverB',
      isPersonal: false,
    });
    // Created by caregiverA, only assigned to them.
    await setDoc(doc(db, 'residents', 'residentA'), {
      name: 'Ann',
      caregiverId: 'caregiverA',
      createdBy: 'caregiverA',
      facilityId: 'orgA',
      assignedCaregivers: ['caregiverA'],
      lifeStory: null,
    });
    // Assigned to the family member, to check what an assigned Family
    // Caregiver can do.
    await setDoc(doc(db, 'residents', 'residentFamily'), {
      name: 'Fay',
      caregiverId: 'caregiverA',
      createdBy: 'caregiverA',
      facilityId: 'orgA',
      assignedCaregivers: ['caregiverA', 'familyA'],
      lifeStory: null,
    });
    await setDoc(doc(db, 'residents', 'residentB'), {
      name: 'Bob',
      caregiverId: 'caregiverB',
      createdBy: 'caregiverB',
      facilityId: 'orgB',
      assignedCaregivers: ['caregiverB'],
      lifeStory: null,
    });
  });
}

beforeAll(async () => {
  // Every denied write is also logged by the Firestore SDK as a warning;
  // those are the expected failures, so keep the test output readable.
  setLogLevel('silent');
  env = await initializeTestEnvironment({
    projectId: 'demo-welicare',
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, '..', '..', 'firestore.rules'), 'utf8'),
    },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await seed();
});

afterAll(async () => {
  await env.cleanup();
});

describe('own facility', () => {
  it('a caregiver can read residents in their own facility, assigned or not', async () => {
    await assertSucceeds(getDoc(doc(as('adminA'), 'residents', 'residentA')));
    await assertSucceeds(getDoc(doc(as('volunteerA'), 'residents', 'residentA')));
  });

  it('can list their facility’s residents (My Residents query)', async () => {
    const q = query(collection(as('caregiverA'), 'residents'), where('facilityId', '==', 'orgA'));
    await assertSucceeds(getDocs(q));
  });

  it('a caregiver or admin can edit profile fields of any resident in the facility', async () => {
    await assertSucceeds(
      updateDoc(doc(as('adminA'), 'residents', 'residentA'), {
        name: 'Annie',
        preferredName: 'Annie',
        hasLifeStory: true,
      })
    );
  });

  it('can create a resident in their own facility', async () => {
    await assertSucceeds(
      addDoc(collection(as('caregiverA'), 'residents'), {
        name: 'New',
        caregiverId: 'caregiverA',
        createdBy: 'caregiverA',
        facilityId: 'orgA',
        assignedCaregivers: ['caregiverA'],
      })
    );
  });

  it('nobody can change ownership or facility fields, even the creator', async () => {
    const db = as('caregiverA');
    await assertFails(updateDoc(doc(db, 'residents', 'residentA'), { facilityId: 'orgB' }));
    await assertFails(updateDoc(doc(db, 'residents', 'residentA'), { createdBy: 'someoneElse' }));
    await assertFails(
      updateDoc(doc(db, 'residents', 'residentA'), { assignedCaregivers: ['caregiverA', 'x'] })
    );
  });
});

describe('idempotent resident creation (AddResidentScreen)', () => {
  const newResident = (createdAt) => ({
    name: 'New',
    caregiverId: 'caregiverA',
    createdBy: 'caregiverA',
    facilityId: 'orgA',
    assignedCaregivers: ['caregiverA'],
    hasLifeStory: false,
    musicProvider: 'youtube',
    createdAt,
  });

  it('setDoc to a new pre-generated id is allowed (a create)', async () => {
    await assertSucceeds(setDoc(doc(as('caregiverA'), 'residents', 'pregen1'), newResident(1)));
  });

  // Why the screen checks the server before retrying: if the first attempt
  // already landed, a second full setDoc is an *update* that rewrites
  // non-profile fields (createdAt etc.), which the rules refuse. The screen
  // treats "already exists" as success instead of writing again.
  it('a second full setDoc on the same id is refused once it exists', async () => {
    const db = as('caregiverA');
    await assertSucceeds(setDoc(doc(db, 'residents', 'pregen2'), newResident(1)));
    await assertFails(setDoc(doc(db, 'residents', 'pregen2'), newResident(2)));
  });
});

describe('changing a username (ChangeUsernameScreen batch)', () => {
  // The screen claims the new name, updates the profile and releases the old
  // name in one writeBatch. These check the real rules allow that batch, and
  // that a clash rejects the WHOLE batch (nothing half-applied).
  async function seedUsername(key, uid) {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'usernames', key), { uid });
    });
  }
  function changeBatch(db, uid, newKey, oldKey) {
    const batch = writeBatch(db);
    batch.set(doc(db, 'usernames', newKey), { uid });
    batch.update(doc(db, 'users', uid), { username: newKey });
    batch.delete(doc(db, 'usernames', oldKey));
    return batch.commit();
  }

  it('the batch is allowed for your own names', async () => {
    await seedUsername('old.name', 'caregiverA');
    await assertSucceeds(changeBatch(as('caregiverA'), 'caregiverA', 'new.name', 'old.name'));
  });

  it('a taken name rejects the whole batch — the old name stays claimed', async () => {
    await seedUsername('old.name', 'caregiverA');
    await seedUsername('taken', 'caregiverB');
    await assertFails(changeBatch(as('caregiverA'), 'caregiverA', 'taken', 'old.name'));
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      expect((await getDoc(doc(db, 'usernames', 'old.name'))).exists()).toBe(true);
      expect((await getDoc(doc(db, 'usernames', 'taken'))).data().uid).toBe('caregiverB');
      expect((await getDoc(doc(db, 'users', 'caregiverA'))).data().username).toBeUndefined();
    });
  });

  it("you can't release someone else's name inside the batch", async () => {
    await seedUsername('their.name', 'caregiverB');
    await assertFails(changeBatch(as('caregiverA'), 'caregiverA', 'fresh.name', 'their.name'));
  });
});

describe('personal organization batch (createPersonalOrganization)', () => {
  // Creating a personal org and pointing your orgId at it happen in one
  // writeBatch. The users rule checks the org with getAfter, which sees the
  // org the same batch creates — these confirm that works, and that the
  // batch still can't be used to link yourself to someone else's org.
  function personalOrgBatch(db, uid, orgId, orgData) {
    const batch = writeBatch(db);
    batch.set(doc(db, 'organizations', orgId), orgData);
    batch.set(doc(db, 'users', uid), { orgId }, { merge: true });
    return batch.commit();
  }
  const personal = (uid) => ({ name: null, isPersonal: true, createdBy: uid, adminId: uid });

  it('creating your personal org and linking to it in one batch is allowed', async () => {
    await assertSucceeds(
      personalOrgBatch(as('familyA'), 'familyA', 'newPersonal', personal('familyA'))
    );
  });

  it("can't create an org in someone else's name and link to it", async () => {
    await assertFails(
      personalOrgBatch(as('familyA'), 'familyA', 'fakeOrg', personal('caregiverB'))
    );
  });

  it('a failed batch writes neither the org nor the link', async () => {
    // A real (non-personal) org can't be created from the app, so this
    // batch is refused — and the user's orgId must be untouched.
    await assertFails(
      personalOrgBatch(as('familyA'), 'familyA', 'realOrg', {
        ...personal('familyA'),
        isPersonal: false,
      })
    );
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      expect((await getDoc(doc(db, 'organizations', 'realOrg'))).exists()).toBe(false);
      expect((await getDoc(doc(db, 'users', 'familyA'))).data().orgId).toBe('orgA');
    });
  });

  // Org docs are readable by anyone signed in who knows the id, so the
  // owner's email must not be stored on one (security review #1).
  it('refuses a personal org that carries an email address', async () => {
    await assertFails(
      personalOrgBatch(as('familyA'), 'familyA', 'withEmail', {
        ...personal('familyA'),
        email: 'fam@example.test',
      })
    );
  });

  it('still refuses linking to an existing org you did not create', async () => {
    await assertFails(updateDoc(doc(as('familyA'), 'users', 'familyA'), { orgId: 'orgB' }));
  });
});

describe('music library add (MusicLibraryScreen)', () => {
  // The Add form picks the entry's id up front and every save from it uses
  // setDoc on that id. These confirm the rules allow both the first save
  // (a create) and a repeat save on the same id (an update), so a retry
  // after an uncertain save overwrites instead of adding a duplicate.
  const entry = (title) => ({
    videoId: 'abc123',
    title,
    artist: 'Patsy Cline',
    genres: ['Country'],
    decade: '1960s',
    facilityId: 'orgA',
  });

  it('first save to a new id is allowed', async () => {
    await assertSucceeds(
      setDoc(doc(as('caregiverA'), 'musicLibrary', 'orgA_abc123'), entry('Crazy'))
    );
  });

  it('a repeat save to the same id overwrites it (no duplicate)', async () => {
    const db = as('caregiverA');
    await assertSucceeds(setDoc(doc(db, 'musicLibrary', 'orgA_abc123'), entry('Crazy')));
    await assertSucceeds(setDoc(doc(db, 'musicLibrary', 'orgA_abc123'), entry('Crazy')));
    await env.withSecurityRulesDisabled(async (ctx) => {
      const snap = await getDocs(
        query(collection(ctx.firestore(), 'musicLibrary'), where('videoId', '==', 'abc123'))
      );
      expect(snap.size).toBe(1);
    });
  });

  // The duplicate check (findLibraryEntryByVideoId) queries by facilityId
  // AND videoId; it has to satisfy the same list rules as the library screen.
  it('the duplicate-check query is allowed for your org and the global list', async () => {
    const db = as('caregiverA');
    const byVideo = (facility) =>
      getDocs(
        query(
          collection(db, 'musicLibrary'),
          where('facilityId', '==', facility),
          where('videoId', '==', 'abc123')
        )
      );
    await assertSucceeds(byVideo('orgA'));
    await assertSucceeds(byVideo('global'));
    await assertFails(byVideo('orgB'));
  });

  // Security fix: an entry's facilityId and videoId can never change, so a
  // facility entry can't be pushed into the curated "global" list (or
  // another org) by editing it; only the form's editable fields may change.
  it('editing may change title/artist/genres/decade', async () => {
    const db = as('caregiverA');
    await assertSucceeds(setDoc(doc(db, 'musicLibrary', 'orgA_abc123'), entry('Crazy')));
    await assertSucceeds(
      updateDoc(doc(db, 'musicLibrary', 'orgA_abc123'), { title: 'Crazy (Live)', decade: '1950s' })
    );
  });

  it('cannot move an entry into the global library or another org', async () => {
    const db = as('caregiverA');
    await assertSucceeds(setDoc(doc(db, 'musicLibrary', 'orgA_abc123'), entry('Crazy')));
    await assertFails(updateDoc(doc(db, 'musicLibrary', 'orgA_abc123'), { facilityId: 'global' }));
    await assertFails(updateDoc(doc(db, 'musicLibrary', 'orgA_abc123'), { facilityId: 'orgB' }));
  });

  it('cannot turn an entry into a different video or add unknown fields', async () => {
    const db = as('caregiverA');
    await assertSucceeds(setDoc(doc(db, 'musicLibrary', 'orgA_abc123'), entry('Crazy')));
    await assertFails(updateDoc(doc(db, 'musicLibrary', 'orgA_abc123'), { videoId: 'other' }));
    await assertFails(updateDoc(doc(db, 'musicLibrary', 'orgA_abc123'), { featured: true }));
  });

  it('volunteers still cannot add to the library', async () => {
    await assertFails(setDoc(doc(as('volunteerA'), 'musicLibrary', 'm3'), entry('Crazy')));
  });
});

describe('resident creation schema (security fix)', () => {
  // The whole new resident is validated: createdBy must be the creator,
  // assignedCaregivers must be exactly [creator], and no unknown fields.
  const base = {
    name: 'New',
    caregiverId: 'caregiverA',
    createdBy: 'caregiverA',
    facilityId: 'orgA',
    assignedCaregivers: ['caregiverA'],
  };
  const create = (data) => setDoc(doc(as('caregiverA'), 'residents', 'schema1'), data);

  it('the normal AddResident shape is allowed', async () => {
    await assertSucceeds(create({ ...base, hasLifeStory: false, musicProvider: 'youtube' }));
  });

  it('cannot forge who created it', async () => {
    await assertFails(create({ ...base, createdBy: 'caregiverB' }));
  });

  it('cannot pre-assign other people', async () => {
    await assertFails(create({ ...base, assignedCaregivers: ['caregiverA', 'caregiverB'] }));
    await assertFails(create({ ...base, assignedCaregivers: [] }));
  });

  it('cannot add fields the app never writes', async () => {
    await assertFails(create({ ...base, isAdminApproved: true }));
  });
});

describe('life stories and Manage Volunteer Permissions', () => {
  // The life story lives in residents/{id}/private/lifeStory so it can have
  // stricter rules than the resident's name and activity info. Volunteers
  // only see it when their organization's switch
  // (volunteerPermissions.canViewLifeStories) is on; they never edit it.
  const lifeStoryDoc = (db, id = 'residentA') => doc(db, 'residents', id, 'private', 'lifeStory');

  async function setVolunteerSwitch(on) {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'organizations', 'orgA'), {
        name: 'Maple',
        isPersonal: false,
        createdBy: 'adminA',
        adminId: 'adminA',
        ...(on === undefined ? {} : { volunteerPermissions: { canViewLifeStories: on } }),
      });
    });
  }

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(lifeStoryDoc(ctx.firestore()), {
        career: 'Farmer',
        happiestMemory: 'Wedding day',
      });
    });
  });

  it('by default a volunteer sees the resident but not the life story', async () => {
    await setVolunteerSwitch(undefined); // never set → off
    await assertSucceeds(getDoc(doc(as('volunteerA'), 'residents', 'residentA')));
    await assertFails(getDoc(lifeStoryDoc(as('volunteerA'))));
  });

  it('a volunteer still cannot see it when the switch is off', async () => {
    await setVolunteerSwitch(false);
    await assertFails(getDoc(lifeStoryDoc(as('volunteerA'))));
  });

  it('a volunteer can see it once the organization allows it', async () => {
    await setVolunteerSwitch(true);
    await assertSucceeds(getDoc(lifeStoryDoc(as('volunteerA'))));
  });

  it('a volunteer can never edit a life story, even when allowed to see it', async () => {
    await setVolunteerSwitch(true);
    await assertFails(setDoc(lifeStoryDoc(as('volunteerA')), { career: 'Changed' }));
  });

  it('caregivers and admins in the facility can read and edit it', async () => {
    await assertSucceeds(getDoc(lifeStoryDoc(as('caregiverA'))));
    await assertSucceeds(setDoc(lifeStoryDoc(as('adminA')), { career: 'Teacher' }));
  });

  it("another facility's staff and signed-out users cannot read it", async () => {
    await assertFails(getDoc(lifeStoryDoc(as('caregiverB'))));
    await assertFails(getDoc(lifeStoryDoc(as(null))));
  });

  it('the old lifeStory field can no longer be written onto the resident', async () => {
    await assertFails(
      updateDoc(doc(as('caregiverA'), 'residents', 'residentA'), { lifeStory: { career: 'x' } })
    );
  });

  it('residents not migrated yet can still be updated (e.g. favourites)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'residents', 'residentA'), {
        lifeStory: { career: 'Old place' },
      });
    });
    await assertSucceeds(
      updateDoc(doc(as('caregiverA'), 'residents', 'residentA'), { favouriteMusicVideoIds: ['v'] })
    );
  });

  it('saving moves the life story: private doc + resident flags + old field removed, in one batch', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'residents', 'residentA'), {
        lifeStory: { career: 'Old place' },
      });
    });
    const db = as('caregiverA');
    const batch = writeBatch(db);
    batch.set(lifeStoryDoc(db), { career: 'Farmer', preferredName: 'Annie' });
    batch.update(doc(db, 'residents', 'residentA'), {
      name: 'Ann',
      preferredName: 'Annie',
      hasLifeStory: true,
      lifeStory: deleteField(),
    });
    await assertSucceeds(batch.commit());
  });

  it('only the organization owner can flip the switch, and only to true/false', async () => {
    await setVolunteerSwitch(false);
    const org = (uid) => doc(as(uid), 'organizations', 'orgA');
    await assertSucceeds(
      updateDoc(org('adminA'), { volunteerPermissions: { canViewLifeStories: true } })
    );
    await assertFails(
      updateDoc(org('caregiverA'), { volunteerPermissions: { canViewLifeStories: false } })
    );
    await assertFails(
      updateDoc(org('volunteerA'), { volunteerPermissions: { canViewLifeStories: true } })
    );
    await assertFails(
      updateDoc(org('adminA'), { volunteerPermissions: { canViewLifeStories: 'yes' } })
    );
    await assertFails(
      updateDoc(org('adminA'), {
        volunteerPermissions: { canViewLifeStories: true, canEdit: true },
      })
    );
  });

  it('deleting a resident with its life story works for the facility admin', async () => {
    const db = as('adminA');
    const batch = writeBatch(db);
    batch.delete(lifeStoryDoc(db));
    batch.delete(doc(db, 'residents', 'residentA'));
    await assertSucceeds(batch.commit());
  });
});

describe('verified email (security fix)', () => {
  // Signed in but email not verified yet: the app signs these users out,
  // and the rules now refuse them too, so the check isn't interface-only.
  const unverified = () => as('caregiverA', { verified: false });

  it('cannot read or edit residents', async () => {
    await assertFails(getDoc(doc(unverified(), 'residents', 'residentA')));
    await assertFails(
      getDocs(query(collection(unverified(), 'residents'), where('facilityId', '==', 'orgA')))
    );
    await assertFails(updateDoc(doc(unverified(), 'residents', 'residentA'), { name: 'x' }));
  });

  it('cannot read the music library', async () => {
    await assertFails(
      getDocs(query(collection(unverified(), 'musicLibrary'), where('facilityId', '==', 'global')))
    );
  });

  it('can still do the sign-up steps (own profile)', async () => {
    await assertSucceeds(getDoc(doc(unverified(), 'users', 'caregiverA')));
  });
});

describe('usernames hold no email and match your profile (security fix)', () => {
  // usernames/{name} is publicly readable (for availability checks), so it
  // may only contain the account id, and you can only claim the username
  // that's on your own profile — one real username per account.
  async function setProfileUsername(uid, username) {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'users', uid), { username });
    });
  }

  it('claiming your own profile username with only { uid } is allowed', async () => {
    await setProfileUsername('caregiverA', 'Ann.Smith');
    await assertSucceeds(
      setDoc(doc(as('caregiverA'), 'usernames', 'ann.smith'), { uid: 'caregiverA' })
    );
  });

  it('storing an email in the public username record is refused', async () => {
    await setProfileUsername('caregiverA', 'ann.smith');
    await assertFails(
      setDoc(doc(as('caregiverA'), 'usernames', 'ann.smith'), {
        uid: 'caregiverA',
        email: 'someone-else@example.test',
      })
    );
  });

  it("claiming a username that isn't on your profile is refused", async () => {
    await setProfileUsername('caregiverA', 'ann.smith');
    await assertFails(
      setDoc(doc(as('caregiverA'), 'usernames', 'extra.name'), { uid: 'caregiverA' })
    );
  });
});

describe('movie library (its own collection and rules)', () => {
  const movie = (overrides = {}) => ({
    videoId: 'casablanca1',
    title: 'Casablanca',
    channelTitle: 'Classic Movies',
    thumbnailUrl: 'https://img.youtube.com/vi/casablanca1/mqdefault.jpg',
    genres: ['Drama'],
    decade: '1940s',
    facilityId: 'orgA',
    ...overrides,
  });
  const ref = (uid, id = 'orgA_casablanca1') => doc(as(uid), 'movieLibrary', id);

  it('caregivers and admins can add movies to their own organization', async () => {
    await assertSucceeds(setDoc(ref('caregiverA'), movie()));
    await assertSucceeds(
      setDoc(ref('adminA', 'orgA_raininginX1'), movie({ videoId: 'raininginX1' }))
    );
  });

  it('volunteers and family members cannot add movies', async () => {
    await assertFails(setDoc(ref('volunteerA'), movie()));
    await assertFails(setDoc(ref('familyA'), movie()));
  });

  it("can't add to another organization or the global list, or add an artist", async () => {
    await assertFails(setDoc(ref('caregiverA'), movie({ facilityId: 'orgB' })));
    await assertFails(setDoc(ref('caregiverA'), movie({ facilityId: 'global' })));
    await assertFails(setDoc(ref('caregiverA'), movie({ artist: 'Humphrey Bogart' })));
  });

  it('editing may change title/genres/decade, never the organization or video', async () => {
    await assertSucceeds(setDoc(ref('caregiverA'), movie()));
    await assertSucceeds(
      updateDoc(ref('caregiverA'), { title: 'Casablanca (1942)', decade: '1940s' })
    );
    await assertFails(updateDoc(ref('caregiverA'), { facilityId: 'global' }));
    await assertFails(updateDoc(ref('caregiverA'), { videoId: 'other' }));
  });

  it('members of the organization can read it; other organizations cannot', async () => {
    await assertSucceeds(setDoc(ref('caregiverA'), movie()));
    await assertSucceeds(getDoc(ref('volunteerA')));
    await assertFails(getDoc(ref('caregiverB')));
  });

  it('a resident’s movie approvals and favourites can be saved', async () => {
    await assertSucceeds(
      updateDoc(doc(as('caregiverA'), 'residents', 'residentA'), {
        selectedMovieVideoIds: ['casablanca1'],
        favouriteMovieVideoIds: ['casablanca1'],
      })
    );
  });
});

describe('organization being deleted (security fix)', () => {
  // deleteOrganization marks the org status: 'deleting' first; from then on
  // nothing new may be added to it, so cleanup can't miss anything.
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'organizations', 'orgA'), { status: 'deleting' });
    });
  });

  it('refuses new residents', async () => {
    await assertFails(
      setDoc(doc(as('caregiverA'), 'residents', 'late'), {
        name: 'Late',
        caregiverId: 'caregiverA',
        createdBy: 'caregiverA',
        facilityId: 'orgA',
        assignedCaregivers: ['caregiverA'],
      })
    );
  });

  it('refuses new music and movie entries', async () => {
    const entry = {
      videoId: 'v',
      title: 'T',
      genres: ['Drama'],
      decade: '1950s',
      facilityId: 'orgA',
    };
    await assertFails(setDoc(doc(as('caregiverA'), 'musicLibrary', 'late'), entry));
    await assertFails(setDoc(doc(as('caregiverA'), 'movieLibrary', 'late'), entry));
  });

  it('an administrator cannot mark or unmark it themselves', async () => {
    await assertFails(updateDoc(doc(as('adminA'), 'organizations', 'orgA'), { status: 'active' }));
  });
});

describe('leaving an organization (security fix)', () => {
  // Only the server may clear someone's organization link (Manage Users →
  // Remove, or deleting the org) — otherwise a member could leave on their
  // own, keep access to residents they created, and join another facility.
  it('a user cannot clear their own orgId', async () => {
    await assertFails(
      updateDoc(doc(as('caregiverA'), 'users', 'caregiverA'), { orgId: deleteField() })
    );
  });

  it('other profile edits still work', async () => {
    await assertSucceeds(
      updateDoc(doc(as('caregiverA'), 'users', 'caregiverA'), { fullName: 'C. A.' })
    );
  });
});

describe('other facility', () => {
  it('cannot read a resident from another facility', async () => {
    await assertFails(getDoc(doc(as('caregiverB'), 'residents', 'residentA')));
  });

  it('cannot list another facility’s residents', async () => {
    const q = query(collection(as('caregiverB'), 'residents'), where('facilityId', '==', 'orgA'));
    await assertFails(getDocs(q));
  });

  it('cannot edit or delete a resident from another facility', async () => {
    const db = as('caregiverB');
    await assertFails(updateDoc(doc(db, 'residents', 'residentA'), { name: 'Hacked' }));
    await assertFails(deleteDoc(doc(db, 'residents', 'residentA')));
  });

  it('cannot create a resident inside another facility', async () => {
    await assertFails(
      addDoc(collection(as('caregiverB'), 'residents'), {
        name: 'Planted',
        caregiverId: 'caregiverB',
        createdBy: 'caregiverB',
        facilityId: 'orgA',
        assignedCaregivers: ['caregiverB'],
      })
    );
  });
});

describe('unauthenticated', () => {
  it('is denied every read and write', async () => {
    const db = as(null);
    await assertFails(getDoc(doc(db, 'residents', 'residentA')));
    await assertFails(
      getDocs(query(collection(db, 'residents'), where('facilityId', '==', 'orgA')))
    );
    await assertFails(updateDoc(doc(db, 'residents', 'residentA'), { name: 'x' }));
    await assertFails(
      addDoc(collection(db, 'residents'), { name: 'x', caregiverId: 'x', facilityId: null })
    );
  });
});

describe('role restrictions the rules enforce today', () => {
  it('only an Administrator of the same facility can delete a resident', async () => {
    await assertFails(deleteDoc(doc(as('caregiverA'), 'residents', 'residentA')));
    await assertSucceeds(deleteDoc(doc(as('adminA'), 'residents', 'residentA')));
  });

  it('a Volunteer in the facility can read but not edit a resident they are not assigned to', async () => {
    const db = as('volunteerA');
    await assertSucceeds(getDoc(doc(db, 'residents', 'residentA')));
    await assertFails(updateDoc(doc(db, 'residents', 'residentA'), { name: 'x' }));
  });

  it('a Family Caregiver cannot edit residents they are not assigned to', async () => {
    await assertFails(updateDoc(doc(as('familyA'), 'residents', 'residentA'), { name: 'x' }));
  });

  // Intended (owner decision, Sept 2026): family members may edit the
  // profiles of residents they're assigned to — they often know the life
  // story best. Unassigned residents stay off-limits (test above).
  it("an assigned Family Caregiver can edit that resident's profile", async () => {
    await assertSucceeds(
      updateDoc(doc(as('familyA'), 'residents', 'residentFamily'), { preferredName: 'Fay' })
    );
    await assertSucceeds(
      setDoc(doc(as('familyA'), 'residents', 'residentFamily', 'private', 'lifeStory'), {
        career: 'Teacher',
      })
    );
  });

  it('a user cannot change their own role', async () => {
    await assertFails(
      updateDoc(doc(as('volunteerA'), 'users', 'volunteerA'), { role: 'Administrator' })
    );
  });

  it('a user cannot point their orgId at another organization', async () => {
    await assertFails(updateDoc(doc(as('caregiverB'), 'users', 'caregiverB'), { orgId: 'orgA' }));
  });
});

// Security finding #1: a relative who joined the facility must only see the
// residents they're linked to, and only staff may use "Select from
// [Organization]" to add themselves to a resident.
describe('family members see only linked residents (security fix)', () => {
  it('a Family Caregiver cannot read an unlinked resident in their facility', async () => {
    await assertFails(getDoc(doc(as('familyA'), 'residents', 'residentA')));
  });

  it('a Family Caregiver can still read a resident they are assigned to', async () => {
    await assertSucceeds(getDoc(doc(as('familyA'), 'residents', 'residentFamily')));
    const q = query(
      collection(as('familyA'), 'residents'),
      where('assignedCaregivers', 'array-contains', 'familyA')
    );
    await assertSucceeds(getDocs(q));
  });

  // Joining a facility only moves the family member's orgId; residents they
  // created under their personal organization stay there (facilityId is
  // still the personal org) and remain theirs through createdBy.
  it('a Family Caregiver keeps residents from their personal organization after joining', async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'residents', 'residentPersonal'), {
        name: 'Mum',
        caregiverId: 'familyA',
        createdBy: 'familyA',
        facilityId: 'personalFamilyA',
        assignedCaregivers: ['familyA'],
      })
    );
    const db = as('familyA');
    await assertSucceeds(getDoc(doc(db, 'residents', 'residentPersonal')));
    await assertSucceeds(
      getDocs(query(collection(db, 'residents'), where('createdBy', '==', 'familyA')))
    );
    await assertSucceeds(
      updateDoc(doc(db, 'residents', 'residentPersonal'), { preferredName: 'Mum' })
    );
  });

  it('a Family Caregiver cannot list the whole facility', async () => {
    const q = query(collection(as('familyA'), 'residents'), where('facilityId', '==', 'orgA'));
    await assertFails(getDocs(q));
  });

  it('a Family Caregiver cannot read an unlinked resident’s life story', async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'residents', 'residentA', 'private', 'lifeStory'), {
        career: 'Nurse',
      })
    );
    await assertFails(getDoc(doc(as('familyA'), 'residents', 'residentA', 'private', 'lifeStory')));
  });

  const selfAssign = (uid) =>
    updateDoc(doc(as(uid), 'residents', 'residentA'), {
      assignedCaregivers: ['caregiverA', uid],
    });

  it('Family Caregivers and Volunteers cannot add themselves to a resident', async () => {
    await assertFails(selfAssign('familyA'));
    await assertFails(selfAssign('volunteerA'));
  });

  it('Caregivers and Administrators can add themselves to a resident', async () => {
    await assertSucceeds(selfAssign('adminA'));
  });
});

// Security review #5: the rules check field types and sizes, so a direct
// caller can't store data the screens don't expect.
describe('field validation (security fix)', () => {
  const lifeStoryDoc = (uid) => doc(as(uid), 'residents', 'residentA', 'private', 'lifeStory');

  it('refuses a resident name that is not a non-empty string', async () => {
    const db = as('caregiverA');
    await assertFails(updateDoc(doc(db, 'residents', 'residentA'), { name: 42 }));
    await assertFails(updateDoc(doc(db, 'residents', 'residentA'), { name: '' }));
    await assertFails(updateDoc(doc(db, 'residents', 'residentA'), { name: 'x'.repeat(201) }));
    await assertSucceeds(updateDoc(doc(db, 'residents', 'residentA'), { name: 'Annie' }));
  });

  it('refuses wrongly typed resident profile fields', async () => {
    const db = as('caregiverA');
    await assertFails(updateDoc(doc(db, 'residents', 'residentA'), { hasLifeStory: 'yes' }));
    await assertFails(
      updateDoc(doc(db, 'residents', 'residentA'), { selectedMusicVideoIds: 'abc' })
    );
    await assertSucceeds(
      updateDoc(doc(db, 'residents', 'residentA'), { selectedMusicVideoIds: ['abc123'] })
    );
  });

  it('accepts a life story shaped like BuildProfileScreen saves it', async () => {
    await assertSucceeds(
      setDoc(lifeStoryDoc('caregiverA'), {
        preferredName: 'Annie',
        age: '80-90',
        hasChildren: true,
        childrenDetails: 'Two',
        hobbies: ['Reading'],
        career: null,
      })
    );
  });

  it('refuses life stories with unknown keys or wrong types', async () => {
    await assertFails(setDoc(lifeStoryDoc('caregiverA'), { hobbies: 42 }));
    await assertFails(setDoc(lifeStoryDoc('caregiverA'), { hasChildren: 'yes' }));
    await assertFails(setDoc(lifeStoryDoc('caregiverA'), { career: 'x'.repeat(2001) }));
    await assertFails(setDoc(lifeStoryDoc('caregiverA'), { somethingElse: 'x' }));
  });

  const song = (overrides) => ({
    videoId: 'abc123',
    title: 'Crazy',
    genres: ['Country'],
    decade: '1960s',
    facilityId: 'orgA',
    ...overrides,
  });

  it('refuses malformed music library entries', async () => {
    const db = as('caregiverA');
    await assertFails(setDoc(doc(db, 'musicLibrary', 'orgA_abc123'), song({ title: 7 })));
    await assertFails(setDoc(doc(db, 'musicLibrary', 'bad2'), song({ videoId: '../x?y' })));
    await assertFails(setDoc(doc(db, 'musicLibrary', 'orgA_abc123'), song({ genres: 'Country' })));
    await assertFails(setDoc(doc(db, 'musicLibrary', 'orgA_abc123'), song({ extra: true })));
  });

  it('refuses malformed movie library entries and edits', async () => {
    const db = as('caregiverA');
    await assertFails(setDoc(doc(db, 'movieLibrary', 'orgA_abc123'), song({ title: '' })));
    await assertSucceeds(setDoc(doc(db, 'movieLibrary', 'orgA_abc123'), song({})));
    await assertFails(updateDoc(doc(db, 'movieLibrary', 'orgA_abc123'), { decade: 1960 }));
  });
});

// Security review #6: new library entries use the fixed id
// {facilityId}_{videoId}, so the same video can't be added twice.
describe('library entries have one fixed id per video (security fix)', () => {
  const song = {
    videoId: 'abc123',
    title: 'Crazy',
    genres: [],
    decade: '1960s',
    facilityId: 'orgA',
  };

  it('refuses a new entry under any other id', async () => {
    const db = as('caregiverA');
    await assertFails(setDoc(doc(db, 'musicLibrary', 'randomId'), song));
    await assertFails(setDoc(doc(db, 'movieLibrary', 'randomId'), song));
    await assertSucceeds(setDoc(doc(db, 'musicLibrary', 'orgA_abc123'), song));
  });

  // The add transaction reads the fixed id first, to see if it's taken.
  it('lets members check whether an entry exists in their own library only', async () => {
    await assertSucceeds(getDoc(doc(as('caregiverA'), 'musicLibrary', 'orgA_abc123')));
    await assertSucceeds(getDoc(doc(as('caregiverA'), 'movieLibrary', 'orgA_abc123')));
    await assertFails(getDoc(doc(as('caregiverB'), 'musicLibrary', 'orgA_abc123')));
  });
});

// Review item "users can grant themselves administrator" — NOT fixed yet;
// the owner is still deciding how roles should be assigned. This documents
// the current hole so a fix has a failing test to flip: changing `role` on
// your own profile is refused, but deleting the whole profile and creating
// it again with a new role is allowed. When roles become server-managed,
// change assertSucceeds to assertFails below.
describe('FLAG: role escalation by recreating your profile (open issue)', () => {
  it('a Volunteer can delete their profile and recreate it as an Administrator', async () => {
    const db = as('volunteerA');
    await assertFails(updateDoc(doc(db, 'users', 'volunteerA'), { role: 'Administrator' }));
    await assertSucceeds(deleteDoc(doc(db, 'users', 'volunteerA')));
    await assertSucceeds(setDoc(doc(db, 'users', 'volunteerA'), { role: 'Administrator' }));
  });
});

// Review item: caregiver-controlled safety notes ("topics to avoid"),
// residents/{id}/private/safety. Everyone linked may read them (volunteers
// included — they run sessions); only Caregivers/Administrators may write.
describe('safety notes (topics to avoid)', () => {
  const notes = (uid, text = 'No water activities') => ({
    topicsToAvoid: text,
    updatedBy: uid,
  });
  const ref = (uid, residentId = 'residentA') =>
    doc(as(uid), 'residents', residentId, 'private', 'safety');

  it('caregivers and admins in the facility can write them', async () => {
    await assertSucceeds(setDoc(ref('caregiverA'), notes('caregiverA')));
    await assertSucceeds(setDoc(ref('adminA'), notes('adminA')));
  });

  it('volunteers and family members cannot write them', async () => {
    await assertFails(setDoc(ref('volunteerA'), notes('volunteerA')));
    await assertFails(setDoc(ref('familyA', 'residentFamily'), notes('familyA')));
  });

  it('volunteers can read them even without life-story access', async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'residents', 'residentA', 'private', 'safety'), notes('adminA'))
    );
    await assertSucceeds(getDoc(ref('volunteerA')));
    await assertFails(getDoc(ref('caregiverB')));
  });

  it('refuses other fields, over-long notes, or a forged author', async () => {
    await assertFails(setDoc(ref('caregiverA'), { ...notes('caregiverA'), extra: 1 }));
    await assertFails(setDoc(ref('caregiverA'), notes('caregiverA', 'x'.repeat(2001))));
    await assertFails(setDoc(ref('caregiverA'), notes('adminA')));
  });

  it('life-story rules no longer apply to the safety doc, or vice versa', async () => {
    // A life-story-shaped write to "safety" is refused (wrong fields)…
    await assertFails(setDoc(ref('caregiverA'), { career: 'Teacher' }));
    // …and safety-shaped fields can't be written into the life story.
    await assertFails(
      setDoc(
        doc(as('caregiverA'), 'residents', 'residentA', 'private', 'lifeStory'),
        notes('caregiverA')
      )
    );
  });
});

// Review item: activity log. Only that organization's Administrators may
// read it, and nobody may write it from the app.
describe('activity log (auditLog)', () => {
  beforeEach(() =>
    env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'auditLog', 'e1'), { orgId: 'orgA', action: 'member.joined' })
    )
  );

  it('administrators of the organization can read it', async () => {
    await assertSucceeds(getDoc(doc(as('adminA'), 'auditLog', 'e1')));
    await assertSucceeds(
      getDocs(query(collection(as('adminA'), 'auditLog'), where('orgId', '==', 'orgA')))
    );
  });

  it('other roles and other organizations cannot', async () => {
    await assertFails(getDoc(doc(as('caregiverA'), 'auditLog', 'e1')));
    await assertFails(getDoc(doc(as('caregiverB'), 'auditLog', 'e1')));
  });

  it('nobody can write or delete entries from the app', async () => {
    await assertFails(setDoc(doc(as('adminA'), 'auditLog', 'e2'), { orgId: 'orgA' }));
    await assertFails(deleteDoc(doc(as('adminA'), 'auditLog', 'e1')));
  });
});

describe('family members linked by a family code (familyMembers)', () => {
  // residentCoded: familyA is on familyMembers only (as redeemFamilyCode
  // leaves it) — never on assignedCaregivers.
  beforeEach(() =>
    env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'residents', 'residentCoded'), {
        name: 'Cora',
        caregiverId: 'caregiverA',
        createdBy: 'caregiverA',
        facilityId: 'orgA',
        assignedCaregivers: ['caregiverA'],
        familyMembers: ['familyA'],
      });
      await setDoc(doc(db, 'residents', 'residentCoded', 'private', 'lifeStory'), {
        grewUpIn: 'Red Deer',
      });
      await setDoc(doc(db, 'familyCodes', 'ABCD-2345'), { residentId: 'residentCoded' });
    })
  );

  it('can read the resident and its life story', async () => {
    await assertSucceeds(getDoc(doc(as('familyA'), 'residents', 'residentCoded')));
    await assertSucceeds(
      getDoc(doc(as('familyA'), 'residents', 'residentCoded', 'private', 'lifeStory'))
    );
  });

  it('can list their linked residents (familyMembers array-contains query)', async () => {
    const q = query(
      collection(as('familyA'), 'residents'),
      where('familyMembers', 'array-contains', 'familyA')
    );
    const snap = await assertSucceeds(getDocs(q));
    expect(snap.docs.map((d) => d.id)).toEqual(['residentCoded']);
  });

  it('cannot run the query for someone else', async () => {
    const q = query(
      collection(as('caregiverB'), 'residents'),
      where('familyMembers', 'array-contains', 'familyA')
    );
    await assertFails(getDocs(q));
  });

  it('cannot edit the resident or its life story (view-only)', async () => {
    await assertFails(
      updateDoc(doc(as('familyA'), 'residents', 'residentCoded'), { name: 'Changed' })
    );
    await assertFails(
      setDoc(doc(as('familyA'), 'residents', 'residentCoded', 'private', 'lifeStory'), {
        grewUpIn: 'Changed',
      })
    );
  });

  it('nobody can change familyMembers from the app, not even staff', async () => {
    await assertFails(
      updateDoc(doc(as('familyA'), 'residents', 'residentA'), { familyMembers: ['familyA'] })
    );
    await assertFails(
      updateDoc(doc(as('caregiverA'), 'residents', 'residentA'), { familyMembers: ['familyA'] })
    );
  });

  it('family codes are server-only', async () => {
    await assertFails(getDoc(doc(as('familyA'), 'familyCodes', 'ABCD-2345')));
    await assertFails(getDoc(doc(as('adminA'), 'familyCodes', 'ABCD-2345')));
    await assertFails(
      setDoc(doc(as('familyA'), 'familyCodes', 'WXYZ-2345'), { residentId: 'residentA' })
    );
  });

  it('a family member who is not linked still sees nothing', async () => {
    await assertFails(getDoc(doc(as('familyA'), 'residents', 'residentA')));
  });
});
