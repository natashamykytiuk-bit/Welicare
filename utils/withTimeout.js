// Races a promise against a timeout so a hung Firestore call fails loudly
// with a catchable error instead of leaving the UI on an infinite spinner
// (which is exactly what happened before every Firestore call in the
// resident-creation flow was wrapped in try/catch).
export function withTimeout(
  promise,
  ms,
  message = 'This is taking longer than expected. Please check your connection and try again.'
) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}
