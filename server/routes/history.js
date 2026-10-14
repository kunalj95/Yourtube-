import express from "express";

import {
  getallhistoryVideo,
  handlehistory,
  handleview,
} from "../controllers/history.js";

import firebaseAuth from "../middleware/firebaseAuth.js";
import securitySessionAuth from "../middleware/securitySessionAuth.js";

const routes =
  express.Router();

routes.get(
  "/:userId",
  firebaseAuth,
  securitySessionAuth,
  getallhistoryVideo
);

routes.post(
  "/views/:videoId",
  firebaseAuth,
  securitySessionAuth,
  handleview
);

routes.post(
  "/:videoId",
  firebaseAuth,
  securitySessionAuth,
  handlehistory
);

export default routes;