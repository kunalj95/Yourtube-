import mongoose from "mongoose";

const securitySessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },

    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    loginHistoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LoginHistory",
      default: null,
    },

    authenticationMethod: {
      type: String,
      enum: [
        "standard",
        "otp",
        "trusted_device",
      ],
      default: "standard",
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

    createdAt: {
      type: Date,
      default: Date.now,
    },

    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },

    lastUsedAt: {
      type: Date,
      default: Date.now,
    },

    revokedAt: {
      type: Date,
      default: null,
    },

    revokedReason: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

securitySessionSchema.index({
  userId: 1,
  expiresAt: 1,
});

securitySessionSchema.index({
  userId: 1,
  revokedAt: 1,
});

export default mongoose.model(
  "SecuritySession",
  securitySessionSchema
);