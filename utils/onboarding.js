// @ts-check
// Single source of truth for "where should this signed-in user go next",
// decided from what's saved on their users/{uid} doc rather than anything
// in memory — so closing the app mid-onboarding, verifying email later,
// switching devices, or crashing all land them back on the right step.
//
// Used by App.js (initial route on sign-in / app start) and PINSetupScreen
// (the step after the PIN is saved), so the two can't drift apart.
//
//   no profile doc   → FinishSignUp (sign-up stopped after the Auth account
//                      was created — see SignUpScreen's finish-setup mode)
//   no pinHash       → PINSetup
//   no orgId         → JoinCreateOrganization
//   otherwise        → ModeSelection
//
// Only Family Caregivers may skip the organization step (orgStepSkipped):
// they look after a relative at home and needn't belong to a facility.
// Administrators, Caregivers and Volunteers all work *for* a facility, so
// without one the app has nothing for them — orgStepSkipped is ignored for
// those roles, which also sends anyone who skipped under the old rules back
// to this step on their next sign-in.
/**
 * @param {Partial<import('../types/models').User> | null | undefined} userData
 *   The signed-in user's users/{uid} doc (undefined if it doesn't exist yet).
 * @returns {'FinishSignUp' | 'PINSetup' | 'JoinCreateOrganization' | 'ModeSelection'}
 */
export function nextOnboardingRoute(userData) {
  // No profile at all: without one there's no role, and firestore.rules
  // won't let PIN setup create a profile without a role — so the person
  // would be stuck. Send them to finish signing up instead.
  if (!userData) return 'FinishSignUp';
  const data = userData;
  if (!data.pinHash) return 'PINSetup';
  const needsOrg =
    data.role === 'Family Caregiver' ? !data.orgId && !data.orgStepSkipped : !data.orgId;
  if (needsOrg) return 'JoinCreateOrganization';
  return 'ModeSelection';
}
