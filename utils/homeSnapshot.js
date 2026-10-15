// @ts-check
// A small on-device copy of what the post-login hub (ModeSelectionScreen)
// shows, so a cold start can draw it straight away with no network request,
// then refresh in the background.
//
// What goes in is deliberately limited to the hub's own header and card
// choice — onboarding route, role, name, facility name, orgId, avatar
// version, allModes. Never resident data or the org invite code: those are
// always read fresh, so losing access to them takes effect immediately.
// A stale role or route only shows the wrong cards for a moment; every
// mode is still behind the PIN and enforced by firestore.rules.
//
// Keyed by uid, and wiped on every sign-out (App.js), so one person's
// snapshot is never shown to someone else signing in on the same tablet.
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'homeSnapshot:';

// The snapshot App.js loaded at startup, kept in memory so
// ModeSelectionScreen can read it synchronously for its first frame.
/** @type {Record<string, any> | null} */
let current = null;

/** Reads this user's snapshot from disk (null if none or unreadable). */
export async function loadHomeSnapshot(uid) {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + uid);
    const snap = raw ? JSON.parse(raw) : null;
    // The uid check guards against a key written under the wrong user.
    current = snap?.uid === uid ? snap : null;
  } catch (e) {
    // A cache miss just means a normal (network) startup.
    console.error('[homeSnapshot] failed to load:', e);
    current = null;
  }
  return current;
}

/** The snapshot already in memory for this user, without touching disk. */
export function peekHomeSnapshot(uid) {
  return current?.uid === uid ? current : null;
}

/** Merges fresh fields into this user's snapshot and writes it to disk. */
export async function saveHomeSnapshot(uid, fields) {
  current = { ...peekHomeSnapshot(uid), ...fields, uid };
  try {
    await AsyncStorage.setItem(PREFIX + uid, JSON.stringify(current));
  } catch (e) {
    console.error('[homeSnapshot] failed to save:', e);
  }
}

/** Removes every user's snapshot — called on sign-out. */
export async function clearHomeSnapshots() {
  current = null;
  try {
    const keys = await AsyncStorage.getAllKeys();
    await AsyncStorage.multiRemove(keys.filter((k) => k.startsWith(PREFIX)));
  } catch (e) {
    console.error('[homeSnapshot] failed to clear:', e);
  }
}
