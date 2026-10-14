import express from "express";

import {
  getallvideo,
  uploadvideo,
} from "../controllers/video.js";

import upload from "../filehelper/filehelper.js";
import firebaseAuth from "../middleware/firebaseAuth.js";
import securitySessionAuth from "../middleware/securitySessionAuth.js";

const routes =
  express.Router();

// -----------------------------------------
// Upload video - protected
// -----------------------------------------

routes.post(
  "/upload",
  firebaseAuth,
  securitySessionAuth,
  upload.single("file"),
  uploadvideo
);

// -----------------------------------------
// Get videos - public
// -----------------------------------------

routes.get(
  "/getall",
  getallvideo
);

export default routes;