import express from "express";

import {
  getallwatchlater,
  handlewatchlater,
} from "../controllers/watchlater.js";

import firebaseAuth from "../middleware/firebaseAuth.js";
import securitySessionAuth from "../middleware/securitySessionAuth.js";

const routes =
  express.Router();

routes.get(
  "/:userId",
  firebaseAuth,
  securitySessionAuth,
  getallwatchlater
);

routes.post(
  "/:videoId",
  firebaseAuth,
  securitySessionAuth,
  handlewatchlater
);

export default routes;