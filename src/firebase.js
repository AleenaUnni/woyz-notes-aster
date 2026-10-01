import { initializeApp } from 'firebase/app';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import {
  getFirestore,
  addDoc,
  collection,
  collectionGroup,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { firebaseConfig } from './firebase-config.js';

export const MASTER_ADMIN_UID = 'kzlnh5rBzpTlYEqF7Ou35F1YWaa2';
export const MASTER_ADMIN_EMAIL = 'drgigy@gmail.com';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const authPersistenceReady = setPersistence(auth, browserLocalPersistence).catch(error => {
  console.warn('Unable to enable persistent login:', error);
});
export const db = getFirestore(app);

export {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  collection,
  collectionGroup,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  addDoc
};
