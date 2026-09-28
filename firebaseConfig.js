import { initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  initializeAuth,
  getReactNativePersistence,
} from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// These values identify the "welicare" Firebase project (not secret —
// they're safe to ship in a client app; access is enforced by the
// security rules in firestore.rules, not by hiding this config).
const firebaseConfig = {
  apiKey: 'AIzaSyDwkxmWCgv7QMUEVj-1Br6gOOu_qfL_b6E',
  authDomain: 'welicare.firebaseapp.com',
  projectId: 'welicare',
  storageBucket: 'welicare.firebasestorage.app',
  messagingSenderId: '796680295722',
  appId: '1:796680295722:web:1b64ffc1ab2520a8617a53',
  measurementId: 'G-ZZ9NT731S0',
};

// Local development against the Firebase emulators instead of the live
// project. Off unless explicitly turned on, by starting Expo with
//   EXPO_PUBLIC_USE_EMULATORS=1 npx expo start
// (PowerShell: $env:EXPO_PUBLIC_USE_EMULATORS=1; npx expo start) while
// `npm run emulators` is running. Expo inlines EXPO_PUBLIC_* variables when
// it bundles the app, so this can't be switched on from a phone.
//
// EXPO_PUBLIC_EMULATOR_HOST is where the emulators are reachable from the
// device: 127.0.0.1 works for web and the iOS simulator, the Android
// emulator needs 10.0.2.2, and a real phone needs this computer's LAN
// address.
const USE_EMULATORS = process.env.EXPO_PUBLIC_USE_EMULATORS === '1';
const EMULATOR_HOST = process.env.EXPO_PUBLIC_EMULATOR_HOST || '127.0.0.1';

// The emulators run as the "demo-welicare" project (see package.json); a
// demo- project id also guarantees nothing can reach live services.
const app = initializeApp(
  USE_EMULATORS ? { ...firebaseConfig, projectId: 'demo-welicare' } : firebaseConfig
);

// getReactNativePersistence tells Firebase Auth to persist the signed-in
// session in AsyncStorage, so users stay logged in between app launches.
// It only exists in the React Native build of firebase/auth — the web
// build resolves to a different module that doesn't export it, so calling
// it there throws and crashes the whole app before anything can render.
// getAuth() on web already persists to localStorage by default.
const auth =
  Platform.OS === 'web'
    ? getAuth(app)
    : initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });

// The Firestore database where user profiles (users/{uid}) are stored.
const db = getFirestore(app);

// Cloud Functions — used to call the Anthropic API from a secure backend
// (generateSuggestions) instead of embedding the API key in the client.
// They run in Montréal (setGlobalOptions in functions/index.js); the region
// must match here, or calls go to the default us-central1 and fail.
const FUNCTIONS_REGION = 'northamerica-northeast1';
const functions = getFunctions(app, FUNCTIONS_REGION);

// Ports match the "emulators" section of firebase.json. Each is connected
// once, right after the service is created and before anything uses it.
if (USE_EMULATORS) {
  connectAuthEmulator(auth, `http://${EMULATOR_HOST}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, EMULATOR_HOST, 8080);
  connectFunctionsEmulator(functions, EMULATOR_HOST, 5001);
  console.log('[firebaseConfig] using local emulators at', EMULATOR_HOST);
}

export { app, auth, db, functions };
