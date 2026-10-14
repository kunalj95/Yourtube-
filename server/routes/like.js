import express from "express";

import {
  handlelike,
  getallLikedVideo,
} from "../controllers/like.js";

import firebaseAuth from "../middleware/firebaseAuth.js";
import securitySessionAuth from "../middleware/securitySessionAuth.js";

const routes =
  express.Router();

routes.get(
  "/:userId",
  firebaseAuth,
  securitySessionAuth,
  getallLikedVideo
);

routes.post(
  "/:videoId",
  firebaseAuth,
  securitySessionAuth,
  handlelike
);

export default routes;