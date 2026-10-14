import express from "express";

import {
  requestDownload,
  downloadVideo,
  getDownloadHistory,
} from "../controllers/download.js";

import firebaseAuth from "../middleware/firebaseAuth.js";

const routes = express.Router();


// =====================================================
// REQUEST A VIDEO DOWNLOAD
// =====================================================
// Firebase authentication required
// =====================================================

routes.post(
  "/request",
  firebaseAuth,
  requestDownload
);


// =====================================================
// GET USER DOWNLOAD HISTORY
// =====================================================
// Firebase authentication required
// =====================================================

routes.get(
  "/history/:userId",
  firebaseAuth,
  getDownloadHistory
);


// =====================================================
// ACTUAL VIDEO DOWNLOAD
// =====================================================
// This route already uses the short-lived
// download token inside downloadVideo().
// =====================================================

routes.get(
  "/:downloadId",
  downloadVideo
);


export default routes;