// Import the functions you need from the SDKs you need
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAmuZmD3D1_Xiw7IsJEonqURRULfMjz06U",
  authDomain: "friend4-a9d09.firebaseapp.com",
  projectId: "friend4-a9d09",
  storageBucket: "friend4-a9d09.firebasestorage.app",
  messagingSenderId: "170391705717",
  appId: "1:170391705717:web:821b1348f1405b9657403c"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
const auth = getAuth(app);

// Initialize Cloud Firestore and get a reference to the service
const db = getFirestore(app);

const storage = getStorage(app);

export { auth, db, storage };