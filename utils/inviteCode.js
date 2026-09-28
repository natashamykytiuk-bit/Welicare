import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '../firebaseConfig';

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O, easy to misread

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

const callGenerateInviteCode = httpsCallable(functions, 'generateInviteCode');
const callJoinOrganization = httpsCallable(functions, 'joinOrganization');

// A fresh invite code that no other organization is using. Minted by the
// generateInviteCode Cloud Function, not locally with generateInviteCode()
// above, because firestore.rules don't let the app list organizations —
// so only the server can check a code isn't already taken.
async function uniqueInviteCode() {
  const result = await callGenerateInviteCode();
  return result.data.code;
}

// Creates a new organization with a unique invite/join code (2 letters + 4
// digits — 6 alphanumeric characters, e.g. "XY-4829"), then links the
// current user to it — the code comes from the server (uniqueInviteCode),
// which checks nobody else has it. adminId mirrors createdBy: whoever
// creates an org is its administrator, regardless of their platform role
// (createdBy stays the field firestore.rules checks for edit/delete, so it
// isn't renamed — adminId is purely additive for admin-facing screens).
// The org's email is the creator's own account email — there's no separate
// "organization email" to collect, so CreateOrganizationScreen doesn't ask
// for one.
export async function createOrganization({ name, type, province, city }) {
  const code = await uniqueInviteCode();

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
//
// Runs in the joinOrganization Cloud Function rather than here, because
// firestore.rules only let the app set orgId to an org the user created
// themselves (and don't let it look orgs up by code at all) — so the code
// check and the orgId write both have to happen server-side. The
// function's error messages are user-facing, and callers show e.message.
export async function joinOrganizationByCode(code) {
  const result = await callJoinOrganization({ code });
  return result.data.orgId;
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

  const code = await uniqueInviteCode();

  await setDoc(doc(db, 'organizations', orgId), { name, inviteCode: code, isPersonal: false }, { merge: true });
  return { orgId, inviteCode: code };
}
