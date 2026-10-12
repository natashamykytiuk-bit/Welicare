// @ts-check
import { deleteField, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebaseConfig';

// Managing a resident as a whole, rather than editing their profile:
// archiving, permanent deletion, and moving an at-home resident into a care
// facility. Who is offered each is decided by utils/residentPermissions.js;
// who is actually allowed, by firestore.rules and the Cloud Functions.
//
// - Archive / restore is an ordinary write the rules allow (the same people
//   who may edit the profile). It only sets a flag: nothing is removed, and
//   it can be undone.
// - Delete and the move steps run in Cloud Functions (functions/index.js),
//   because the app can't do them under the rules: deleting has to remove
//   files and records the app can't reach, and moving changes who has
//   access. The functions' error messages are user-facing, and callers show
//   e.message.
/** @template Req, Res @typedef {import('firebase/functions').HttpsCallable<Req, Res>} Callable */
const callDeleteResident =
  /** @type {Callable<{ residentId: string }, { ok: boolean, sessionsKept: number }>} */ (
    httpsCallable(functions, 'deleteResident')
  );
const callRequestResidentMove =
  /** @type {Callable<{ residentId: string, code: string, confirmed: boolean }, { needsConfirmation: boolean, pending: boolean, orgName: string | null }>} */ (
    httpsCallable(functions, 'requestResidentMove')
  );
const callCancelResidentMove = /** @type {Callable<{ residentId: string }, { ok: boolean }>} */ (
  httpsCallable(functions, 'cancelResidentMove')
);
const callApproveResidentMove =
  /** @type {Callable<{ orgId: string, residentId: string }, { ok: boolean }>} */ (
    httpsCallable(functions, 'approveResidentMove')
  );
const callDenyResidentMove =
  /** @type {Callable<{ orgId: string, residentId: string }, { ok: boolean }>} */ (
    httpsCallable(functions, 'denyResidentMove')
  );

/**
 * Whether a resident doc is archived. Archived residents are left out of
 * Resident Mode and the everyday lists, and shown under "Archived" instead.
 * @param {{ archived?: boolean } | null | undefined} resident
 */
export function isArchived(resident) {
  return resident?.archived === true;
}

/**
 * Splits a list of residents into the ones in everyday use and the archived
 * ones, keeping each group's order.
 * @template {{ archived?: boolean }} T
 * @param {T[]} residents
 * @returns {{ active: T[], archived: T[] }}
 */
export function splitArchived(residents) {
  return {
    active: residents.filter((r) => !isArchived(r)),
    archived: residents.filter(isArchived),
  };
}

/**
 * Archives a resident (archived: true) or restores them. Restoring removes
 * the timestamp rather than leaving a stale one behind.
 * @param {string} residentId
 * @param {boolean} archived
 */
export async function setResidentArchived(residentId, archived) {
  await updateDoc(doc(db, 'residents', residentId), {
    archived,
    archivedAt: archived ? serverTimestamp() : deleteField(),
  });
}

/**
 * Permanently deletes a resident and everything held about them (life
 * story, safety notes, photos, family codes). Can't be undone — callers
 * must have shown the permanent-deletion warning first.
 * @param {string} residentId
 */
export async function deleteResident(residentId) {
  await callDeleteResident({ residentId });
}

/**
 * Step 1 of moving an at-home resident into an organization: checks the
 * code and returns the organization's name, writing nothing, so the screen
 * can show the "you'll lose edit access" warning with the real name in it.
 * @param {string} residentId
 * @param {string} code As typed; the server ignores case and dashes.
 * @returns {Promise<{ orgName: string | null }>}
 */
export async function previewResidentMove(residentId, code) {
  const result = await callRequestResidentMove({ residentId, code, confirmed: false });
  return { orgName: result.data.orgName };
}

/**
 * Step 2: sends the request, after the family member has confirmed. The
 * resident doesn't move yet — the organization's administrator approves it.
 * @param {string} residentId
 * @param {string} code
 * @returns {Promise<{ orgName: string | null }>}
 */
export async function requestResidentMove(residentId, code) {
  const result = await callRequestResidentMove({ residentId, code, confirmed: true });
  return { orgName: result.data.orgName };
}

/**
 * Withdraws a move request that hasn't been decided yet.
 * @param {string} residentId
 */
export async function cancelResidentMove(residentId) {
  await callCancelResidentMove({ residentId });
}

/**
 * Manage Users: the administrator accepts or declines a resident a family
 * member asked to move in.
 * @param {string} orgId
 * @param {string} residentId
 * @param {boolean} approve
 */
export async function decideResidentMove(orgId, residentId, approve) {
  await (approve ? callApproveResidentMove : callDenyResidentMove)({ orgId, residentId });
}
