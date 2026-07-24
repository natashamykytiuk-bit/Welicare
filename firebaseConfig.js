import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

const db = getFirestore(app);

export { app, auth, db };
