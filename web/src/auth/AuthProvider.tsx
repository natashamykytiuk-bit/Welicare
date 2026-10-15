// Tracks the signed-in user and their users/{uid} record (role, orgId…).
// Unverified emails are signed out: every resident/org rule requires a
// verified email, so the portal would show nothing but errors.
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { COLLECTIONS } from '@shared/constants';
import { auth, db } from '../firebase';
import type { Profile } from './routing';

type AuthState = { loading: boolean; user: User | null; profile: Profile | null; error?: string };
const AuthContext = createContext<AuthState>({ loading: true, user: null, profile: null });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ loading: true, user: null, profile: null });

  useEffect(
    () =>
      onAuthStateChanged(auth, async (user) => {
        // Keep any message (e.g. "verify your email") across the sign-out below.
        if (!user) return setState((s) => ({ loading: false, user: null, profile: null, error: s.error }));
        if (!user.emailVerified) {
          setState({
            loading: false,
            user: null,
            profile: null,
            error: 'Please verify your email address using the link we sent you, then sign in again.',
          });
          return signOut(auth);
        }
        try {
          const snap = await getDoc(doc(db, COLLECTIONS.USERS, user.uid));
          setState({ loading: false, user, profile: (snap.data() as Profile) ?? null });
        } catch {
          setState({ loading: false, user, profile: null, error: 'We couldn’t load your account. Please try again.' });
        }
      }),
    []
  );

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
