// Security-rules tests for single profile photos (utils/profilePhotos.js):
//   - a resident's profile photo: residents/{id}.photoPath in Firestore and
//     residents/{id}/profile.jpg in Storage;
//   - a user's optional avatar: users/{uid}.avatarPath and
//     users/{uid}/avatar.jpg.
// Run with `npm run test:rules` (Firestore + Storage emulators).

const fs = require('fs');
const path = require('path');
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require('@firebase/rules-unit-testing');
const {
  deleteField,
  doc,
  serverTimestamp,
  setDoc,
  setLogLevel,
  updateDoc,
} = require('firebase/firestore');

let env;

// familyA is assigned to residentA but didn't create it; familyCreator
// created residentF (a family member's own resident, in no facility).
// familyA2 is in orgA but not linked to anyone. caregiverB is another org.
const USERS = {
  adminA: { role: 'Administrator', orgId: 'orgA' },
  caregiverA: { role: 'Caregiver', orgId: 'orgA' },
  caregiverA2: { role: 'Caregiver', orgId: 'orgA' },
  volunteerA: { role: 'Volunteer', orgId: 'orgA' },
  familyA: { role: 'Family Caregiver', orgId: 'orgA' },
  familyA2: { role: 'Family Caregiver', orgId: 'orgA' },
  familyCreator: { role: 'Family Caregiver' },
  caregiverB: { role: 'Caregiver', orgId: 'orgB' },
};

const RES = 'residentA';
const FAM_RES = 'residentF';
const profilePath = (id) => `residents/${id}/profile.jpg`;
const avatarFile = (uid) => `users/${uid}/avatar.jpg`;

function ctx(uid, { verified = true } = {}) {
  return uid
    ? env.authenticatedContext(uid, { email_verified: verified })
    : env.unauthenticatedContext();
}
const fsAs = (uid) => ctx(uid).firestore();
const stAs = (uid) => ctx(uid).storage();

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const meta = (uid) => ({ contentType: 'image/jpeg', customMetadata: { uploadedBy: uid } });
const put = (storage, p, data = JPEG, m) =>
  storage
    .ref(p)
    .put(data, m)
    .then((s) => s);

/** The update setResidentPhoto makes. */
const setPhoto = (uid, id, overrides = {}) =>
  updateDoc(doc(fsAs(uid), 'residents', id), {
    photoPath: profilePath(id),
    photoUpdatedAt: serverTimestamp(),
    ...overrides,
  });

async function seed() {
  await env.withSecurityRulesDisabled(async (admin) => {
    const db = admin.firestore();
    for (const [uid, data] of Object.entries(USERS)) await setDoc(doc(db, 'users', uid), data);
    await setDoc(doc(db, 'organizations', 'orgA'), { name: 'Maple', createdBy: 'adminA' });
    await setDoc(doc(db, 'residents', RES), {
      name: 'Ann',
      caregiverId: 'caregiverA',
      createdBy: 'caregiverA',
      facilityId: 'orgA',
      assignedCaregivers: ['caregiverA', 'familyA'],
    });
    await setDoc(doc(db, 'residents', FAM_RES), {
      name: 'Fay',
      caregiverId: 'familyCreator',
      createdBy: 'familyCreator',
      facilityId: null,
      assignedCaregivers: ['familyCreator'],
    });
    // Existing files, for read/delete tests.
    await put(admin.storage(), profilePath(RES), JPEG, meta('caregiverA'));
    await put(admin.storage(), avatarFile('familyA'), JPEG, meta('familyA'));
  });
}

beforeAll(async () => {
  setLogLevel('silent');
  const root = path.join(__dirname, '..', '..');
  env = await initializeTestEnvironment({
    projectId: 'demo-welicare',
    firestore: { rules: fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8') },
    storage: { rules: fs.readFileSync(path.join(root, 'storage.rules'), 'utf8') },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  await seed();
});

afterAll(async () => {
  await env.cleanup();
});

describe('resident profile photo: who can set it', () => {
  it('a caregiver in the facility can (file and doc), even if not assigned', async () => {
    await assertSucceeds(put(stAs('caregiverA2'), profilePath(RES), JPEG, meta('caregiverA2')));
    await assertSucceeds(setPhoto('caregiverA2', RES));
    // Remove too.
    await assertSucceeds(
      updateDoc(doc(fsAs('caregiverA2'), 'residents', RES), {
        photoPath: deleteField(),
        photoUpdatedAt: deleteField(),
      })
    );
    await assertSucceeds(stAs('caregiverA2').ref(profilePath(RES)).delete());
  });

  it('a volunteer cannot', async () => {
    await assertFails(put(stAs('volunteerA'), profilePath(RES), JPEG, meta('volunteerA')));
    await assertFails(setPhoto('volunteerA', RES));
    await assertFails(stAs('volunteerA').ref(profilePath(RES)).delete());
  });

  it("an assigned family member who isn't the creator cannot — though they can still edit the name", async () => {
    await assertFails(put(stAs('familyA'), profilePath(RES), JPEG, meta('familyA')));
    await assertFails(setPhoto('familyA', RES));
    await assertFails(stAs('familyA').ref(profilePath(RES)).delete());
    await assertSucceeds(updateDoc(doc(fsAs('familyA'), 'residents', RES), { name: 'Annie' }));
  });

  it('the family member who created the resident can', async () => {
    await assertSucceeds(
      put(stAs('familyCreator'), profilePath(FAM_RES), JPEG, meta('familyCreator'))
    );
    await assertSucceeds(setPhoto('familyCreator', FAM_RES));
  });

  it('rejects a photoPath pointing anywhere else', async () => {
    await assertFails(setPhoto('caregiverA', RES, { photoPath: profilePath(FAM_RES) }));
    await assertFails(setPhoto('caregiverA', RES, { photoPath: 'users/caregiverA/avatar.jpg' }));
    await assertFails(setPhoto('caregiverA', RES, { photoPath: `residents/${RES}/photos/x.jpg` }));
  });

  it('rejects oversized, non-JPEG or mis-stamped files', async () => {
    const big = new Uint8Array(2 * 1024 * 1024);
    await assertFails(put(stAs('caregiverA'), profilePath(RES), big, meta('caregiverA')));
    await assertFails(
      put(stAs('caregiverA'), profilePath(RES), JPEG, {
        contentType: 'image/png',
        customMetadata: { uploadedBy: 'caregiverA' },
      })
    );
    await assertFails(put(stAs('caregiverA'), profilePath(RES), JPEG, meta('adminA')));
  });
});

describe('resident profile photo: who can see it', () => {
  it('linked users can read it (staff, assigned family, volunteers)', async () => {
    for (const uid of ['caregiverA', 'familyA', 'volunteerA', 'adminA']) {
      await assertSucceeds(stAs(uid).ref(profilePath(RES)).getDownloadURL());
    }
  });

  it('unlinked users cannot', async () => {
    for (const uid of ['familyA2', 'caregiverB', 'familyCreator']) {
      await assertFails(stAs(uid).ref(profilePath(RES)).getDownloadURL());
    }
    await assertFails(stAs(null).ref(profilePath(RES)).getDownloadURL());
  });
});

describe('user avatars', () => {
  it('a user can upload, replace and remove their own', async () => {
    const st = stAs('caregiverA');
    await assertSucceeds(put(st, avatarFile('caregiverA'), JPEG, meta('caregiverA')));
    await assertSucceeds(put(st, avatarFile('caregiverA'), JPEG, meta('caregiverA')));
    await assertSucceeds(
      updateDoc(doc(fsAs('caregiverA'), 'users', 'caregiverA'), {
        avatarPath: avatarFile('caregiverA'),
        avatarUpdatedAt: serverTimestamp(),
      })
    );
    await assertSucceeds(
      updateDoc(doc(fsAs('caregiverA'), 'users', 'caregiverA'), {
        avatarPath: deleteField(),
        avatarUpdatedAt: deleteField(),
      })
    );
    await assertSucceeds(st.ref(avatarFile('caregiverA')).delete());
  });

  it("but not someone else's", async () => {
    await assertFails(put(stAs('caregiverA'), avatarFile('familyA'), JPEG, meta('caregiverA')));
    await assertFails(stAs('caregiverA').ref(avatarFile('familyA')).delete());
  });

  it('rejects avatars of 1 MB or more, or not JPEG', async () => {
    const big = new Uint8Array(1024 * 1024);
    await assertFails(put(stAs('caregiverA'), avatarFile('caregiverA'), big, meta('caregiverA')));
    await assertFails(
      put(stAs('caregiverA'), avatarFile('caregiverA'), JPEG, { contentType: 'image/gif' })
    );
  });

  it('only accepts their own avatar path on the users doc', async () => {
    await assertFails(
      updateDoc(doc(fsAs('caregiverA'), 'users', 'caregiverA'), {
        avatarPath: avatarFile('familyA'),
      })
    );
    await assertFails(
      updateDoc(doc(fsAs('caregiverA'), 'users', 'caregiverA'), {
        avatarPath: avatarFile('caregiverA'),
        avatarUpdatedAt: new Date(0),
      })
    );
  });

  it('same-organization users can see an avatar; other organizations cannot', async () => {
    for (const uid of ['familyA', 'caregiverA', 'volunteerA', 'familyA2']) {
      await assertSucceeds(stAs(uid).ref(avatarFile('familyA')).getDownloadURL());
    }
    await assertFails(stAs('caregiverB').ref(avatarFile('familyA')).getDownloadURL());
    // No organization at all: can't see anyone else's.
    await assertFails(stAs('familyCreator').ref(avatarFile('familyA')).getDownloadURL());
  });

  it("still can't change role or orgId while setting an avatar", async () => {
    const me = doc(fsAs('familyA'), 'users', 'familyA');
    const avatar = { avatarPath: avatarFile('familyA'), avatarUpdatedAt: serverTimestamp() };
    await assertFails(updateDoc(me, { ...avatar, role: 'Administrator' }));
    await assertFails(updateDoc(me, { ...avatar, orgId: 'orgB' }));
    await assertSucceeds(updateDoc(me, avatar));
  });
});
