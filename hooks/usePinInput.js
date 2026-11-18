import { useCallback, useState } from 'react';

// Length of every PIN in the app (see isValidPin in utils/pin.js).
export const PIN_LENGTH = 4;

/**
 * The digits after tapping `digit` on the number pad, or null if the tap
 * should be ignored (pad disabled, or the PIN is already full). Kept pure so
 * the typing rules can be unit-tested without rendering a screen.
 */
export function appendPinDigit(digits, digit, disabled) {
  if (disabled || digits.length >= PIN_LENGTH) return null;
  return digits + digit;
}

// The number-pad typing shared by PINEntryScreen, PINSetupScreen and
// LockPinModal: holds the digits typed so far, ignores taps while
// `disabled` or once the PIN is full, and hands the finished PIN to
// `onComplete` as soon as the last digit lands. What happens next
// (checking a hash, confirming a new PIN) stays with each caller — they
// call clear() to empty the dots for another try.
//
// `disabled` is the caller's own "not now" condition, e.g. the saved PIN
// hasn't loaded yet, a check is in progress, or too many wrong attempts.
export default function usePinInput({ onComplete, disabled = false }) {
  const [digits, setDigits] = useState('');

  function handleDigit(digit) {
    const next = appendPinDigit(digits, digit, disabled);
    if (next === null) return;
    setDigits(next);
    if (next.length === PIN_LENGTH) onComplete(next);
  }

  function handleBackspace() {
    setDigits((d) => d.slice(0, -1));
  }

  // Stable identity so callers can use it inside effects (e.g. LockPinModal
  // resetting on every open) without re-running them each render.
  const clear = useCallback(() => setDigits(''), []);

  return { digits, handleDigit, handleBackspace, clear };
}
