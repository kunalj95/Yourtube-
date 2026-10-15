import "dotenv/config";

import {
  initializeApp,
  cert,
  getApps,
} from "firebase-admin/app";

import { getAuth } from "firebase-admin/auth";

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;

if (!serviceAccountJson) {
  throw new Error(
    "FIREBASE_SERVICE_ACCOUNT is missing from environment variables"
  );
}

const serviceAccount = JSON.parse(serviceAccountJson);

const firebaseApp =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp({
        credential: cert(serviceAccount),
        projectId: "yourtube-c97f3",
      });

export const adminAuth = getAuth(firebaseApp);
