import mongoose from "mongoose";

const trustedDeviceSchema =
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
      // TRUST TOKEN
      // =================================================
      //
      // The actual token will remain on the user's
      // browser. Only its SHA-256 hash is stored here.
      // =================================================

      tokenHash: {
        type: String,
        required: true,
        unique: true,
        index: true,
      },

      // =================================================
      // DEVICE / BROWSER INFORMATION
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

      // =================================================
      // LAST KNOWN LOCATION / NETWORK INFORMATION
      // =================================================

      lastIpAddress: {
        type: String,
        default: "Unknown",
      },

      lastCity: {
        type: String,
        default: "Unknown",
      },

      lastState: {
        type: String,
        default: "Unknown",
      },

      lastCountry: {
        type: String,
        default: "Unknown",
      },

      // =================================================
      // TRUST DATES
      // =================================================

      trustedAt: {
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

      // =================================================
      // REVOCATION
      // =================================================

      revokedAt: {
        type: Date,
        default: null,
      },
    },

    {
      timestamps: true,
    }
  );

// =====================================================
// USER + ACTIVE TRUSTED DEVICE INDEX
// =====================================================

trustedDeviceSchema.index({
  userId: 1,
  expiresAt: 1,
});

export default mongoose.model(
  "TrustedDevice",
  trustedDeviceSchema
);