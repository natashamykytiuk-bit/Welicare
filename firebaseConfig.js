import { initializeApp } from 'firebase/app';
import { getAuth, initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// These values identify the "welicare" Firebase project (not secret —
// they're safe to ship in a client app; access is enforced by the
// security rules in firestore.rules, not by hiding this config).
const firebaseConfig = {
  apiKey: "AIzaSyDwkxmWCgv7QMUEVj-1Br6gOOu_qfL_b6E",
  authDomain: "welicare.firebaseapp.com",
  projectId: "welicare",
  storageBucket: "welicare.firebasestorage.app",
  messagingSenderId: "796680295722",
  appId: "1:796680295722:web:1b64ffc1ab2520a8617a53",
  measurementId: "G-ZZ9NT731S0",
};

const app = initializeApp(firebaseConfig);

// getReactNativePersistence tells Firebase Auth to persist the signed-in
// session in AsyncStorage, so users stay logged in between app launches.
// It only exists in the React Native build of firebase/auth — the web
// build resolves to a different module that doesn't export it, so calling
// it there throws and crashes the whole app before anything can render.
// getAuth() on web already persists to localStorage by default.
const auth = Platform.OS === 'web'
  ? getAuth(app)
  : initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });

// The Firestore database where user profiles (users/{uid}) are stored.
const db = getFirestore(app);

// Cloud Functions — used to call the Anthropic API from a secure backend
// (generateSuggestions) instead of embedding the API key in the client.
const functions = getFunctions(app);

export { app, auth, db, functions };
