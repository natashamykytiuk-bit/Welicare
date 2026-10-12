// @ts-check
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';

// Loads what the permission helpers in utils/residentPermissions.js need to
// know about the signed-in person: their uid, role and organization id (from
// their own users doc), and their organization doc — read only to tell a
// family organization (isPersonal) from a care facility.
//
// One shared loader so every screen that hides or shows resident controls
// asks the same question the same way. Throws if either read fails; callers
// treat that as "no permissions yet" and show no edit controls, which is the
// safe default (firestore.rules refuse the write regardless).
/**
 * @returns {Promise<{
 *   viewer: import('./residentPermissions').Viewer,
 *   org: import('./residentPermissions').ViewerOrg,
 * }>}
 */
export async function loadViewer() {
  const uid = auth.currentUser?.uid ?? null;
  if (!uid) return { viewer: { uid: null, role: null, orgId: null }, org: null };
  const user = (await getDoc(doc(db, 'users', uid))).data() ?? {};
  const orgId = user.orgId ?? null;
  const org = orgId ? ((await getDoc(doc(db, 'organizations', orgId))).data() ?? null) : null;
  return { viewer: { uid, role: user.role ?? null, orgId }, org };
}
