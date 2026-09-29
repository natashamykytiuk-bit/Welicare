// @ts-check
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebaseConfig';

// Family codes: how a Family Caregiver is linked to a facility resident.
// Staff create a single-use code on the resident's profile
// (FamilyAccessCard); the family member enters it on Family Mode → My
// Residents. All four steps run in Cloud Functions (functions/index.js),
// because the codes live in a server-only collection and the resident's
// familyMembers list can't be written from the app. The functions' error
// messages are user-facing, and callers show e.message.
/** @template Req, Res @typedef {import('firebase/functions').HttpsCallable<Req, Res>} Callable */
const callCreateFamilyCode =
  /** @type {Callable<{ residentId: string }, { code: string, expiresAt: number }>} */ (
    httpsCallable(functions, 'createFamilyCode')
  );
const callRedeemFamilyCode =
  /** @type {Callable<{ code: string }, { residentId: string, residentName: string | null }>} */ (
    httpsCallable(functions, 'redeemFamilyCode')
  );
const callListFamilyMembers =
  /** @type {Callable<{ residentId: string }, { members: { uid: string, name: string }[] }>} */ (
    httpsCallable(functions, 'listFamilyMembers')
  );
const callUnlinkFamilyMember =
  /** @type {Callable<{ residentId: string, memberUid: string }, { ok: boolean }>} */ (
    httpsCallable(functions, 'unlinkFamilyMember')
  );

/**
 * A new single-use code for this resident (any unused older one stops
 * working). Caregivers/Administrators of the resident's facility only.
 * @param {string} residentId
 */
export async function createFamilyCode(residentId) {
  const result = await callCreateFamilyCode({ residentId });
  return result.data;
}

/**
 * Links the signed-in Family Caregiver to the code's resident.
 * @param {string} code As typed; the server ignores case and dashes.
 */
export async function redeemFamilyCode(code) {
  const result = await callRedeemFamilyCode({ code });
  return result.data;
}

/** @param {string} residentId */
export async function listFamilyMembers(residentId) {
  const result = await callListFamilyMembers({ residentId });
  return result.data.members;
}

/**
 * @param {string} residentId
 * @param {string} memberUid
 */
export async function unlinkFamilyMember(residentId, memberUid) {
  await callUnlinkFamilyMember({ residentId, memberUid });
}
