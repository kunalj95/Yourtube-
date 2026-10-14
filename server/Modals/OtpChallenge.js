import mongoose from "mongoose";

const otpChallengeSchema =
  new mongoose.Schema(
    {
      // =================================================
      // USER
      // =================================================

      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        required: true,
        index: true,
      },

      // =================================================
      // OTP DELIVERY
      // =================================================

      deliveryMethod: {
        type: String,
        enum: [
          "email",
          "mobile",
        ],
        default: "email",
      },

      deliveryTarget: {
        type: String,
        required: true,
      },

      // =================================================
      // OTP SECURITY
      // =================================================

      otpHash: {
        type: String,
        required: true,
      },

      otpSalt: {
        type: String,
        required: true,
      },

      status: {
        type: String,
        enum: [
          "pending",
          "verified",
          "failed",
          "expired",
        ],
        default: "pending",
        index: true,
      },

      attemptCount: {
        type: Number,
        default: 0,
      },

      maxAttempts: {
        type: Number,
        default: 5,
      },

      // =================================================
      // LOGIN ENVIRONMENT
      // =================================================
      //
      // These fields describe the browser/device/IP/
      // location that caused this OTP challenge.
      // =================================================

      browserName: {
        type: String,
        default: "Unknown",
      },

      browserVersion: {
        type: String,
        default: "Unknown",
      },

      operatingSystem: {
        type: String,
        default: "Unknown",
      },

      deviceType: {
        type: String,
        enum: [
          "Desktop",
          "Mobile",
          "Tablet",
          "Unknown",
        ],
        default: "Unknown",
      },

      deviceModel: {
        type: String,
        default: "Unknown",
      },

      ipAddress: {
        type: String,
        default: "Unknown",
      },

      city: {
        type: String,
        default: "Unknown",
      },

      state: {
        type: String,
        default: "Unknown",
      },

      country: {
        type: String,
        default: "Unknown",
      },

      latitude: {
        type: Number,
        default: null,
      },

      longitude: {
        type: Number,
        default: null,
      },

      // =================================================
      // CHALLENGE DATES
      // =================================================

      createdAt: {
        type: Date,
        default: Date.now,
      },

      expiresAt: {
        type: Date,
        required: true,
        index: true,
      },

      verifiedAt: {
        type: Date,
        default: null,
      },

      // =================================================
      // LOGIN HISTORY REFERENCE
      // =================================================

      loginHistoryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "LoginHistory",
        default: null,
      },
    },

    {
      timestamps: true,
    }
  );

// =====================================================
// INDEXES
// =====================================================

otpChallengeSchema.index({
  userId: 1,
  status: 1,
});

otpChallengeSchema.index({
  userId: 1,
  expiresAt: 1,
});

export default mongoose.model(
  "OtpChallenge",
  otpChallengeSchema
);