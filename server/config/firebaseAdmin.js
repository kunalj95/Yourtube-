import "dotenv/config";

import {
  initializeApp,
  applicationDefault,
  getApps,
} from "firebase-admin/app";

import { getAuth } from "firebase-admin/auth";

const firebaseApp =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp({
        credential: applicationDefault(),
      });

export const adminAuth = getAuth(firebaseApp);