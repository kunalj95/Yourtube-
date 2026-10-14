import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import path from "path";
import { createServer } from "http";
import { Server } from "socket.io";

import userroutes from "./routes/auth.js";
import videoroutes from "./routes/video.js";
import likeroutes from "./routes/like.js";
import watchlaterroutes from "./routes/watchlater.js";
import historyrroutes from "./routes/history.js";
import commentroutes from "./routes/comment.js";
import downloadroutes from "./routes/download.js";
import subscriptionroutes from "./routes/subscription.js";

import { setupMeetingSocket } from "./socket/meetingsocket.js";

import {
  handleRazorpayWebhook,
  cleanupAbandonedSubscriptionOrders,
} from "./controllers/subscription.js";

dotenv.config();

const app = express();

// -----------------------------------------
// CORS
// -----------------------------------------

app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);


// =====================================================
// RAZORPAY WEBHOOK
// IMPORTANT:
// This must come BEFORE express.json()
// =====================================================

app.post(
  "/subscription/webhook",
  express.raw({
    type: "application/json",
  }),
  handleRazorpayWebhook
);


// -----------------------------------------
// JSON BODY
// -----------------------------------------

app.use(
  express.json({
    limit: "30mb",
    extended: true,
  })
);


// -----------------------------------------
// URL ENCODED BODY
// -----------------------------------------

app.use(
  express.urlencoded({
    limit: "30mb",
    extended: true,
  })
);


// -----------------------------------------
// STATIC UPLOADS
// -----------------------------------------

app.use(
  "/uploads",
  express.static(
    path.join("uploads")
  )
);


// -----------------------------------------
// ROOT ROUTE
// -----------------------------------------

app.get("/", (req, res) => {
  res.send(
    "You tube backend is working"
  );
});


// -----------------------------------------
// BODY PARSER
// -----------------------------------------

app.use(
  bodyParser.json()
);


// =====================================================
// APPLICATION ROUTES
// =====================================================

app.use(
  "/user",
  userroutes
);

app.use(
  "/video",
  videoroutes
);

app.use(
  "/like",
  likeroutes
);

app.use(
  "/watch",
  watchlaterroutes
);

app.use(
  "/history",
  historyrroutes
);

app.use(
  "/comment",
  commentroutes
);

app.use(
  "/download",
  downloadroutes
);

app.use(
  "/subscription",
  subscriptionroutes
);


// -----------------------------------------
// PORT
// -----------------------------------------

const PORT =
  process.env.PORT || 5000;


// =====================================================
// CREATE HTTP SERVER
// =====================================================

const server =
  createServer(app);


// =====================================================
// SOCKET.IO
// =====================================================

const io = new Server(
  server,
  {
    cors: {
      origin: "http://localhost:3000",
      methods: [
        "GET",
        "POST",
      ],
      credentials: true,
    },
  }
);


// -----------------------------------------
// SETUP MEETING SOCKET
// -----------------------------------------

setupMeetingSocket(io);


// -----------------------------------------
// START SERVER
// -----------------------------------------

server.listen(
  PORT,
  () => {
    console.log(
      `server running on port ${PORT}`
    );
  }
);


// =====================================================
// MONGODB CONNECTION
// =====================================================

const DBURL =
  process.env.DB_URL;

mongoose
  .connect(DBURL)
  .then(async () => {
    console.log(
      "Mongodb connected"
    );

    // =====================================================
    // ABANDONED SUBSCRIPTION ORDER CLEANUP
    // =====================================================

    // Run once when MongoDB is connected.
    try {
      await cleanupAbandonedSubscriptionOrders();

      console.log(
        "Initial abandoned subscription cleanup completed."
      );
    } catch (error) {
      console.error(
        "Initial abandoned subscription cleanup failed:",
        error
      );
    }

    // -----------------------------------------------------
    // Run cleanup every 5 minutes.
    // Orders older than 15 minutes that are still
    // incomplete will be marked as cancelled.
    // -----------------------------------------------------

    const CLEANUP_INTERVAL =
      5 * 60 * 1000;

    setInterval(
      async () => {
        try {
          await cleanupAbandonedSubscriptionOrders();
        } catch (error) {
          console.error(
            "Scheduled abandoned subscription cleanup failed:",
            error
          );
        }
      },
      CLEANUP_INTERVAL
    );

    console.log(
      "Abandoned subscription order cleanup scheduled every 5 minutes."
    );
  })
  .catch((error) => {
    console.log(error);
  });