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
function as(uid) {
  return uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore();
}

/** Writes test data with rules disabled, so setup can't be blocked by them. */
async function seed() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [uid, data] of Object.entries(USERS)) {
      await setDoc(doc(db, 'users', uid), data);
    }
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
      await setDoc(doc(ctx.firestore(), 'usernames', key), { uid, email: `${uid}@example.test` });
    });
  }
  function changeBatch(db, uid, newKey, oldKey) {
    const batch = writeBatch(db);
    batch.set(doc(db, 'usernames', newKey), { uid, email: `${uid}@example.test` });
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
    await assertSucceeds(setDoc(doc(as('caregiverA'), 'musicLibrary', 'm1'), entry('Crazy')));
  });

  it('a repeat save to the same id overwrites it (no duplicate)', async () => {
    const db = as('caregiverA');
    await assertSucceeds(setDoc(doc(db, 'musicLibrary', 'm2'), entry('Crazy')));
    await assertSucceeds(setDoc(doc(db, 'musicLibrary', 'm2'), entry('Crazy')));
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
    await assertSucceeds(setDoc(doc(db, 'musicLibrary', 'e1'), entry('Crazy')));
    await assertSucceeds(
      updateDoc(doc(db, 'musicLibrary', 'e1'), { title: 'Crazy (Live)', decade: '1950s' })
    );
  });

  it('cannot move an entry into the global library or another org', async () => {
    const db = as('caregiverA');
    await assertSucceeds(setDoc(doc(db, 'musicLibrary', 'e2'), entry('Crazy')));
    await assertFails(updateDoc(doc(db, 'musicLibrary', 'e2'), { facilityId: 'global' }));
    await assertFails(updateDoc(doc(db, 'musicLibrary', 'e2'), { facilityId: 'orgB' }));
  });

  it('cannot turn an entry into a different video or add unknown fields', async () => {
    const db = as('caregiverA');
    await assertSucceeds(setDoc(doc(db, 'musicLibrary', 'e3'), entry('Crazy')));
    await assertFails(updateDoc(doc(db, 'musicLibrary', 'e3'), { videoId: 'other' }));
    await assertFails(updateDoc(doc(db, 'musicLibrary', 'e3'), { featured: true }));
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

  // Documents current behaviour, which may not match what the app assumes:
  // Family Mode is described as read-only ("View resident stats"), but the
  // rules let an *assigned* Family Caregiver edit that resident's profile
  // fields. Flagged for a decision — not changed here.
  it('FLAG: an assigned Family Caregiver CAN edit profile fields (rules are not read-only for Family)', async () => {
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
