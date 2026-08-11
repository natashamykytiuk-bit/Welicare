import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O, easy to misread
const MAX_ATTEMPTS = 5;

export function generateInviteCode() {
  const letters = Array.from({ length: 2 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
  const digits = String(Math.floor(1000 + Math.random() * 9000));
  return `${letters}-${digits}`;
}

// Invite codes are always 2 letters + 4 digits (see generateInviteCode
// above), e.g. "MG-4821" — this mirrors that shape as the user types so
// they never have to type the dash themselves: it strips anything that
// isn't alphanumeric, treats the first 2 characters as the letters and the
// next 4 as digits (silently dropping non-digit keystrokes there, since
// that segment can only ever be numeric), and only inserts the dash once a
// digit has actually been entered. Shared by JoinOrganizationScreen
// (onboarding) and OrganizationSettingsScreen (joining later from a
// personal org).
export function formatOrgCode(raw) {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const letters = cleaned.slice(0, 2);
  const digits = cleaned.slice(2, 6).replace(/[^0-9]/g, '');
  return digits ? `${letters}-${digits}` : letters;
}

async function codeExists(code) {
  const snapshot = await getDocs(query(collection(db, 'organizations'), where('inviteCode', '==', code)));
  return !snapshot.empty;
}

// Creates a new organization with a unique invite/join code (2 letters + 4
// digits — 6 alphanumeric characters, e.g. "XY-4829"), then links the
// current user to it. Collisions are rare but we retry a few times rather
// than trusting a single random draw. adminId mirrors createdBy: whoever
// creates an org is its administrator, regardless of their platform role
// (createdBy stays the field firestore.rules checks for edit/delete, so it
// isn't renamed — adminId is purely additive for admin-facing screens).
// The org's email is the creator's own account email — there's no separate
// "organization email" to collect, so CreateOrganizationScreen doesn't ask
// for one.
export async function createOrganization({ name, type, province, city }) {
  let code = generateInviteCode();
  for (let attempt = 0; attempt < MAX_ATTEMPTS && (await codeExists(code)); attempt += 1) {
    code = generateInviteCode();
  }

  const uid = auth.currentUser?.uid;
  const orgRef = await addDoc(collection(db, 'organizations'), {
    name,
    type,
    province,
    city,
    email: auth.currentUser?.email ?? null,
    inviteCode: code,
    createdBy: uid,
    adminId: uid,
    createdAt: serverTimestamp(),
  });
  await setDoc(doc(db, 'users', uid), { orgId: orgRef.id }, { merge: true });
  return orgRef.id;
}

// Looks up an organization by its invite code and links the current user
// to it via orgId (the field every screen already reads — ModeSelectionScreen's
// facility-name lookup, etc.). Returns the orgId, or throws if no
// organization matches. The user's role was already written to Firestore at
// sign-up, so joining doesn't need to touch it.
//
// Used by both JoinOrganizationScreen (onboarding, brand-new users with no
// orgId yet) and OrganizationSettingsScreen (a Family Caregiver upgrading
// off their auto-created personal org — see createPersonalOrganization).
// Anyone already settled into a real (non-personal) org is blocked from
// switching this way, so this can't be used to accidentally hop between
// facilities.
export async function joinOrganizationByCode(code) {
  const uid = auth.currentUser?.uid;
  const userSnap = await getDoc(doc(db, 'users', uid));
  const currentOrgId = userSnap.data()?.orgId;
  if (currentOrgId) {
    const currentOrgSnap = await getDoc(doc(db, 'organizations', currentOrgId));
    if (currentOrgSnap.exists() && currentOrgSnap.data().isPersonal !== true) {
      throw new Error("You're already part of an organization. Contact an administrator if you need to switch.");
    }
  }

  const snapshot = await getDocs(
    query(collection(db, 'organizations'), where('inviteCode', '==', code.trim().toUpperCase()))
  );
  if (snapshot.empty) {
    throw new Error('No organization found with that code. Please check it and try again.');
  }
  const orgId = snapshot.docs[0].id;
  await setDoc(doc(db, 'users', uid), { orgId }, { merge: true });
  return orgId;
}

// Creates a lightweight organization scoped to just one person — used for
// Family Caregiver sign-ups (see SignUpScreen), who aren't part of a care
// facility but still need an orgId so org-scoped features (e.g. the
// musicLibrary rules) work the same way for them as everyone else.
// isPersonal marks it as upgradeable later via upgradePersonalOrganization
// rather than something a colleague could ever discover/join — it has no
// inviteCode until that happens.
export async function createPersonalOrganization() {
  const uid = auth.currentUser?.uid;
  const orgRef = await addDoc(collection(db, 'organizations'), {
    name: null,
    type: null,
    province: null,
    city: null,
    email: auth.currentUser?.email ?? null,
    inviteCode: null,
    isPersonal: true,
    createdBy: uid,
    adminId: uid,
    createdAt: serverTimestamp(),
  });
  await setDoc(doc(db, 'users', uid), { orgId: orgRef.id }, { merge: true });
  return orgRef.id;
}

// Converts the caller's own personal organization (see
// createPersonalOrganization) into a real, shareable one in place — same
// orgId, so anything already scoped to it (residents, musicLibrary
// entries) carries over automatically rather than needing to be moved.
// Only valid while isPersonal is still true; OrganizationSettingsScreen
// only offers this while that holds, and firestore.rules' existing
// "only the creator can update" check on organizations already covers
// write access here — no rule changes needed.
export async function upgradePersonalOrganization({ name }) {
  const uid = auth.currentUser?.uid;
  const userSnap = await getDoc(doc(db, 'users', uid));
  const orgId = userSnap.data()?.orgId;
  if (!orgId) throw new Error('No organization to upgrade.');
  const orgSnap = await getDoc(doc(db, 'organizations', orgId));
  if (!orgSnap.exists() || orgSnap.data().isPersonal !== true) {
    throw new Error('Your organization has already been upgraded.');
  }

  let code = generateInviteCode();
  for (let attempt = 0; attempt < MAX_ATTEMPTS && (await codeExists(code)); attempt += 1) {
    code = generateInviteCode();
  }

  await setDoc(doc(db, 'organizations', orgId), { name, inviteCode: code, isPersonal: false }, { merge: true });
  return { orgId, inviteCode: code };
}
