import mongoose from "mongoose";
import path from "path";
import jwt from "jsonwebtoken";

import users from "../Modals/Auth.js";
import videos from "../Modals/video.js";
import downloads from "../Modals/Download.js";
import downloadQuotas from "../Modals/DownloadQuota.js";

import DOWNLOAD_LIMITS from "../config/downloadLimits.js";


// =====================================================
// PENDING DOWNLOAD TIMEOUT
// =====================================================

const PENDING_DOWNLOAD_TIMEOUT =
  15 * 60 * 1000;


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

const getStartOfDay = (
  date = new Date()
) => {
  const startOfDay =
    new Date(date);

  startOfDay.setHours(
    0,
    0,
    0,
    0
  );

  return startOfDay;
};


// =====================================================
// GET END OF DAY
// =====================================================

const getEndOfDay = (
  date = new Date()
) => {
  const endOfDay =
    new Date(date);

  endOfDay.setHours(
    23,
    59,
    59,
    999
  );

  return endOfDay;
};


// =====================================================
// MARK STALE PENDING DOWNLOADS AS FAILED
// =====================================================

const cleanupStalePendingDownloads =
  async (userId) => {
    try {
      const staleTime =
        new Date(
          Date.now() -
            PENDING_DOWNLOAD_TIMEOUT
        );

      const staleDownloads =
        await downloads.find({
          userId,
          status: "pending",
          downloadDate: {
            $lt: staleTime,
          },
        });

      for (
        const download of staleDownloads
      ) {
        await markDownloadFailedAndReleaseQuota(
          download._id
        );
      }
    } catch (error) {
      console.error(
        "Pending download cleanup error:",
        error
      );
    }
  };


// =====================================================
// MARK DOWNLOAD FAILED AND RELEASE QUOTA
// =====================================================

const markDownloadFailedAndReleaseQuota =
  async (downloadId) => {
    const session =
      await mongoose.startSession();

    try {
      await session.withTransaction(
        async () => {

          // -----------------------------------------
          // Only change a still-pending download
          // -----------------------------------------

          const failedDownload =
            await downloads.findOneAndUpdate(
              {
                _id: downloadId,

                status: "pending",

                quotaReleased: {
                  $ne: true,
                },
              },
              {
                $set: {
                  status: "failed",

                  quotaReleased: true,
                },
              },
              {
                new: true,

                session,
              }
            );

          // -----------------------------------------
          // Already processed
          // -----------------------------------------

          if (!failedDownload) {
            return;
          }

          // -----------------------------------------
          // Release quota
          // -----------------------------------------

          if (
            failedDownload.quotaDate
          ) {
            await downloadQuotas.findOneAndUpdate(
              {
                userId:
                  failedDownload.userId,

                quotaDate:
                  failedDownload.quotaDate,

                used: {
                  $gt: 0,
                },
              },
              {
                $inc: {
                  used: -1,
                },
              },
              {
                session,
              }
            );
          }
        }
      );
    } catch (error) {
      console.error(
        "Failed-download quota release error:",
        error
      );
    } finally {
      await session.endSession();
    }
  };


// =====================================================
// CREATE DOWNLOAD + RESERVE QUOTA ATOMICALLY
// =====================================================

const createDownloadWithQuota =
  async ({
    user,
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

    const session =
      await mongoose.startSession();

    let downloadRecord = null;

    let downloadsUsed = 0;

    try {
      await session.withTransaction(
        async () => {

          // -----------------------------------------
          // 1. Find today's quota document
          // -----------------------------------------

          let quota =
            await downloadQuotas
              .findOne({
                userId,

                quotaDate:
                  startOfDay,
              })
              .session(session);

          // -----------------------------------------
          // 2. Create today's quota document
          //    if it doesn't exist
          // -----------------------------------------

          if (!quota) {

            // Count existing downloads created
            // before quota tracking was introduced.
            const existingDownloads =
              await downloads.countDocuments({
                userId,

                downloadDate: {
                  $gte: startOfDay,

                  $lte: getEndOfDay(),
                },

                status: {
                  $in: [
                    "pending",
                    "completed",
                  ],
                },
              }).session(session);

            // -------------------------------------
            // Already at limit
            // -------------------------------------

            if (
              existingDownloads >=
              downloadLimit
            ) {
              throw new DownloadLimitReachedError();
            }

            // -------------------------------------
            // Create today's quota document
            // -------------------------------------

            const createdQuota =
              await downloadQuotas.create(
                [
                  {
                    userId,

                    quotaDate:
                      startOfDay,

                    used:
                      existingDownloads + 1,
                  },
                ],
                {
                  session,
                }
              );

            quota =
              createdQuota[0];

          } else {

            // ---------------------------------------
            // 3. Atomically reserve one slot
            // ---------------------------------------

            quota =
              await downloadQuotas.findOneAndUpdate(
                {
                  _id: quota._id,

                  used: {
                    $lt:
                      downloadLimit,
                  },
                },
                {
                  $inc: {
                    used: 1,
                  },
                },
                {
                  new: true,

                  session,
                }
              );

            // ---------------------------------------
            // No quota available
            // ---------------------------------------

            if (!quota) {
              throw new DownloadLimitReachedError();
            }
          }

          downloadsUsed =
            quota.used;

          // -----------------------------------------
          // 4. Create pending download record
          // -----------------------------------------

          const createdRecords =
            await downloads.create(
              [
                {
                  userId,

                  videoId,

                  downloadDate:
                    new Date(),

                  quotaDate:
                    startOfDay,

                  quotaReleased:
                    false,

                  status:
                    "pending",

                  fileSize:
                    video.filesize,

                  subscriptionPlan,

                  ipAddress,

                  deviceInfo:
                    userAgent,

                  browser,
                },
              ],
              {
                session,
              }
            );

          downloadRecord =
            createdRecords[0];
        }
      );

      return {
        downloadRecord,

        downloadsUsed,
      };

    } finally {
      await session.endSession();
    }
  };


// =====================================================
// REQUEST A VIDEO DOWNLOAD
// =====================================================

export const requestDownload =
  async (req, res) => {

    const {
      userId,
      videoId,
    } = req.body;

    try {

      // -----------------------------------------
      // 1. Get authenticated Firebase user
      // -----------------------------------------

      const firebaseUser =
        req.firebaseUser;

      if (!firebaseUser) {
        return res.status(401).json({
          message:
            "Authentication required",
        });
      }

      // -----------------------------------------
      // 2. Get verified Firebase email
      // -----------------------------------------

      const authenticatedEmail =
        firebaseUser.email;

      if (!authenticatedEmail) {
        return res.status(401).json({
          message:
            "Authenticated email not available",
        });
      }

      // -----------------------------------------
      // 3. Validate userId
      // -----------------------------------------

      if (
        !userId ||
        !mongoose.Types.ObjectId.isValid(
          userId
        )
      ) {
        return res.status(400).json({
          message:
            "Invalid user ID",
        });
      }

      // -----------------------------------------
      // 4. Validate videoId
      // -----------------------------------------

      if (
        !videoId ||
        !mongoose.Types.ObjectId.isValid(
          videoId
        )
      ) {
        return res.status(400).json({
          message:
            "Invalid video ID",
        });
      }

      // -----------------------------------------
      // 5. Find MongoDB user using Firebase email
      // -----------------------------------------

      const authenticatedUser =
        await users.findOne({
          email:
            authenticatedEmail,
        });

      if (!authenticatedUser) {
        return res.status(404).json({
          message:
            "Authenticated user not found",
        });
      }

      // -----------------------------------------
      // 6. Verify supplied userId
      // -----------------------------------------

      if (
        authenticatedUser._id.toString() !==
        userId.toString()
      ) {
        return res.status(403).json({
          message:
            "You are not authorized to use this user ID",
        });
      }

      // -----------------------------------------
      // 7. Use authenticated MongoDB user
      // -----------------------------------------

      const user =
        authenticatedUser;

      // -----------------------------------------
      // 8. Check video
      // -----------------------------------------

      const video =
        await videos.findById(
          videoId
        );

      if (!video) {
        return res.status(404).json({
          message:
            "Video not found",
        });
      }

      // -----------------------------------------
      // 9. Get subscription plan
      // -----------------------------------------

      const subscriptionPlan =
        user.subscriptionPlan ||
        "Free";

      // -----------------------------------------
      // 10. Validate subscription plan
      // -----------------------------------------

      if (
        !DOWNLOAD_LIMITS[
          subscriptionPlan
        ]
      ) {
        return res.status(400).json({
          message:
            "Invalid subscription plan",
        });
      }

      // -----------------------------------------
      // 11. Check subscription expiry
      // -----------------------------------------

      if (
        subscriptionPlan !==
        "Free"
      ) {
        if (
          !user.subscriptionExpiresAt ||
          new Date(
            user.subscriptionExpiresAt
          ) <= new Date()
        ) {
          return res.status(403).json({
            message:
              "Your subscription has expired",
          });
        }
      }

      // -----------------------------------------
      // 12. Check JWT secret
      // -----------------------------------------

      if (
        !process.env.DOWNLOAD_TOKEN_SECRET
      ) {
        return res.status(500).json({
          message:
            "Download token secret is not configured",
        });
      }

      // -----------------------------------------
      // 13. Clean stale pending downloads
      // -----------------------------------------

      await cleanupStalePendingDownloads(
        userId
      );

      // -----------------------------------------
      // 14. Get today's date range
      // -----------------------------------------

      const startOfDay =
        getStartOfDay();

      const endOfDay =
        getEndOfDay();

      // -----------------------------------------
      // 15. Check duplicate download
      // -----------------------------------------

      const duplicateDownload =
        await downloads.findOne({
          userId,

          videoId,

          downloadDate: {
            $gte:
              startOfDay,

            $lte:
              endOfDay,
          },

          status: {
            $in: [
              "pending",
              "completed",
            ],
          },
        });

      if (duplicateDownload) {
        return res.status(409).json({
          message:
            "You have already downloaded this video today",

          remainingDownloads:
            await getRemainingDownloads(
              userId,
              subscriptionPlan,
              startOfDay,
              endOfDay
            ),
        });
      }

      // -----------------------------------------
      // 16. Get plan limit
      // -----------------------------------------

      const downloadLimit =
        DOWNLOAD_LIMITS[
          subscriptionPlan
        ];

      // -----------------------------------------
      // 17. Collect request information
      // -----------------------------------------

      const userAgent =
        req.headers["user-agent"] ||
        "Unknown";

      const ipAddress =
        req.headers["x-forwarded-for"]
          ?.split(",")[0] ||
        req.socket.remoteAddress ||
        "Unknown";

      let browser =
        "Unknown";

      if (
        userAgent.includes("Edg")
      ) {
        browser =
          "Microsoft Edge";

      } else if (
        userAgent.includes("Chrome")
      ) {
        browser =
          "Google Chrome";

      } else if (
        userAgent.includes("Firefox")
      ) {
        browser =
          "Mozilla Firefox";

      } else if (
        userAgent.includes("Safari")
      ) {
        browser =
          "Safari";
      }

      // -----------------------------------------
      // 18. Reserve quota + create download
      // -----------------------------------------

      let quotaResult;

      try {

        quotaResult =
          await createDownloadWithQuota({
            user,

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

      } catch (error) {

        // ---------------------------------------
        // Daily limit reached
        // ---------------------------------------

        if (
          error instanceof
          DownloadLimitReachedError
        ) {

          const downloadsUsed =
            await getUsedDownloads(
              userId,
              startOfDay,
              endOfDay
            );

          return res.status(403).json({
            message:
              `Daily download limit reached for ${subscriptionPlan} plan`,

            downloadLimit,

            downloadsUsed,

            remainingDownloads:
              0,
          });
        }

        // ---------------------------------------
        // Duplicate race condition
        // ---------------------------------------

        if (
          error?.code === 11000
        ) {

          const duplicate =
            await downloads.findOne({
              userId,

              videoId,

              downloadDate: {
                $gte:
                  startOfDay,

                $lte:
                  endOfDay,
              },

              status: {
                $in: [
                  "pending",
                  "completed",
                ],
              },
            });

          if (duplicate) {
            return res.status(409).json({
              message:
                "You have already downloaded this video today",

              remainingDownloads:
                await getRemainingDownloads(
                  userId,
                  subscriptionPlan,
                  startOfDay,
                  endOfDay
                ),
            });
          }

          // -------------------------------------
          // Retry once when quota document race
          // happens during creation.
          // -------------------------------------

          try {

            quotaResult =
              await createDownloadWithQuota({
                user,

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

          } catch (retryError) {

            if (
              retryError instanceof
              DownloadLimitReachedError
            ) {

              const downloadsUsed =
                await getUsedDownloads(
                  userId,
                  startOfDay,
                  endOfDay
                );

              return res.status(403).json({
                message:
                  `Daily download limit reached for ${subscriptionPlan} plan`,

                downloadLimit,

                downloadsUsed,

                remainingDownloads:
                  0,
              });
            }

            throw retryError;
          }

        } else {
          throw error;
        }
      }

      // -----------------------------------------
      // 19. Get quota information
      // -----------------------------------------

      const downloadsUsed =
        quotaResult.downloadsUsed;

      const remainingDownloads =
        Math.max(
          downloadLimit -
            downloadsUsed,
          0
        );

      const downloadRecord =
        quotaResult.downloadRecord;

      // -----------------------------------------
      // 20. Create short-lived JWT
      // -----------------------------------------

      const downloadToken =
        jwt.sign(
          {
            downloadId:
              downloadRecord._id.toString(),

            userId:
              user._id.toString(),

            type:
              "video-download",
          },

          process.env.DOWNLOAD_TOKEN_SECRET,

          {
            expiresIn:
              "5m",
          }
        );

      // -----------------------------------------
      // 21. Return authorization result
      // -----------------------------------------

      return res.status(200).json({
        message:
          "Download authorized",

        downloadId:
          downloadRecord._id,

        downloadToken,

        videoId:
          video._id,

        videotitle:
          video.videotitle,

        fileSize:
          video.filesize,

        subscriptionPlan,

        downloadLimit,

        downloadsUsed,

        remainingDownloads,
      });

    } catch (error) {

      console.error(
        "Download request error:",
        error
      );

      return res.status(500).json({
        message:
          "Something went wrong while requesting download",
      });
    }
  };


// =====================================================
// ACTUAL VIDEO DOWNLOAD
// =====================================================

export const downloadVideo =
  async (req, res) => {

    const {
      downloadId,
    } = req.params;

    try {

      // -----------------------------------------
      // 1. Validate downloadId
      // -----------------------------------------

      if (
        !downloadId ||
        !mongoose.Types.ObjectId.isValid(
          downloadId
        )
      ) {
        return res.status(400).json({
          message:
            "Invalid download ID",
        });
      }

      // -----------------------------------------
      // 2. Get download token
      // -----------------------------------------

      const downloadToken =
        req.query.token;

      if (!downloadToken) {
        return res.status(401).json({
          message:
            "Download authorization token is required",
        });
      }

      // -----------------------------------------
      // 3. Check token secret
      // -----------------------------------------

      if (
        !process.env.DOWNLOAD_TOKEN_SECRET
      ) {
        return res.status(500).json({
          message:
            "Download token secret is not configured",
        });
      }

      // -----------------------------------------
      // 4. Verify token
      // -----------------------------------------

      let decodedToken;

      try {

        decodedToken =
          jwt.verify(
            downloadToken,
            process.env.DOWNLOAD_TOKEN_SECRET
          );

      } catch (tokenError) {

        console.error(
          "Download token verification failed:",
          tokenError
        );

        return res.status(401).json({
          message:
            "Download authorization token is invalid or expired",
        });
      }

      // -----------------------------------------
      // 5. Validate decoded token
      // -----------------------------------------

      if (
        !decodedToken ||
        typeof decodedToken !==
          "object"
      ) {
        return res.status(401).json({
          message:
            "Invalid download authorization token",
        });
      }

      // -----------------------------------------
      // 6. Check token type
      // -----------------------------------------

      if (
        decodedToken.type !==
        "video-download"
      ) {
        return res.status(403).json({
          message:
            "Invalid download authorization",
        });
      }

      // -----------------------------------------
      // 7. Check token download ID
      // -----------------------------------------

      if (
        decodedToken.downloadId !==
        downloadId
      ) {
        return res.status(403).json({
          message:
            "Download authorization does not match this download",
        });
      }

      // -----------------------------------------
      // 8. Find download record
      // -----------------------------------------

      const downloadRecord =
        await downloads.findById(
          downloadId
        );

      if (!downloadRecord) {
        return res.status(404).json({
          message:
            "Download record not found",
        });
      }

      // -----------------------------------------
      // 9. Verify token user
      // -----------------------------------------

      if (
        decodedToken.userId !==
        downloadRecord.userId.toString()
      ) {
        return res.status(403).json({
          message:
            "You are not authorized to access this download",
        });
      }

      // -----------------------------------------
      // 10. Find user
      // -----------------------------------------

      const user =
        await users.findById(
          downloadRecord.userId
        );

      if (!user) {
        return res.status(404).json({
          message:
            "User not found",
        });
      }

      // -----------------------------------------
      // 11. Get current subscription plan
      // -----------------------------------------

      const subscriptionPlan =
        user.subscriptionPlan ||
        "Free";

      // -----------------------------------------
      // 12. Validate subscription plan
      // -----------------------------------------

      if (
        !DOWNLOAD_LIMITS[
          subscriptionPlan
        ]
      ) {
        return res.status(400).json({
          message:
            "Invalid subscription plan",
        });
      }

      // -----------------------------------------
      // 13. Check subscription expiry
      // -----------------------------------------

      if (
        subscriptionPlan !==
        "Free"
      ) {
        if (
          !user.subscriptionExpiresAt ||
          new Date(
            user.subscriptionExpiresAt
          ) <= new Date()
        ) {
          return res.status(403).json({
            message:
              "Your subscription has expired",
          });
        }
      }

      // -----------------------------------------
      // 14. Check authorization plan
      // -----------------------------------------

      if (
        downloadRecord.subscriptionPlan !==
        subscriptionPlan
      ) {
        return res.status(403).json({
          message:
            "Download authorization is no longer valid",
        });
      }

      // -----------------------------------------
      // 15. Only pending downloads
      //     can be processed
      // -----------------------------------------

      if (
        downloadRecord.status !==
        "pending"
      ) {
        return res.status(400).json({
          message:
            `Download is already ${downloadRecord.status}`,
        });
      }

      // -----------------------------------------
      // 16. Get video
      // -----------------------------------------

      const video =
        await videos.findById(
          downloadRecord.videoId
        );

      if (!video) {

        await markDownloadFailedAndReleaseQuota(
          downloadId
        );

        return res.status(404).json({
          message:
            "Video not found",
        });
      }

      // -----------------------------------------
      // 17. Check filepath
      // -----------------------------------------

      if (!video.filepath) {

        await markDownloadFailedAndReleaseQuota(
          downloadId
        );

        return res.status(404).json({
          message:
            "Video file path not found",
        });
      }

      // -----------------------------------------
      // 18. Build filepath
      // -----------------------------------------

      const filePath =
        path.resolve(
          video.filepath
        );

      console.log(
        "Download file path:",
        filePath
      );

      // -----------------------------------------
      // 19. Download filename
      // -----------------------------------------

      const downloadFileName =
        video.filename ||
        `${video.videotitle}.mp4`;

      // -----------------------------------------
      // 20. Handle interrupted connection
      // -----------------------------------------

      res.on(
        "close",
        async () => {

          if (
            !res.writableFinished
          ) {

            await markDownloadFailedAndReleaseQuota(
              downloadId
            );

            console.log(
              `Download interrupted: ${downloadId}`
            );
          }
        }
      );

      // -----------------------------------------
      // 21. Send video file
      // -----------------------------------------

      res.download(
        filePath,

        downloadFileName,

        async (error) => {

          // -------------------------------------
          // Download failed
          // -------------------------------------

          if (error) {

            console.error(
              "Download failed:",
              error
            );

            await markDownloadFailedAndReleaseQuota(
              downloadId
            );

            return;
          }

          // -------------------------------------
          // Download completed
          // -------------------------------------

          try {

            await downloads.findOneAndUpdate(
              {
                _id:
                  downloadId,

                status:
                  "pending",
              },
              {
                $set: {
                  status:
                    "completed",
                },
              }
            );

            console.log(
              `Download completed: ${downloadId}`
            );

          } catch (updateError) {

            console.error(
              "Could not update completed download:",
              updateError
            );
          }
        }
      );

    } catch (error) {

      console.error(
        "Video download error:",
        error
      );

      await markDownloadFailedAndReleaseQuota(
        downloadId
      );

      return res.status(500).json({
        message:
          "Something went wrong while downloading the video",
      });
    }
  };


// =====================================================
// GET USED DOWNLOADS
// =====================================================

const getUsedDownloads =
  async (
    userId,
    startOfDay,
    endOfDay
  ) => {

    const downloadsUsed =
      await downloads.countDocuments({
        userId,

        downloadDate: {
          $gte:
            startOfDay,

          $lte:
            endOfDay,
        },

        status: {
          $in: [
            "pending",
            "completed",
          ],
        },
      });

    return downloadsUsed;
  };


// =====================================================
// GET REMAINING DOWNLOADS
// =====================================================

const getRemainingDownloads =
  async (
    userId,
    subscriptionPlan,
    startOfDay,
    endOfDay
  ) => {

    const downloadLimit =
      DOWNLOAD_LIMITS[
        subscriptionPlan
      ];

    // -----------------------------------------
    // Use atomic quota document if available
    // -----------------------------------------

    const quota =
      await downloadQuotas.findOne({
        userId,

        quotaDate:
          startOfDay,
      });

    if (quota) {

      return Math.max(
        downloadLimit -
          quota.used,

        0
      );
    }

    // -----------------------------------------
    // Fallback for old download records
    // -----------------------------------------

    const downloadsUsed =
      await getUsedDownloads(
        userId,
        startOfDay,
        endOfDay
      );

    return Math.max(
      downloadLimit -
        downloadsUsed,

      0
    );
  };


// =====================================================
// GET USER DOWNLOAD HISTORY
// =====================================================

export const getDownloadHistory =
  async (req, res) => {

    const {
      userId,
    } = req.params;

    try {

      // -----------------------------------------
      // 1. Get authenticated Firebase user
      // -----------------------------------------

      const firebaseUser =
        req.firebaseUser;

      if (!firebaseUser) {
        return res.status(401).json({
          message:
            "Authentication required",
        });
      }

      // -----------------------------------------
      // 2. Get verified Firebase email
      // -----------------------------------------

      const authenticatedEmail =
        firebaseUser.email;

      if (!authenticatedEmail) {
        return res.status(401).json({
          message:
            "Authenticated email not available",
        });
      }

      // -----------------------------------------
      // 3. Validate userId
      // -----------------------------------------

      if (
        !userId ||
        !mongoose.Types.ObjectId.isValid(
          userId
        )
      ) {
        return res.status(400).json({
          message:
            "Invalid user ID",
        });
      }

      // -----------------------------------------
      // 4. Find MongoDB user using verified email
      // -----------------------------------------

      const authenticatedUser =
        await users.findOne({
          email:
            authenticatedEmail,
        });

      if (!authenticatedUser) {
        return res.status(404).json({
          message:
            "Authenticated user not found",
        });
      }

      // -----------------------------------------
      // 5. Verify that requested userId
      //    belongs to authenticated user
      // -----------------------------------------

      if (
        authenticatedUser._id.toString() !==
        userId.toString()
      ) {
        return res.status(403).json({
          message:
            "You are not authorized to view this download history",
        });
      }

      // -----------------------------------------
      // 6. Use authenticated MongoDB user
      // -----------------------------------------

      const user =
        authenticatedUser;

      // -----------------------------------------
      // 7. Clean stale pending downloads
      // -----------------------------------------

      await cleanupStalePendingDownloads(
        userId
      );

      // -----------------------------------------
      // 8. Get download history
      // -----------------------------------------

      const downloadHistory =
        await downloads
          .find({
            userId,
          })
          .populate(
            "videoId",
            "videotitle filename filepath filesize"
          )
          .sort({
            downloadDate:
              -1,
          });

      // -----------------------------------------
      // 9. Get current subscription plan
      // -----------------------------------------

      const subscriptionPlan =
        user.subscriptionPlan ||
        "Free";

      const downloadLimit =
        DOWNLOAD_LIMITS[
          subscriptionPlan
        ] || 1;

      // -----------------------------------------
      // 10. Get today's date range
      // -----------------------------------------

      const now =
        new Date();

      const startOfDay =
        getStartOfDay(
          now
        );

      const endOfDay =
        getEndOfDay(
          now
        );

      // -----------------------------------------
      // 11. Get today's usage
      // -----------------------------------------

      const downloadsUsed =
        await getUsedDownloads(
          userId,
          startOfDay,
          endOfDay
        );

      // -----------------------------------------
      // 12. Calculate remaining downloads
      // -----------------------------------------

      const remainingDownloads =
        await getRemainingDownloads(
          userId,
          subscriptionPlan,
          startOfDay,
          endOfDay
        );

      // -----------------------------------------
      // 13. Return download history
      // -----------------------------------------

      return res.status(200).json({
        subscriptionPlan,

        downloadLimit,

        downloadsUsed,

        remainingDownloads,

        downloads:
          downloadHistory,
      });

    } catch (error) {

      console.error(
        "Download history error:",
        error
      );

      return res.status(500).json({
        message:
          "Something went wrong while getting download history",
      });
    }
  };