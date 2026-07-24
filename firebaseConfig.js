import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
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
const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

// The Firestore database where user profiles (users/{uid}) are stored.
const db = getFirestore(app);

export { app, auth, db };
