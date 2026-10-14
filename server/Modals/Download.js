import mongoose from "mongoose";

const downloadSchema = mongoose.Schema(
  {
    // -----------------------------------------
    // User who downloaded the video
    // -----------------------------------------
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },

    // -----------------------------------------
    // Video that was downloaded
    // -----------------------------------------
    videoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "videofiles",
      required: true,
    },

    // -----------------------------------------
    // Download date and time
    // -----------------------------------------
    downloadDate: {
      type: Date,
      default: Date.now,
    },

    // -----------------------------------------
    // Date used for daily quota tracking
    // -----------------------------------------
    quotaDate: {
      type: Date,
    },

    // -----------------------------------------
    // Whether quota was released
    // -----------------------------------------
    // false = this download currently reserves
    // a quota slot
    //
    // true = quota slot has been released,
    // usually because the download failed
    // -----------------------------------------
    quotaReleased: {
      type: Boolean,
      default: false,
    },

    // -----------------------------------------
    // Download status
    // -----------------------------------------
    status: {
      type: String,
      enum: [
        "pending",
        "completed",
        "failed",
      ],
      default: "pending",
    },

    // -----------------------------------------
    // Video file size
    // -----------------------------------------
    fileSize: {
      type: String,
    },

    // -----------------------------------------
    // Subscription plan used
    // -----------------------------------------
    subscriptionPlan: {
      type: String,
      default: "Free",
    },

    // -----------------------------------------
    // IP address
    // -----------------------------------------
    ipAddress: {
      type: String,
    },

    // -----------------------------------------
    // Device information
    // -----------------------------------------
    deviceInfo: {
      type: String,
    },

    // -----------------------------------------
    // Browser information
    // -----------------------------------------
    browser: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);


// =====================================================
// INDEX FOR SAME VIDEO + SAME USER + SAME QUOTA DAY
// =====================================================
//
// This protects against duplicate pending/completed
// download records for the same video on the same day.
//
// quotaDate: { $exists: true } is included so that
// older download records created before this field
// existed do not interfere with index creation.
// =====================================================

downloadSchema.index(
  {
    userId: 1,
    videoId: 1,
    quotaDate: 1,
  },
  {
    unique: true,

    partialFilterExpression: {
      status: {
        $in: [
          "pending",
          "completed",
        ],
      },

      quotaDate: {
        $exists: true,
      },
    },
  }
);


// =====================================================
// EXPORT MODEL
// =====================================================

export default mongoose.model(
  "downloads",
  downloadSchema
);