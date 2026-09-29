// Security-rules tests for the resident photo album (utils/residentPhotos.js):
// both halves of each photo — the metadata doc under
// residents/{residentId}/photos in Firestore (firestore.rules) and the JPEG
// at residents/{residentId}/photos/{photoId}.jpg in Cloud Storage
// (storage.rules, which reads Firestore through cross-service calls).
//
// Run with `npm run test:rules` — it starts the Firestore AND Storage
// emulators, so storage.rules' firestore.get() calls see the users and
// residents seeded below.

const fs = require('fs');
const path = require('path');
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require('@firebase/rules-unit-testing');
const {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  setLogLevel,
  updateDoc,
} = require('firebase/firestore');

let env;

// familyA is linked to residentA (on its assignedCaregivers); familyA2 is
// in the same facility but NOT linked — families don't see the whole
// facility. caregiverB belongs to another organization entirely.
const USERS = {
  adminA: { role: 'Administrator', orgId: 'orgA', fullName: 'Ada Admin' },
  caregiverA: { role: 'Caregiver', orgId: 'orgA', fullName: 'Cara Caregiver' },
  volunteerA: { role: 'Volunteer', orgId: 'orgA', fullName: 'Val Volunteer' },
  familyA: { role: 'Family Caregiver', orgId: 'orgA', fullName: 'Fran Family' },
  familyA2: { role: 'Family Caregiver', orgId: 'orgA', fullName: 'Finn Family' },
  caregiverB: { role: 'Caregiver', orgId: 'orgB', fullName: 'Cody Caregiver' },
};

const RESIDENT = 'residentA';
const photoPath = (photoId, residentId = RESIDENT) =>
  `residents/${residentId}/photos/${photoId}.jpg`;

/** A signed-in, email-verified user (or signed-out for null). */
function ctx(uid, { verified = true } = {}) {
  return uid
    ? env.authenticatedContext(uid, { email_verified: verified })
    : env.unauthenticatedContext();
}
const fsAs = (uid, opts) => ctx(uid, opts).firestore();
const stAs = (uid, opts) => ctx(uid, opts).storage();

/** The metadata doc uploadResidentPhoto writes. */
function photoDoc(uid, photoId, overrides = {}) {
  return {
    storagePath: photoPath(photoId),
    caption: 'Grandma at the lake',
    uploadedBy: uid,
    uploaderName: USERS[uid]?.fullName ?? '',
    uploadedAt: serverTimestamp(),
    width: 1600,
    height: 1200,
    ...overrides,
  };
}

// A few bytes stand in for a JPEG — the rules only check size and type.
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const jpegMeta = (uid) => ({ contentType: 'image/jpeg', customMetadata: { uploadedBy: uid } });

/** Uploads through the compat Storage SDK and resolves when done. */
function put(storage, filePath, data = JPEG, metadata) {
  return storage
    .ref(filePath)
    .put(data, metadata)
    .then((s) => s);
}

async function seed() {
  await env.withSecurityRulesDisabled(async (admin) => {
    const db = admin.firestore();
    for (const [uid, data] of Object.entries(USERS)) {
      await setDoc(doc(db, 'users', uid), data);
    }
    await setDoc(doc(db, 'organizations', 'orgA'), { name: 'Maple', createdBy: 'adminA' });
    await setDoc(doc(db, 'organizations', 'orgB'), { name: 'Oak', createdBy: 'caregiverB' });
    await setDoc(doc(db, 'residents', RESIDENT), {
      name: 'Ann',
      caregiverId: 'caregiverA',
      createdBy: 'caregiverA',
      facilityId: 'orgA',
      assignedCaregivers: ['caregiverA', 'familyA'],
    });
    // One existing photo, shared by familyA, in both Firestore and Storage.
    await setDoc(doc(db, 'residents', RESIDENT, 'photos', 'existing'), {
      ...photoDoc('familyA', 'existing'),
      uploadedAt: new Date('2026-09-01T10:00:00Z'),
    });
    await put(admin.storage(), photoPath('existing'), JPEG, jpegMeta('familyA'));
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

const photosCol = (db) => collection(db, 'residents', RESIDENT, 'photos');
const photoRef = (db, id) => doc(db, 'residents', RESIDENT, 'photos', id);

describe('linked family member', () => {
  it('can upload a photo (file, then doc) and read the album', async () => {
    await assertSucceeds(put(stAs('familyA'), photoPath('p1'), JPEG, jpegMeta('familyA')));
    await assertSucceeds(setDoc(photoRef(fsAs('familyA'), 'p1'), photoDoc('familyA', 'p1')));
    await assertSucceeds(getDocs(photosCol(fsAs('familyA'))));
    await assertSucceeds(getDoc(photoRef(fsAs('familyA'), 'existing')));
    await assertSucceeds(stAs('familyA').ref(photoPath('existing')).getDownloadURL());
  });
});

describe('unlinked family member in the same facility', () => {
  it('cannot read the album or its files', async () => {
    await assertFails(getDocs(photosCol(fsAs('familyA2'))));
    await assertFails(getDoc(photoRef(fsAs('familyA2'), 'existing')));
    await assertFails(stAs('familyA2').ref(photoPath('existing')).getDownloadURL());
  });

  it('cannot upload', async () => {
    await assertFails(put(stAs('familyA2'), photoPath('p2'), JPEG, jpegMeta('familyA2')));
    await assertFails(setDoc(photoRef(fsAs('familyA2'), 'p2'), photoDoc('familyA2', 'p2')));
  });
});

describe('volunteer', () => {
  it('can read (they may run Resident Mode)', async () => {
    await assertSucceeds(getDocs(photosCol(fsAs('volunteerA'))));
    await assertSucceeds(stAs('volunteerA').ref(photoPath('existing')).getDownloadURL());
  });

  it('cannot upload', async () => {
    await assertFails(put(stAs('volunteerA'), photoPath('p3'), JPEG, jpegMeta('volunteerA')));
    await assertFails(setDoc(photoRef(fsAs('volunteerA'), 'p3'), photoDoc('volunteerA', 'p3')));
  });
});

describe('deleting', () => {
  it('the uploader can delete their own photo', async () => {
    await assertSucceeds(stAs('familyA').ref(photoPath('existing')).delete());
    await assertSucceeds(deleteDoc(photoRef(fsAs('familyA'), 'existing')));
  });

  it('another family member cannot', async () => {
    // Link familyA2 so the refusal is about ownership, not linkage.
    await env.withSecurityRulesDisabled(async (admin) => {
      await updateDoc(doc(admin.firestore(), 'residents', RESIDENT), {
        assignedCaregivers: ['caregiverA', 'familyA', 'familyA2'],
      });
    });
    await assertFails(stAs('familyA2').ref(photoPath('existing')).delete());
    await assertFails(deleteDoc(photoRef(fsAs('familyA2'), 'existing')));
  });

  it("a caregiver in the resident's facility can delete any photo", async () => {
    await assertSucceeds(stAs('caregiverA').ref(photoPath('existing')).delete());
    await assertSucceeds(deleteDoc(photoRef(fsAs('caregiverA'), 'existing')));
  });

  it("a volunteer in the facility can't moderate", async () => {
    await assertFails(stAs('volunteerA').ref(photoPath('existing')).delete());
    await assertFails(deleteDoc(photoRef(fsAs('volunteerA'), 'existing')));
  });
});

describe('another organization', () => {
  it('a caregiver from another org cannot read or delete', async () => {
    await assertFails(getDocs(photosCol(fsAs('caregiverB'))));
    await assertFails(getDoc(photoRef(fsAs('caregiverB'), 'existing')));
    await assertFails(stAs('caregiverB').ref(photoPath('existing')).getDownloadURL());
    await assertFails(stAs('caregiverB').ref(photoPath('existing')).delete());
    await assertFails(deleteDoc(photoRef(fsAs('caregiverB'), 'existing')));
  });
});

describe('upload validation', () => {
  it('rejects files of 5 MB or more', async () => {
    const big = new Uint8Array(5 * 1024 * 1024);
    await assertFails(put(stAs('familyA'), photoPath('big'), big, jpegMeta('familyA')));
  });

  it('rejects anything but JPEG', async () => {
    await assertFails(
      put(stAs('familyA'), photoPath('png'), JPEG, {
        contentType: 'image/png',
        customMetadata: { uploadedBy: 'familyA' },
      })
    );
  });

  it('rejects a mismatched uploadedBy', async () => {
    await assertFails(put(stAs('familyA'), photoPath('p4'), JPEG, jpegMeta('caregiverA')));
    await assertFails(put(stAs('familyA'), photoPath('p5'), JPEG, { contentType: 'image/jpeg' }));
    await assertFails(
      setDoc(
        photoRef(fsAs('familyA'), 'p4'),
        photoDoc('familyA', 'p4', { uploadedBy: 'caregiverA' })
      )
    );
  });

  it('rejects overwriting an existing file or editing a doc', async () => {
    await assertFails(put(stAs('familyA'), photoPath('existing'), JPEG, jpegMeta('familyA')));
    await assertFails(updateDoc(photoRef(fsAs('familyA'), 'existing'), { caption: 'New' }));
  });

  it('rejects bad metadata docs', async () => {
    const db = fsAs('familyA');
    await assertFails(
      setDoc(photoRef(db, 'p6'), photoDoc('familyA', 'p6', { caption: 'x'.repeat(201) }))
    );
    await assertFails(
      setDoc(photoRef(db, 'p6'), photoDoc('familyA', 'p6', { storagePath: photoPath('other') }))
    );
    await assertFails(
      setDoc(photoRef(db, 'p6'), photoDoc('familyA', 'p6', { downloadUrl: 'https://x' }))
    );
    await assertFails(
      setDoc(photoRef(db, 'p6'), photoDoc('familyA', 'p6', { uploadedAt: new Date() }))
    );
    const missing = photoDoc('familyA', 'p6');
    delete missing.width;
    await assertFails(setDoc(photoRef(db, 'p6'), missing));
    // An empty caption is fine.
    await assertSucceeds(setDoc(photoRef(db, 'p6'), photoDoc('familyA', 'p6', { caption: '' })));
  });

  it("refuses new photos while the resident's organization is being deleted", async () => {
    await env.withSecurityRulesDisabled(async (admin) => {
      await updateDoc(doc(admin.firestore(), 'organizations', 'orgA'), { status: 'deleting' });
    });
    await assertFails(setDoc(photoRef(fsAs('familyA'), 'p7'), photoDoc('familyA', 'p7')));
  });

  it('refuses signed-out and unverified users', async () => {
    await assertFails(put(stAs(null), photoPath('p8'), JPEG, jpegMeta('familyA')));
    await assertFails(
      put(stAs('familyA', { verified: false }), photoPath('p8'), JPEG, jpegMeta('familyA'))
    );
    await assertFails(getDocs(photosCol(fsAs('familyA', { verified: false }))));
  });
});
