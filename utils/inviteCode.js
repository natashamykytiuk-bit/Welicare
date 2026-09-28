// @ts-check
import { collection, doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '../firebaseConfig';

// Organization membership and invite codes are server-controlled: creating
// a real organization, upgrading a personal one, joining by code and
// issuing a new code all run in Cloud Functions (see functions/index.js).
// firestore.rules only let the app create *personal* organizations and
// point a user's orgId at an org they created, and invite codes live in a
// server-only lookup table rather than on the (widely readable)
// organization doc. The functions' error messages are user-facing, and
// callers show e.message.
// Each callable is typed with its request and response shape (matching
// functions/index.js), so `npm run typecheck` flags a renamed field.
/** @template Req, Res @typedef {import('firebase/functions').HttpsCallable<Req, Res>} Callable */
const callCreateOrganization =
  /** @type {Callable<{ name: string, type?: string, province?: string, city?: string }, { orgId: string, inviteCode: string }>} */ (
    httpsCallable(functions, 'createOrganization')
  );
const callUpgradePersonalOrganization =
  /** @type {Callable<{ name: string }, { orgId: string, inviteCode: string }>} */ (
    httpsCallable(functions, 'upgradePersonalOrganization')
  );
const callJoinOrganization = /** @type {Callable<{ code: string }, { orgId: string }>} */ (
  httpsCallable(functions, 'joinOrganization')
);
const callRegenerateInviteCode =
  /** @type {Callable<{ orgId: string }, { inviteCode: string }>} */ (
    httpsCallable(functions, 'regenerateInviteCode')
  );

// Invite codes are always 2 letters + 4 digits, e.g. "MG-4821" (minted by
// the server) — this mirrors that shape as the user types so they never
// have to type the dash themselves: it strips anything that isn't
// alphanumeric, treats the first 2 characters as the letters and the next
// 4 as digits (silently dropping non-digit keystrokes there, since that
// segment can only ever be numeric), and only inserts the dash once a
// digit has actually been entered. Shared by JoinOrganizationScreen
// (onboarding) and OrganizationSettingsScreen (joining later from a
// personal org).
/**
 * @param {string} raw What the user has typed so far.
 * @returns {string} e.g. 'MG', 'MG-48', 'MG-4821'
 */
export function formatOrgCode(raw) {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const letters = cleaned.slice(0, 2);
  const digits = cleaned.slice(2, 6).replace(/[^0-9]/g, '');
  return digits ? `${letters}-${digits}` : letters;
}

// Creates a new organization owned by the current user, with a unique
// invite code, and links them to it. adminId mirrors createdBy: whoever
// creates an org is its administrator. The org's email is the creator's
// own account email, so CreateOrganizationScreen doesn't ask for one.
export async function createOrganization({ name, type, province, city }) {
  const result = await callCreateOrganization({ name, type, province, city });
  return result.data.orgId;
}

// Links the current user to the organization with this invite code.
// Used by both JoinOrganizationScreen (onboarding) and
// OrganizationSettingsScreen (a Family Caregiver leaving their personal
// org). The server refuses anyone already in a real (non-personal) org, so
// this can't be used to hop between facilities, and rate-limits attempts.
export async function joinOrganizationByCode(code) {
  const result = await callJoinOrganization({ code });
  return result.data.orgId;
}

// The organization's current invite code, or null if it has none (e.g. a
// personal org). Stored at organizations/{orgId}/private/invite, which
// firestore.rules only let the org's own members read.
export async function fetchInviteCode(orgId) {
  if (!orgId) return null;
  try {
    const snap = await getDoc(doc(db, 'organizations', orgId, 'private', 'invite'));
    return snap.data()?.code ?? null;
  } catch (e) {
    // Not a member (or offline) — treat as "no code to show".
    console.log('fetchInviteCode error:', e.code, e.message);
    return null;
  }
}

// Revokes the organization's current invite code and issues a new one
// (owner only). People who already joined stay joined.
export async function regenerateInviteCode(orgId) {
  const result = await callRegenerateInviteCode({ orgId });
  return result.data.inviteCode;
}

// Creates a lightweight organization scoped to just one person — used for
// Family Caregiver sign-ups (see SignUpScreen), who aren't part of a care
// facility but still need an orgId so org-scoped features (e.g. the
// musicLibrary rules) work the same way for them as everyone else. This is
// the one kind of org the app may create directly: firestore.rules require
// it to be personal and owned by its creator. It has no invite code until
// upgradePersonalOrganization turns it into a real one.
//
// Creating the org and linking the user go in one writeBatch, so a failure
// can't leave a personal org that nobody is linked to. The org's id is
// picked up front (doc() with no id — nothing is written yet) so the batch
// can use it in both writes. firestore.rules check the orgId link with
// getAfter, which sees the org this same batch creates.
export async function createPersonalOrganization() {
  const uid = auth.currentUser?.uid;
  const orgRef = doc(collection(db, 'organizations'));
  const batch = writeBatch(db);
  batch.set(orgRef, {
    name: null,
    type: null,
    province: null,
    city: null,
    email: auth.currentUser?.email ?? null,
    isPersonal: true,
    createdBy: uid,
    adminId: uid,
    createdAt: serverTimestamp(),
  });
  batch.set(doc(db, 'users', uid), { orgId: orgRef.id }, { merge: true });
  await batch.commit();
  return orgRef.id;
}

// Converts the current user's personal organization into a real, shareable
// one in place — same orgId, so anything already scoped to it (residents,
// musicLibrary entries) carries over automatically. Runs server-side so
// the invite code is issued in the same step; OrganizationSettingsScreen
// only offers it while the org is still personal.
export async function upgradePersonalOrganization({ name }) {
  const result = await callUpgradePersonalOrganization({ name });
  return result.data;
}
