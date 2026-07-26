import {
  addDoc,
  collection,
  doc,
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
export async function joinOrganizationByCode(code) {
  const snapshot = await getDocs(
    query(collection(db, 'organizations'), where('inviteCode', '==', code.trim().toUpperCase()))
  );
  if (snapshot.empty) {
    throw new Error('No organization found with that code. Please check it and try again.');
  }
  const orgId = snapshot.docs[0].id;
  const uid = auth.currentUser?.uid;
  await setDoc(doc(db, 'users', uid), { orgId }, { merge: true });
  return orgId;
}
