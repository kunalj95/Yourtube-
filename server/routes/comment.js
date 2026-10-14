import express from "express";

import {
  deletecomment,
  getallcomment,
  postcomment,
  editcomment,
} from "../controllers/comment.js";

import {
  reactToComment,
  getCommentReaction,
} from "../controllers/commentReaction.js";

import {
  translateComment,
} from "../controllers/translation.js";

import {
  getPreferredLanguage,
  updatePreferredLanguage,
} from "../controllers/languagePreference.js";

import {
  reportComment,
  getCommentReports,
  updateCommentReport,
} from "../controllers/commentReport.js";

import firebaseAuth from "../middleware/firebaseAuth.js";
import securitySessionAuth from "../middleware/securitySessionAuth.js";
import adminAuth from "../middleware/adminAuth.js";

const routes = express.Router();

// =====================================================
// GET PREFERRED LANGUAGE
// =====================================================

routes.get(
  "/preferred-language",
  firebaseAuth,
  securitySessionAuth,
  getPreferredLanguage
);

// =====================================================
// UPDATE PREFERRED LANGUAGE
// =====================================================

routes.patch(
  "/preferred-language",
  firebaseAuth,
  securitySessionAuth,
  updatePreferredLanguage
);

// =====================================================
// TRANSLATE COMMENT
// =====================================================

routes.post(
  "/translate",
  firebaseAuth,
  securitySessionAuth,
  translateComment
);

// =====================================================
// GET COMMENT REPORTS - ADMIN ONLY
// =====================================================

routes.get(
  "/reports",
  firebaseAuth,
  securitySessionAuth,
  adminAuth,
  getCommentReports
);

// =====================================================
// UPDATE COMMENT REPORT - ADMIN ONLY
// =====================================================

routes.patch(
  "/reports/:id",
  firebaseAuth,
  securitySessionAuth,
  adminAuth,
  updateCommentReport
);

// =====================================================
// GET ALL COMMENTS
// =====================================================

routes.get(
  "/:videoid",
  getallcomment
);

// =====================================================
// CREATE COMMENT
// =====================================================

routes.post(
  "/postcomment",
  firebaseAuth,
  securitySessionAuth,
  postcomment
);

// =====================================================
// DELETE COMMENT
// =====================================================

routes.delete(
  "/deletecomment/:id",
  firebaseAuth,
  securitySessionAuth,
  deletecomment
);

// =====================================================
// EDIT COMMENT
// =====================================================

routes.post(
  "/editcomment/:id",
  firebaseAuth,
  securitySessionAuth,
  editcomment
);

// =====================================================
// LIKE / DISLIKE / REMOVE REACTION
// =====================================================

routes.post(
  "/reaction/:id",
  firebaseAuth,
  securitySessionAuth,
  reactToComment
);

// =====================================================
// GET USER REACTION + COUNTS
// =====================================================

routes.get(
  "/reaction/:id",
  firebaseAuth,
  securitySessionAuth,
  getCommentReaction
);

// =====================================================
// REPORT COMMENT
// =====================================================

routes.post(
  "/report/:id",
  firebaseAuth,
  securitySessionAuth,
  reportComment
);

export default routes;