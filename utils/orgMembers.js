// @ts-check
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebaseConfig';

// The organization-owner callables (functions/organizations.js) used by
// ManageUsersScreen and OrganizationalSettingsScreen. They used to be created
// untyped inside each screen; here each one carries its request and
// response shape, so `npm run typecheck` flags a renamed field on either
// side. The functions' error messages are user-facing, and callers show
// e.message.

/** @template Req, Res @typedef {import('firebase/functions').HttpsCallable<Req, Res>} Callable */

/**
 * @typedef {object} OrgMember
 * @property {string} uid
 * @property {string} name
 * @property {string} role
 * @property {number} assignedResidents How many residents they're assigned to.
 */

/**
 * Someone who used the invite code and is waiting for approval.
 * @typedef {object} PendingMember
 * @property {string} uid
 * @property {string} name
 * @property {string} role
 * @property {number | null} requestedAt Epoch millis.
 */

/**
 * An at-home resident a family member asked to move into this organization.
 * @typedef {object} PendingMove
 * @property {string} residentId
 * @property {string} residentName
 * @property {string | null} requestedByUid
 * @property {string} requestedByName
 * @property {number | null} requestedAt Epoch millis.
 */

/**
 * @typedef {object} OrgMembersResponse
 * @property {OrgMember[]} members Everyone but the caller.
 * @property {PendingMember[]} pending Oldest request first.
 * @property {PendingMove[]} pendingMoves Oldest request first.
 */

/** @typedef {{ orgId: string, memberUid: string }} MemberRequest */

export const callListOrgMembers =
  /** @type {Callable<{ orgId: string }, OrgMembersResponse>} */ (
    httpsCallable(functions, 'listOrgMembers')
  );
export const callApproveOrgMember = /** @type {Callable<MemberRequest, { ok: true }>} */ (
  httpsCallable(functions, 'approveOrgMember')
);
export const callDenyOrgMember = /** @type {Callable<MemberRequest, { ok: true }>} */ (
  httpsCallable(functions, 'denyOrgMember')
);
export const callRemoveOrgMember =
  /** @type {Callable<MemberRequest, { ok: true, residentsUpdated: number }>} */ (
    httpsCallable(functions, 'removeOrgMember')
  );
export const callTransferOrgAdmin =
  /** @type {Callable<{ orgId: string, newAdminUid: string }, { ok: true }>} */ (
    httpsCallable(functions, 'transferOrgAdmin')
  );
export const callDeleteOrganization =
  /** @type {Callable<{ orgId: string }, { ok: true, residentsDeleted: number, membersRemoved: number }>} */ (
    httpsCallable(functions, 'deleteOrganization')
  );
