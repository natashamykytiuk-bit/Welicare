// Firebase for the web portal: the same "welicare" project as the mobile
// app (these values aren't secret — firestore.rules enforce access). The
// app's firebaseConfig.js can't be shared because it imports React Native.
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: 'AIzaSyDwkxmWCgv7QMUEVj-1Br6gOOu_qfL_b6E',
  authDomain: 'welicare.firebaseapp.com',
  projectId: 'welicare',
  storageBucket: 'welicare.firebasestorage.app',
  messagingSenderId: '796680295722',
  appId: '1:796680295722:web:1b64ffc1ab2520a8617a53',
};

// Same switch as the app: VITE_USE_EMULATORS=1 npm run dev, with
// `npm run emulators` running at the repo root (project demo-welicare).
const USE_EMULATORS = import.meta.env.VITE_USE_EMULATORS === '1';

export const app = initializeApp(
  USE_EMULATORS ? { ...firebaseConfig, projectId: 'demo-welicare' } : firebaseConfig
);
// getAuth on web keeps the session in IndexedDB, so a reload stays signed in.
export const auth = getAuth(app);
export const db = getFirestore(app);
// Must match setGlobalOptions in functions/index.js, or calls go to us-central1.
export const functions = getFunctions(app, 'northamerica-northeast1');

if (USE_EMULATORS) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}
