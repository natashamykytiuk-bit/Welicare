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

// Creates a new organization with a unique invite code, then links the
// current user to it. Collisions are rare (2 letters x 4 digits) but we
// retry a few times rather than trusting a single random draw.
export async function createOrganization({ name, type, province, city, email }) {
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
    email,
    inviteCode: code,
    createdBy: uid,
    createdAt: serverTimestamp(),
  });
  await setDoc(doc(db, 'users', uid), { orgId: orgRef.id }, { merge: true });
  return orgRef.id;
}

// Looks up an organization by its invite code and links the current user
// to it. Returns the orgId, or throws if no organization matches.
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
