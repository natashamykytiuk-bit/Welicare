import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { loadSessionProfile, newLiveSession, saveActivitySession } from '../utils/activitySessions';

// Times a visit to a Resident Mode activity and saves it as ONE
// activitySessions document when the visit ends (see
// utils/activitySessions.js for what's stored and why so little).
//
// Used by components/games/GameShell.js, so every game gets it for free;
// other activities (Music, Trivia, …) can call it the same way with their
// own activityType / activityId.
//
// When a visit starts and ends:
// - Starts when the screen gains focus: on first mount if it's already the
//   focused screen, and again whenever it comes back into focus (e.g. the
//   caregiver pops back to it from a later screen).
// - Ends on the screen's `blur` event — React Navigation fires it for every
//   way of leaving: back, the PIN-gated home icon (a navigation reset), or
//   navigating onward. Unmounting also ends it, as a safety net for any exit
//   that tears the screen down without a blur.
// - Ends when the app goes to the background (AppState 'background': the
//   Home button, switching apps, the iPad sleeping). Only 'background', not
//   'inactive' — iOS reports 'inactive' for brief interruptions like pulling
//   down Control Center, which shouldn't split a visit. Coming back to the
//   foreground on this screen starts a new visit.
//
// Every end goes through endSession(), which marks the visit `ended` before
// saving, so the several signals that can fire together (blur + unmount,
// background + blur) still produce at most one document. Visits under
// MIN_SESSION_SECONDS are dropped as accidental taps.
//
// Returns { roundStarted(difficulty), roundCompleted() } for the activity
// to report rounds. Pass enabled: false to turn logging off entirely.
export default function useActivitySession({
  navigation,
  activityType,
  activityId,
  residentId = null,
  enabled = true,
}) {
  // The visit in progress (null between visits). A ref, not state: nothing
  // on screen depends on it, and the end handlers must see the latest value.
  const session = useRef(null);
  // The user's facility and role, fetched once per screen and reused, so a
  // visit ending offline doesn't need a fresh read.
  const profile = useRef(null);

  const startSession = useCallback(() => {
    if (!enabled) return;
    // Keep an unfinished visit going rather than restarting its clock (e.g.
    // a duplicate focus event).
    if (session.current && !session.current.ended) return;
    session.current = newLiveSession();
    if (!profile.current) profile.current = loadSessionProfile();
  }, [enabled]);

  const endSession = useCallback(() => {
    const current = session.current;
    if (!current || current.ended) return; // nothing running / already saved
    current.ended = true;
    session.current = null;
    // Not awaited: saving never blocks leaving the screen, and never throws.
    saveActivitySession({
      session: current,
      endedAt: Date.now(),
      activityType,
      activityId,
      residentId,
      profile: profile.current ?? loadSessionProfile(),
    });
  }, [activityType, activityId, residentId]);

  // Screen focus / blur. `navigation.addListener` is optional-chained so
  // screens rendered without a navigator (unit tests) still work; they just
  // start on mount and end on unmount.
  useEffect(() => {
    if (navigation?.isFocused?.() ?? true) startSession();
    const offFocus = navigation?.addListener?.('focus', startSession);
    const offBlur = navigation?.addListener?.('blur', endSession);
    return () => {
      offFocus?.();
      offBlur?.();
      endSession();
    };
  }, [navigation, startSession, endSession]);

  // App backgrounding. On return, resume only if this screen is the one
  // showing — a blurred screen underneath must not start timing.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') endSession();
      else if (state === 'active' && (navigation?.isFocused?.() ?? true)) startSession();
    });
    return () => sub.remove();
  }, [navigation, startSession, endSession]);

  const roundStarted = useCallback((difficulty) => {
    if (!session.current) return;
    session.current.roundsStarted += 1;
    session.current.difficulty = difficulty ?? null;
  }, []);

  const roundCompleted = useCallback(() => {
    if (!session.current) return;
    session.current.roundsCompleted += 1;
  }, []);

  return { roundStarted, roundCompleted };
}
