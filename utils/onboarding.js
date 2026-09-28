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
// Non-administrators may skip the organization step (orgStepSkipped);
// Administrators can't, since an admin without an organization has nothing
// to administer — and App.js ignores orgStepSkipped for them, so writing
// it to their own doc doesn't get them past this step either.
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
    data.role === 'Administrator' ? !data.orgId : !data.orgId && !data.orgStepSkipped;
  if (needsOrg) return 'JoinCreateOrganization';
  return 'ModeSelection';
}
