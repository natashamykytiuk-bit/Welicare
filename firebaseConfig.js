import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyDFJEzTXQs9vRMzrN1aJ6tHlcUm2EihSAs",
  authDomain: "dementia-rec-therapy-app.firebaseapp.com",
  projectId: "dementia-rec-therapy-app",
  storageBucket: "dementia-rec-therapy-app.firebasestorage.app",
  messagingSenderId: "418416603846",
  appId: "1:418416603846:web:ae86a1a686018586635dc7",
};

const app = initializeApp(firebaseConfig);

const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

const db = getFirestore(app);

export { app, auth, db };
