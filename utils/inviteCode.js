// @ts-check
import {
  collection,
  deleteField,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '../firebaseConfig';

// Organization membership and invite codes are server-controlled: creating
// a real organization, joining by code and issuing a new code all run in
// Cloud Functions (see functions/index.js).
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
const callJoinOrganization =
  /** @type {Callable<{ code: string }, { orgId: string, orgName: string | null, pending: boolean }>} */ (
    httpsCallable(functions, 'joinOrganization')
  );
const callRegenerateInviteCode =
  /** @type {Callable<{ orgId: string }, { inviteCode: string }>} */ (
    httpsCallable(functions, 'regenerateInviteCode')
  );

// Invite codes are 8 characters shown as two groups of four, e.g.
// "MGK7-4TXR" (minted by the server). This tidies what someone types so
// they never have to type the dash: it upper-cases, drops anything that
// isn't a letter or digit, keeps at most 8 characters, and adds the dash
// after the first four. Older organizations may still have a 6-character
// code like "MG-4821"; typed in, that shows as "MG48-21", which the server
// still recognises (it ignores dashes when matching). Shared by
// JoinOrganizationScreen (onboarding), MoveResidentScreen (a family member
// moving a resident into an organization) and the family-code box.
/**
 * @param {string} raw What the user has typed so far.
 * @returns {string} e.g. 'MGK', 'MGK7-4', 'MGK7-4TXR'
 */
export function formatOrgCode(raw) {
  const cleaned = raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
  return cleaned.length > 4 ? `${cleaned.slice(0, 4)}-${cleaned.slice(4)}` : cleaned;
}

// Creates a new organization owned by the current user, with a unique
// invite code, and links them to it. adminId mirrors createdBy: whoever
// creates an org is its administrator (and the function makes them one).
export async function createOrganization({ name, type, province, city }) {
  const result = await callCreateOrganization({ name, type, province, city });
  return result.data.orgId;
}

// Asks to join the organization with this invite code. It doesn't make the
// user a member straight away: the server records a join request that the
// organization's administrator approves in Manage Users (see
// joinOrganization in functions/index.js). Used by JoinOrganizationScreen
// (onboarding) for Caregivers, Volunteers and Administrators. The server
// refuses anyone already in a real (non-personal) org, so this can't be
// used to hop between facilities, refuses Family Caregivers (they connect
// one resident at a time — see utils/residentManagement.js and
// utils/familyLinks.js), and rate-limits attempts.
/**
 * @param {string} code
 * @returns {Promise<{ orgId: string, orgName: string | null }>}
 */
export async function joinOrganizationByCode(code) {
  const result = await callJoinOrganization({ code });
  return { orgId: result.data.orgId, orgName: result.data.orgName };
}

// Cancels this user's waiting join request (PendingApprovalScreen). The
// only change firestore.rules allow the app to make to pendingOrgId.
export async function cancelJoinRequest() {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  await updateDoc(doc(db, 'users', uid), {
    pendingOrgId: deleteField(),
    pendingSince: deleteField(),
  });
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
// it to be personal and owned by its creator. It never gets an invite
// code and never becomes a real organization: it stays one family's own.
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
    // Exactly these fields — firestore.rules refuse anything else on an
    // organization the app creates (and so no email or other contact
    // details).
    isPersonal: true,
    createdBy: uid,
    adminId: uid,
    createdAt: serverTimestamp(),
  });
  batch.set(doc(db, 'users', uid), { orgId: orgRef.id }, { merge: true });
  await batch.commit();
  return orgRef.id;
}
