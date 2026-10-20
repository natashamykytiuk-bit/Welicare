// Firebase for the web portal: the same "welicare" project as the mobile
// app (these values aren't secret — firestore.rules enforce access). The
// app's firebaseConfig.js can't be shared because it imports React Native.
import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
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

// App Check (reCAPTCHA Enterprise) proves calls come from this website, not
// a script reusing the public config above. Only started once a site key is
// set in web/.env (VITE_RECAPTCHA_SITE_KEY); the Contact form's function
// requires it only when CONTACT_APP_CHECK=on in functions/.env, so the key
// must ship here first. Skipped in the emulator, which doesn't check tokens.
const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined;
if (RECAPTCHA_SITE_KEY && !USE_EMULATORS) {
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
}

if (USE_EMULATORS) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}
