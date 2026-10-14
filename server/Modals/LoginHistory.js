import mongoose from "mongoose";

const loginHistorySchema = new mongoose.Schema(
  {
    // -----------------------------------------
    // User reference
    // -----------------------------------------

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },

    // -----------------------------------------
    // Login information
    // -----------------------------------------

    ipAddress: {
      type: String,
      default: "Unknown",
    },

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

    // -----------------------------------------
    // Approximate location
    // -----------------------------------------

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

    // -----------------------------------------
    // Login timestamp
    // -----------------------------------------

    loginAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    // -----------------------------------------
    // Login status
    // -----------------------------------------

    status: {
      type: String,
      enum: [
        "successful",
        "failed",
        "otp_required",
        "otp_verified",
      ],
      default: "successful",
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model(
  "LoginHistory",
  loginHistorySchema
);