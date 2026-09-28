// @ts-check
// Races a promise against a timeout so a hung Firestore call fails loudly
// with a catchable error instead of leaving the UI on an infinite spinner
// (which is exactly what happened before every Firestore call in the
// resident-creation flow was wrapped in try/catch).
//
// IMPORTANT: this does NOT cancel the underlying operation. When the timer
// wins, the Firestore call keeps going in the background and may still
// succeed moments later. That's harmless for READS (the result is simply
// ignored), but for WRITES a timeout only means "we don't know yet" — never
// treat it as "the write failed", or a retry can create a duplicate. Write
// flows should catch timeouts with isTimeoutError() and then check on the
// server whether the write landed (see AddResidentScreen's handleCreate).

/**
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {string} [message]
 * @returns {Promise<T>}
 */
export function withTimeout(
  promise,
  ms,
  message = 'This is taking longer than expected. Please check your connection and try again.'
) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => {
        const error = new Error(message);
        // Marks this as "ran out of time", as opposed to Firestore actually
        // rejecting the call — callers need to tell those apart.
        /** @type {any} */ (error).isTimeout = true;
        reject(error);
      }, ms)
    ),
  ]);
}

/**
 * True if `error` came from withTimeout's timer rather than from the
 * operation itself.
 * @param {unknown} error
 */
export function isTimeoutError(error) {
  return !!error && /** @type {any} */ (error).isTimeout === true;
}
