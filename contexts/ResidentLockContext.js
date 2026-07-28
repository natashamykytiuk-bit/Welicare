import { createContext, useCallback, useContext, useRef, useState } from 'react';
import LockPinModal from '../components/LockPinModal';

const ResidentLockContext = createContext(null);

// Session-only lock for Resident Mode: a caregiver can lock the screen so a
// resident using it unattended can't wander back out to the resident list
// or Mode Selection, while still freely using the activity tiles
// themselves. Deliberately plain component state (not Firestore) — it's
// meant to reset the moment a new resident/Guest Mode session starts, not
// persist across sessions or devices. Lives above the navigator (see
// App.js) so every activity screen — Music, Trivia, Meditation,
// Conversation, Photo Album, Games, Movies & Videos, and their sub-screens
// — can read/toggle the same lock via useResidentLock() despite being
// separate sibling routes rather than nested children of ActivityMenuScreen.
export function ResidentLockProvider({ children }) {
  const [locked, setLocked] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  // Holds whatever should happen once the PIN is verified — flipping the
  // lock (the lock icon itself) or a one-off "let me through" check (the
  // home/settings icons while locked, which don't change `locked` at all).
  const pendingActionRef = useRef(null);

  // Called by ActivityMenuScreen on mount so every fresh resident/Guest
  // Mode session starts unlocked, regardless of how the previous session
  // was left.
  const resetLock = useCallback(() => setLocked(false), []);

  const requestPin = useCallback((onSuccess) => {
    pendingActionRef.current = onSuccess;
    setModalVisible(true);
  }, []);

  const toggleLock = useCallback(() => {
    requestPin(() => setLocked((prev) => !prev));
  }, [requestPin]);

  const handleSuccess = useCallback(() => {
    setModalVisible(false);
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    action?.();
  }, []);

  const handleCancel = useCallback(() => {
    setModalVisible(false);
    pendingActionRef.current = null;
  }, []);

  return (
    <ResidentLockContext.Provider value={{ locked, toggleLock, requestPin, resetLock }}>
      {children}
      <LockPinModal visible={modalVisible} onSuccess={handleSuccess} onCancel={handleCancel} />
    </ResidentLockContext.Provider>
  );
}

export function useResidentLock() {
  const ctx = useContext(ResidentLockContext);
  if (!ctx) {
    throw new Error('useResidentLock must be used within a ResidentLockProvider');
  }
  return ctx;
}
