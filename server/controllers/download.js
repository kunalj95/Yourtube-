
import mongoose from "mongoose";
import path from "path";
import jwt from "jsonwebtoken";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import users from "../Modals/Auth.js";
import videos from "../Modals/video.js";
import downloads from "../Modals/Download.js";
import downloadQuotas from "../Modals/DownloadQuota.js";

import DOWNLOAD_LIMITS from "../config/downloadLimits.js";

// =====================================================
// PENDING DOWNLOAD TIMEOUT
// =====================================================

const PENDING_DOWNLOAD_TIMEOUT = 15 * 60 * 1000;

// =====================================================
// CUSTOM DOWNLOAD ERROR
// =====================================================

class DownloadLimitReachedError extends Error {
  constructor() {
    super("DOWNLOAD_LIMIT_REACHED");
    this.name = "DownloadLimitReachedError";
  }
}

// =====================================================
// GET START OF DAY
// =====================================================

const getStartOfDay = (date = new Date()) => {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  return startOfDay;
};

// =====================================================
// GET END OF DAY
// =====================================================

const getEndOfDay = (date = new Date()) => {
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  return endOfDay;
};

// =====================================================
// MARK DOWNLOAD FAILED AND RELEASE QUOTA
// =====================================================

const markDownloadFailedAndReleaseQuota = async (downloadId) => {
  if (!downloadId || !mongoose.Types.ObjectId.isValid(downloadId)) {
    return;
  }

  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const failedDownload = await downloads.findOneAndUpdate(
        {
          _id: downloadId,
          status: "pending",
          quotaReleased: { $ne: true },
        },
        {
          $set: {
            status: "failed",
            quotaReleased: true,
          },
        },
        {
          returnDocument: "after",
          session,
        }
      );

      if (!failedDownload) {
        return;
      }

      if (failedDownload.quotaDate) {
        await downloadQuotas.findOneAndUpdate(
          {
            userId: failedDownload.userId,
            quotaDate: failedDownload.quotaDate,
            used: { $gt: 0 },
          },
          {
            $inc: { used: -1 },
          },
          { session }
        );
      }
    });
  } catch (error) {
    console.error("Failed-download quota release error:", error);
  } finally {
    await session.endSession();
  }
};

// =====================================================
// MARK STALE PENDING DOWNLOADS AS FAILED
// =====================================================

const cleanupStalePendingDownloads = async (userId) => {
  try {
    const staleTime = new Date(Date.now() - PENDING_DOWNLOAD_TIMEOUT);

    const staleDownloads = await downloads.find({
      userId,
      status: "pending",
      downloadDate: { $lt: staleTime },
    });

    for (const download of staleDownloads) {
      await markDownloadFailedAndReleaseQuota(download._id);
    }
  } catch (error) {
    console.error("Pending download cleanup error:", error);
  }
};

// =====================================================
// CREATE DOWNLOAD + RESERVE QUOTA ATOMICALLY
// =====================================================

const createDownloadWithQuota = async ({
  userId,
  videoId,
  video,
  subscriptionPlan,
  downloadLimit,
  startOfDay,
  ipAddress,
  userAgent,
  browser,
}) => {
  const session = await mongoose.startSession();

  let downloadRecord = null;
  let downloadsUsed = 0;

  try {
    await session.withTransaction(async () => {
      let quota = await downloadQuotas
        .findOne({
          userId,
          quotaDate: startOfDay,
        })
        .session(session);

      if (!quota) {
        const existingDownloads = await downloads
          .countDocuments({
            userId,
            downloadDate: {
              $gte: startOfDay,
              $lte: getEndOfDay(),
            },
            status: {
              $in: ["pending", "completed"],
            },
          })
          .session(session);

        if (existingDownloads >= downloadLimit) {
          throw new DownloadLimitReachedError();
        }

        const createdQuota = await downloadQuotas.create(
          [
            {
              userId,
              quotaDate: startOfDay,
              used: existingDownloads + 1,
            },
          ],
          { session }
        );

        quota = createdQuota[0];
      } else {
        quota = await downloadQuotas.findOneAndUpdate(
          {
            _id: quota._id,
            used: { $lt: downloadLimit },
          },
          {
            $inc: { used: 1 },
          },
          {
            returnDocument: "after",
            session,
          }
        );

        if (!quota) {
          throw new DownloadLimitReachedError();
        }
      }

      downloadsUsed = quota.used;

      const createdRecords = await downloads.create(
        [
          {
            userId,
            videoId,
            downloadDate: new Date(),
            quotaDate: startOfDay,
            quotaReleased: false,
            status: "pending",
            fileSize: video.filesize,
            subscriptionPlan,
            ipAddress,
            deviceInfo: userAgent,
            browser,
          },
        ],
        { session }
      );

      downloadRecord = createdRecords[0];
    });

    return {
      downloadRecord,
      downloadsUsed,
    };
  } finally {
    await session.endSession();
  }
};

// =====================================================
// GET USED DOWNLOADS
// =====================================================

const getUsedDownloads = async (userId, startOfDay, endOfDay) => {
  return downloads.countDocuments({
    userId,
    downloadDate: {
      $gte: startOfDay,
      $lte: endOfDay,
    },
    status: {
      $in: ["pending", "completed"],
    },
  });
};

// =====================================================
// GET REMAINING DOWNLOADS
// =====================================================

const getRemainingDownloads = async (
  userId,
  subscriptionPlan,
  startOfDay,
  endOfDay
) => {
  const downloadLimit = DOWNLOAD_LIMITS[subscriptionPlan];

  const quota = await downloadQuotas.findOne({
    userId,
    quotaDate: startOfDay,
  });

  if (quota) {
    return Math.max(downloadLimit - quota.used, 0);
  }

  const downloadsUsed = await getUsedDownloads(
    userId,
    startOfDay,
    endOfDay
  );

  return Math.max(downloadLimit - downloadsUsed, 0);
};

// =====================================================
// REQUEST A VIDEO DOWNLOAD
// =====================================================

export const requestDownload = async (req, res) => {
  const { userId, videoId } = req.body;

  try {
    // 1. Get authenticated Firebase user
    const firebaseUser = req.firebaseUser;

    if (!firebaseUser) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    // 2. Get verified Firebase email
    const authenticatedEmail = firebaseUser.email;

    if (!authenticatedEmail) {
      return res.status(401).json({
        message: "Authenticated email not available",
      });
    }

    // 3. Validate user ID
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        message: "Invalid user ID",
      });
    }

    // 4. Validate video ID
    if (!videoId || !mongoose.Types.ObjectId.isValid(videoId)) {
      return res.status(400).json({
        message: "Invalid video ID",
      });
    }

    // 5. Find MongoDB user using Firebase email
    const authenticatedUser = await users.findOne({
      email: authenticatedEmail,
    });

    if (!authenticatedUser) {
      return res.status(404).json({
        message: "Authenticated user not found",
      });
    }

    // 6. Verify supplied user ID
    if (authenticatedUser._id.toString() !== userId.toString()) {
      return res.status(403).json({
        message: "You are not authorized to use this user ID",
      });
    }

    const user = authenticatedUser;

    // 7. Check video
    const video = await videos.findById(videoId);

    if (!video) {
      return res.status(404).json({
        message: "Video not found",
      });
    }

    // 8. Get subscription plan
    const subscriptionPlan = user.subscriptionPlan || "Free";

    if (!DOWNLOAD_LIMITS[subscriptionPlan]) {
      return res.status(400).json({
        message: "Invalid subscription plan",
      });
    }

    // 9. Check subscription expiry
    if (subscriptionPlan !== "Free") {
      if (
        !user.subscriptionExpiresAt ||
        new Date(user.subscriptionExpiresAt) <= new Date()
      ) {
        return res.status(403).json({
          message: "Your subscription has expired",
        });
      }
    }

    // 10. Check JWT secret
    if (!process.env.DOWNLOAD_TOKEN_SECRET) {
      return res.status(500).json({
        message: "Download token secret is not configured",
      });
    }

    // 11. Clean stale pending downloads
    await cleanupStalePendingDownloads(userId);

    // 12. Get today's date range
    const startOfDay = getStartOfDay();
    const endOfDay = getEndOfDay();

    // 13. Check duplicate download
    const duplicateDownload = await downloads.findOne({
      userId,
      videoId,
      downloadDate: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
      status: {
        $in: ["pending", "completed"],
      },
    });

    if (duplicateDownload) {
      return res.status(409).json({
        message: "You have already downloaded this video today",
        remainingDownloads: await getRemainingDownloads(
          userId,
          subscriptionPlan,
          startOfDay,
          endOfDay
        ),
      });
    }

    // 14. Get plan limit
    const downloadLimit = DOWNLOAD_LIMITS[subscriptionPlan];

    // 15. Collect request information
    const userAgent = req.headers["user-agent"] || "Unknown";

    const ipAddress =
      req.headers["x-forwarded-for"]?.split(",")[0] ||
      req.socket.remoteAddress ||
      "Unknown";

    let browser = "Unknown";

    if (userAgent.includes("Edg")) {
      browser = "Microsoft Edge";
    } else if (userAgent.includes("Chrome")) {
      browser = "Google Chrome";
    } else if (userAgent.includes("Firefox")) {
      browser = "Mozilla Firefox";
    } else if (userAgent.includes("Safari")) {
      browser = "Safari";
    }

    // 16. Reserve quota and create download
    const createDownload = () =>
      createDownloadWithQuota({
        userId,
        videoId,
        video,
        subscriptionPlan,
        downloadLimit,
        startOfDay,
        ipAddress,
        userAgent,
        browser,
      });

    let quotaResult;

    try {
      quotaResult = await createDownload();
    } catch (error) {
      if (error instanceof DownloadLimitReachedError) {
        const downloadsUsed = await getUsedDownloads(
          userId,
          startOfDay,
          endOfDay
        );

        return res.status(403).json({
          message: `Daily download limit reached for ${subscriptionPlan} plan`,
          downloadLimit,
          downloadsUsed,
          remainingDownloads: 0,
        });
      }

      if (error?.code !== 11000) {
        throw error;
      }

      const duplicate = await downloads.findOne({
        userId,
        videoId,
        downloadDate: {
          $gte: startOfDay,
          $lte: endOfDay,
        },
        status: {
          $in: ["pending", "completed"],
        },
      });

      if (duplicate) {
        return res.status(409).json({
          message: "You have already downloaded this video today",
          remainingDownloads: await getRemainingDownloads(
            userId,
            subscriptionPlan,
            startOfDay,
            endOfDay
          ),
        });
      }

      // Retry once if quota creation encounters a race
      try {
        quotaResult = await createDownload();
      } catch (retryError) {
        if (retryError instanceof DownloadLimitReachedError) {
          const downloadsUsed = await getUsedDownloads(
            userId,
            startOfDay,
            endOfDay
          );

          return res.status(403).json({
            message: `Daily download limit reached for ${subscriptionPlan} plan`,
            downloadLimit,
            downloadsUsed,
            remainingDownloads: 0,
          });
        }

        throw retryError;
      }
    }

    // 17. Get quota information
    const downloadsUsed = quotaResult.downloadsUsed;

    const remainingDownloads = Math.max(
      downloadLimit - downloadsUsed,
      0
    );

    const downloadRecord = quotaResult.downloadRecord;

    // 18. Create short-lived JWT
    const downloadToken = jwt.sign(
      {
        downloadId: downloadRecord._id.toString(),
        userId: user._id.toString(),
        type: "video-download",
      },
      process.env.DOWNLOAD_TOKEN_SECRET,
      {
        expiresIn: "5m",
      }
    );

    // 19. Return authorization result
    return res.status(200).json({
      message: "Download authorized",
      downloadId: downloadRecord._id,
      downloadToken,
      videoId: video._id,
      videotitle: video.videotitle,
      fileSize: video.filesize,
      subscriptionPlan,
      downloadLimit,
      downloadsUsed,
      remainingDownloads,
    });
  } catch (error) {
    console.error("Download request error:", error);

    return res.status(500).json({
      message: "Something went wrong while requesting download",
    });
  }
};

// =====================================================
// ACTUAL VIDEO DOWNLOAD — CLOUDINARY SUPPORT
// =====================================================

export const downloadVideo = async (req, res) => {
  const { downloadId } = req.params;

  let upstreamResponse = null;
  let transferStarted = false;
  let transferCompleted = false;

  try {
    // 1. Validate download ID
    if (!downloadId || !mongoose.Types.ObjectId.isValid(downloadId)) {
      return res.status(400).json({
        message: "Invalid download ID",
      });
    }

    // 2. Get download token
    const downloadToken = req.query.token;

    if (!downloadToken) {
      return res.status(401).json({
        message: "Download authorization token is required",
      });
    }

    // 3. Check token secret
    if (!process.env.DOWNLOAD_TOKEN_SECRET) {
      return res.status(500).json({
        message: "Download token secret is not configured",
      });
    }

    // 4. Verify token
    let decodedToken;

    try {
      decodedToken = jwt.verify(
        downloadToken,
        process.env.DOWNLOAD_TOKEN_SECRET
      );
    } catch (tokenError) {
      console.error("Download token verification failed:", tokenError);

      return res.status(401).json({
        message: "Download authorization token is invalid or expired",
      });
    }

    // 5. Validate decoded token
    if (
      !decodedToken ||
      typeof decodedToken !== "object" ||
      decodedToken.type !== "video-download"
    ) {
      return res.status(403).json({
        message: "Invalid download authorization",
      });
    }

    // 6. Check token download ID
    if (decodedToken.downloadId !== downloadId) {
      return res.status(403).json({
        message: "Download authorization does not match this download",
      });
    }

    // 7. Find download record
    const downloadRecord = await downloads.findById(downloadId);

    if (!downloadRecord) {
      return res.status(404).json({
        message: "Download record not found",
      });
    }

    // 8. Verify token user
    if (decodedToken.userId !== downloadRecord.userId.toString()) {
      return res.status(403).json({
        message: "You are not authorized to access this download",
      });
    }

    // 9. Find user
    const user = await users.findById(downloadRecord.userId);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // 10. Get and validate current subscription plan
    const subscriptionPlan = user.subscriptionPlan || "Free";

    if (!DOWNLOAD_LIMITS[subscriptionPlan]) {
      return res.status(400).json({
        message: "Invalid subscription plan",
      });
    }

    // 11. Check subscription expiry
    if (subscriptionPlan !== "Free") {
      if (
        !user.subscriptionExpiresAt ||
        new Date(user.subscriptionExpiresAt) <= new Date()
      ) {
        return res.status(403).json({
          message: "Your subscription has expired",
        });
      }
    }

    // 12. Verify authorized plan
    if (downloadRecord.subscriptionPlan !== subscriptionPlan) {
      return res.status(403).json({
        message: "Download authorization is no longer valid",
      });
    }

    // 13. Only pending downloads can be processed
    if (downloadRecord.status !== "pending") {
      return res.status(400).json({
        message: `Download is already ${downloadRecord.status}`,
      });
    }

    // 14. Find video
    const video = await videos.findById(downloadRecord.videoId);

    if (!video) {
      await markDownloadFailedAndReleaseQuota(downloadId);

      return res.status(404).json({
        message: "Video not found",
      });
    }

    // 15. Check filepath
    if (!video.filepath) {
      await markDownloadFailedAndReleaseQuota(downloadId);

      return res.status(404).json({
        message: "Video file path not found",
      });
    }

    // 16. Validate Cloudinary URL
    let videoUrl;

    try {
      videoUrl = new URL(video.filepath);
    } catch {
      await markDownloadFailedAndReleaseQuota(downloadId);

      return res.status(400).json({
        message: "The stored video URL is invalid",
      });
    }

    if (
      videoUrl.protocol !== "https:" ||
      videoUrl.hostname !== "res.cloudinary.com" ||
      videoUrl.username ||
      videoUrl.password
    ) {
      await markDownloadFailedAndReleaseQuota(downloadId);

      return res.status(400).json({
        message: "The stored video URL is not a valid Cloudinary URL",
      });
    }

    // 17. Build a safe filename
    const requestedFilename =
      video.filename || `${video.videotitle || "video"}.mp4`;

    let downloadFileName = path
      .basename(requestedFilename)
      .replace(/[\r\n"]/g, "_")
      .replace(/[\\/]/g, "_");

    if (!downloadFileName.toLowerCase().endsWith(".mp4")) {
      downloadFileName += ".mp4";
    }

    // 18. Fetch the video from Cloudinary
    // This works locally and in a deployed Node.js backend.
    // Never treat an HTTPS URL as a local filesystem path.
    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 120000);

    try {
      upstreamResponse = await fetch(videoUrl, {
        method: "GET",
        redirect: "error",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!upstreamResponse.ok || !upstreamResponse.body) {
      const upstreamStatus = upstreamResponse.status;

      console.error(
        `Cloudinary download failed: HTTP ${upstreamStatus}`
      );

      await markDownloadFailedAndReleaseQuota(downloadId);

      return res.status(502).json({
        message: "Cloudinary could not provide the video file",
        upstreamStatus,
      });
    }

    // 19. Set download response headers
    res.status(200);

    const upstreamContentType =
      upstreamResponse.headers.get("content-type");

    res.setHeader(
      "Content-Type",
      upstreamContentType?.startsWith("video/")
        ? upstreamContentType
        : "video/mp4"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${downloadFileName}"`
    );

    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");

    const contentLength =
      upstreamResponse.headers.get("content-length");

    if (contentLength) {
      res.setHeader("Content-Length", contentLength);
    }

    // 20. Stream Cloudinary video to the client
    transferStarted = true;

    await pipeline(
      Readable.fromWeb(upstreamResponse.body),
      res
    );

    transferCompleted = true;

    console.log(`Download stream completed: ${downloadId}`);
  } catch (error) {
    console.error("Video download error:", error);

    if (upstreamResponse?.body && !upstreamResponse.body.locked) {
      try {
        await upstreamResponse.body.cancel();
      } catch {
        // The stream may already be closed.
      }
    }

    if (!transferCompleted) {
      await markDownloadFailedAndReleaseQuota(downloadId);
    }

    // Once streaming begins, don't try to send a second response.
    if (transferStarted || res.headersSent) {
      if (!res.destroyed && !res.writableEnded) {
        res.destroy(error);
      }

      return;
    }

    if (res.writableEnded || res.destroyed) {
      return;
    }

    return res.status(502).json({
      message: "Unable to retrieve or stream the video from Cloudinary",
    });
  }

  // =====================================================
  // MARK DOWNLOAD COMPLETED
  // Keep database errors separate from the finished response.
  // =====================================================

  try {
    const completedDownload = await downloads.findOneAndUpdate(
      {
        _id: downloadId,
        status: "pending",
      },
      {
        $set: {
          status: "completed",
        },
      },
      {
        returnDocument: "after",
      }
    );

    if (!completedDownload) {
      console.error(
        `Download stream finished, but status was not updated: ${downloadId}`
      );
    } else {
      console.log(`Download completed: ${downloadId}`);
    }
  } catch (error) {
    console.error(
      `Video transferred, but completion status update failed for ${downloadId}:`,
      error
    );
  }
};

// =====================================================
// GET USER DOWNLOAD HISTORY
// =====================================================

export const getDownloadHistory = async (req, res) => {
  const { userId } = req.params;

  try {
    // 1. Get authenticated Firebase user
    const firebaseUser = req.firebaseUser;

    if (!firebaseUser) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    // 2. Get verified Firebase email
    const authenticatedEmail = firebaseUser.email;

    if (!authenticatedEmail) {
      return res.status(401).json({
        message: "Authenticated email not available",
      });
    }

    // 3. Validate user ID
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        message: "Invalid user ID",
      });
    }

    // 4. Find MongoDB user using verified email
    const authenticatedUser = await users.findOne({
      email: authenticatedEmail,
    });

    if (!authenticatedUser) {
      return res.status(404).json({
        message: "Authenticated user not found",
      });
    }

    // 5. Verify requested user ID
    if (authenticatedUser._id.toString() !== userId.toString()) {
      return res.status(403).json({
        message: "You are not authorized to view this download history",
      });
    }

    const user = authenticatedUser;

    // 6. Clean stale pending downloads
    await cleanupStalePendingDownloads(userId);

    // 7. Get download history
    const downloadHistory = await downloads
      .find({ userId })
      .populate(
        "videoId",
        "videotitle filename filepath filesize"
      )
      .sort({ downloadDate: -1 });

    // 8. Get current subscription plan
    const subscriptionPlan = user.subscriptionPlan || "Free";

    const downloadLimit = DOWNLOAD_LIMITS[subscriptionPlan] || 1;

    // 9. Get today's date range
    const now = new Date();

    const startOfDay = getStartOfDay(now);
    const endOfDay = getEndOfDay(now);

    // 10. Get today's usage
    const downloadsUsed = await getUsedDownloads(
      userId,
      startOfDay,
      endOfDay
    );

    // 11. Calculate remaining downloads
    const remainingDownloads = await getRemainingDownloads(
      userId,
      subscriptionPlan,
      startOfDay,
      endOfDay
    );

    // 12. Return download history
    return res.status(200).json({
      subscriptionPlan,
      downloadLimit,
      downloadsUsed,
      remainingDownloads,
      downloads: downloadHistory,
    });
  } catch (error) {
    console.error("Download history error:", error);

    return res.status(500).json({
      message: "Something went wrong while getting download history",
    });
  }
};
