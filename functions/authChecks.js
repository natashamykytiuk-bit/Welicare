// Checks every callable function runs on its caller before doing anything,
// shared by index.js (organizations and accounts), ai.js and youtube.js.
const { HttpsError } = require('firebase-functions/v2/https');

// Refuses callers whose email address hasn't been verified yet (the
// email_verified claim in their ID token, set by Firebase Auth). The app
// already signs unverified users out, but that's only the interface — this
// is what stops an unverified account calling these functions directly,
// including the paid ones (AI suggestions, YouTube search). deleteAccount
// deliberately doesn't use it, so someone who never verified can still
// remove their account.
function requireVerified(request) {
  if (request.auth?.token?.email_verified !== true) {
    throw new HttpsError('permission-denied', 'Please verify your email address first.', {
      reason: 'email-not-verified',
    });
  }
}

// How recently someone must have entered their password for a destructive
// action (delete account, delete organization, transfer administrator).
const RECENT_LOGIN_SECONDS = 5 * 60;

// Refuses unless the caller actually signed in (typed their password) in
// the last RECENT_LOGIN_SECONDS. auth_time is set by Firebase Auth inside
// the signed ID token — it's the time of the last real sign-in or
// re-authentication, not of the last token refresh, and the app can't
// change it. So a device that's merely still signed in can't skip the
// password step by calling these functions directly; the app's password
// prompts (reauthenticateWithCredential) are what refresh it.
// The error code "failed-precondition" + details.reason lets the app tell
// this apart and ask for the password again.
function requireRecentLogin(request) {
  const authTime = request.auth?.token?.auth_time;
  const ageSeconds = Math.floor(Date.now() / 1000) - (authTime ?? 0);
  if (!authTime || ageSeconds > RECENT_LOGIN_SECONDS) {
    throw new HttpsError(
      'failed-precondition',
      'For your security, please enter your password again and retry.',
      { reason: 'requires-recent-login' }
    );
  }
}

module.exports = { requireVerified, requireRecentLogin };
