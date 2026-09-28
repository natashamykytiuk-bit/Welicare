// Single source of truth for "where should this signed-in user go next",
// decided from what's saved on their users/{uid} doc rather than anything
// in memory — so closing the app mid-onboarding, verifying email later,
// switching devices, or crashing all land them back on the right step.
//
// Used by App.js (initial route on sign-in / app start) and PINSetupScreen
// (the step after the PIN is saved), so the two can't drift apart.
//
//   no pinHash       → PINSetup
//   no orgId         → JoinCreateOrganization
//   otherwise        → ModeSelection
//
// Non-administrators may skip the organization step (orgStepSkipped);
// Administrators can't, since an admin without an organization has nothing
// to administer — and App.js ignores orgStepSkipped for them, so writing
// it to their own doc doesn't get them past this step either.
export function nextOnboardingRoute(userData) {
  const data = userData ?? {};
  if (!data.pinHash) return 'PINSetup';
  const needsOrg = data.role === 'Administrator' ? !data.orgId : !data.orgId && !data.orgStepSkipped;
  if (needsOrg) return 'JoinCreateOrganization';
  return 'ModeSelection';
}
