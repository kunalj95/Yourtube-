// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth , GoogleAuthProvider } from "firebase/auth";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCtVnPv5Ab8ucjbm2Z16il36ONdpOr2cCQ",
  authDomain: "yourtube-c97f3.firebaseapp.com",
  projectId: "yourtube-c97f3",
  storageBucket: "yourtube-c97f3.firebasestorage.app",
  messagingSenderId: "1048547880714",
  appId: "1:1048547880714:web:2099604316e79e0cea14f3"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app)
const provider = new GoogleAuthProvider()
export {auth,provider}