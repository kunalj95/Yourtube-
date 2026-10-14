import crypto from "crypto";

import users from "../Modals/Auth.js";
import LoginHistory from "../Modals/LoginHistory.js";
import OtpChallenge from "../Modals/OtpChallenge.js";
import TrustedDevice from "../Modals/TrustedDevice.js";

import {
  createSecuritySession,
  revokeSecuritySession,
  getSecuritySessionToken,
} from "../services/securitySession.js";

// =====================================================
// OTP HASH VERIFICATION
// =====================================================

// -----------------------------------------
// Verify OTP against stored hash
// -----------------------------------------

const verifyOtpHash = (
  otp,
  otpSalt,
  storedHash
) => {
  try {
    const calculatedHash =
      crypto
        .scryptSync(
          otp,
          otpSalt,
          64
        )
        .toString("hex");

    const calculatedBuffer =
      Buffer.from(
        calculatedHash,
        "hex"
      );

    const storedBuffer =
      Buffer.from(
        storedHash,
        "hex"
      );

    if (
      calculatedBuffer.length !==
      storedBuffer.length
    ) {
      return false;
    }

    return crypto.timingSafeEqual(
      calculatedBuffer,
      storedBuffer
    );
  } catch (error) {
    console.error(
      "OTP hash verification error:",
      error
    );

    return false;
  }
};

// =====================================================
// TRUSTED DEVICE HELPERS
// =====================================================

// -----------------------------------------
// Get trusted-device duration
// -----------------------------------------

const getTrustedDeviceDays = () => {
  const configuredValue =
    Number(
      process.env.TRUSTED_DEVICE_DAYS
    );

  if (
    Number.isFinite(
      configuredValue
    ) &&
    configuredValue > 0
  ) {
    return configuredValue;
  }

  // Default: 30 days
  return 30;
};

// -----------------------------------------
// Generate random trusted-device token
// -----------------------------------------

const generateTrustedDeviceToken = () => {
  return crypto
    .randomBytes(32)
    .toString("hex");
};

// -----------------------------------------
// Hash trusted-device token
// -----------------------------------------

const hashTrustedDeviceToken = (
  token
) => {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
};

// =====================================================
// CREATE TRUSTED DEVICE
// =====================================================

const createTrustedDevice = async ({
  user,
  challenge,
}) => {
  // -----------------------------------------
  // Generate raw token
  // -----------------------------------------

  const trustedDeviceToken =
    generateTrustedDeviceToken();

  // -----------------------------------------
  // Store only token hash
  // -----------------------------------------

  const tokenHash =
    hashTrustedDeviceToken(
      trustedDeviceToken
    );

  // -----------------------------------------
  // Calculate expiry
  // -----------------------------------------

  const trustedDeviceDays =
    getTrustedDeviceDays();

  const trustedAt =
    new Date();

  const expiresAt =
    new Date(
      trustedAt.getTime() +
        trustedDeviceDays *
          24 *
          60 *
          60 *
          1000
    );

  // =================================================
  // REVOKE DUPLICATE ACTIVE TRUST RECORD
  // =================================================

  await TrustedDevice.updateMany(
    {
      userId:
        user._id,

      browserName:
        challenge.browserName ||
        "Unknown",

      browserVersion:
        challenge.browserVersion ||
        "Unknown",

      operatingSystem:
        challenge.operatingSystem ||
        "Unknown",

      deviceType:
        challenge.deviceType ||
        "Unknown",

      deviceModel:
        challenge.deviceModel ||
        "Unknown",

      revokedAt: null,

      expiresAt: {
        $gt: new Date(),
      },
    },
    {
      $set: {
        revokedAt:
          new Date(),
      },
    }
  );

  // =================================================
  // CREATE TRUSTED DEVICE
  // =================================================

  const trustedDevice =
    await TrustedDevice.create({
      userId:
        user._id,

      tokenHash,

      // -----------------------------------------
      // Browser
      // -----------------------------------------

      browserName:
        challenge.browserName ||
        "Unknown",

      browserVersion:
        challenge.browserVersion ||
        "Unknown",

      // -----------------------------------------
      // Device
      // -----------------------------------------

      operatingSystem:
        challenge.operatingSystem ||
        "Unknown",

      deviceType:
        challenge.deviceType ||
        "Unknown",

      deviceModel:
        challenge.deviceModel ||
        "Unknown",

      // -----------------------------------------
      // Network / location
      // -----------------------------------------

      lastIpAddress:
        challenge.ipAddress ||
        "Unknown",

      lastCity:
        challenge.city ||
        "Unknown",

      lastState:
        challenge.state ||
        "Unknown",

      lastCountry:
        challenge.country ||
        "Unknown",

      // -----------------------------------------
      // Trust dates
      // -----------------------------------------

      trustedAt,

      expiresAt,

      lastUsedAt:
        trustedAt,

      revokedAt:
        null,
    });

  return {
    trustedDeviceId:
      trustedDevice._id,

    trustedDeviceToken,

    trustedAt:
      trustedDevice.trustedAt,

    expiresAt:
      trustedDevice.expiresAt,
  };
};

// =====================================================
// VERIFY LOGIN OTP
// =====================================================

export const verifyLoginOtp = async (
  req,
  res
) => {
  try {
    // =================================================
    // 1. GET AUTHENTICATED USER EMAIL
    // =================================================

    const email =
      req.firebaseUser?.email;

    if (!email) {
      return res.status(401).json({
        message:
          "Authenticated user email not found.",
      });
    }

    // =================================================
    // 2. GET REQUEST DATA
    // =================================================

    const {
      challengeId,
      otp,
      trustDevice,
    } = req.body;

    // -----------------------------------------
    // Challenge ID
    // -----------------------------------------

    if (!challengeId) {
      return res.status(400).json({
        message:
          "OTP challenge ID is required.",
      });
    }

    // -----------------------------------------
    // OTP
    // -----------------------------------------

    if (!otp) {
      return res.status(400).json({
        message:
          "OTP is required.",
      });
    }

    // -----------------------------------------
    // OTP format
    // -----------------------------------------

    if (
      !/^\d{6}$/.test(
        String(otp)
      )
    ) {
      return res.status(400).json({
        message:
          "OTP must contain exactly 6 digits.",
      });
    }

    // =================================================
    // 3. FIND USER
    // =================================================

    const user =
      await users.findOne({
        email,
      });

    if (!user) {
      return res.status(404).json({
        message:
          "User not found.",
      });
    }

    // =================================================
    // 4. FIND OTP CHALLENGE
    // =================================================

    const challenge =
      await OtpChallenge.findOne({
        _id:
          challengeId,

        userId:
          user._id,
      });

    if (!challenge) {
      return res.status(404).json({
        message:
          "OTP challenge not found.",
      });
    }

    // =================================================
    // 5. ALREADY VERIFIED
    // =================================================

    if (
      challenge.status ===
      "verified"
    ) {
      return res.status(200).json({
        message:
          "OTP has already been verified.",

        verified:
          true,

        user: {
          _id:
            user._id,

          email:
            user.email,

          name:
            user.name,

          image:
            user.image,

          channelname:
            user.channelname,

          description:
            user.description,

          themePreference:
            user.themePreference,

          subscriptionPlan:
            user.subscriptionPlan,

          subscriptionExpiresAt:
            user.subscriptionExpiresAt,
        },

        security: {
          verified:
            true,

          loginHistoryId:
            challenge.loginHistoryId ||
            null,

          verifiedAt:
            challenge.verifiedAt,

          trustedDevice: {
            trusted:
              false,
          },
        },
      });
    }

    // =================================================
    // 6. FAILED CHALLENGE
    // =================================================

    if (
      challenge.status ===
      "failed"
    ) {
      return res.status(403).json({
        message:
          "This OTP challenge is no longer valid.",
      });
    }

    // =================================================
    // 7. EXPIRED CHALLENGE
    // =================================================

    if (
      challenge.status ===
        "expired" ||
      new Date(
        challenge.expiresAt
      ) <= new Date()
    ) {
      challenge.status =
        "expired";

      await challenge.save();

      return res.status(410).json({
        message:
          "OTP has expired. Please request a new code.",
      });
    }

    // =================================================
    // 8. MAXIMUM ATTEMPTS
    // =================================================

    if (
      challenge.attemptCount >=
      challenge.maxAttempts
    ) {
      challenge.status =
        "failed";

      await challenge.save();

      return res.status(429).json({
        message:
          "Maximum OTP attempts exceeded. Please request a new code.",
      });
    }

    // =================================================
    // 9. VERIFY OTP
    // =================================================

    const otpIsValid =
      verifyOtpHash(
        String(otp),
        challenge.otpSalt,
        challenge.otpHash
      );

    if (!otpIsValid) {
      challenge.attemptCount +=
        1;

      if (
        challenge.attemptCount >=
        challenge.maxAttempts
      ) {
        challenge.status =
          "failed";
      }

      await challenge.save();

      const attemptsRemaining =
        Math.max(
          0,
          challenge.maxAttempts -
            challenge.attemptCount
        );

      return res.status(401).json({
        message:
          challenge.status ===
          "failed"
            ? "Maximum OTP attempts exceeded. Please request a new code."
            : "Invalid OTP.",

        attemptsRemaining,
      });
    }

    // =================================================
    // 10. MARK OTP VERIFIED
    // =================================================

    challenge.status =
      "verified";

    challenge.verifiedAt =
      new Date();

    await challenge.save();

    // =================================================
    // 11. UPDATE LOGIN HISTORY
    // =================================================

    if (
      challenge.loginHistoryId
    ) {
      await LoginHistory.findOneAndUpdate(
        {
          _id:
            challenge.loginHistoryId,

          userId:
            user._id,
        },
        {
          $set: {
            status:
              "otp_verified",
          },
        }
      );
    }

    // =================================================
    // 12. CREATE TRUSTED DEVICE
    // =================================================

    let trustedDeviceResult =
      null;

    if (
      trustDevice === true
    ) {
      trustedDeviceResult =
        await createTrustedDevice({
          user,

          challenge,
        });
    }

    // =================================================
    // 13. CREATE SECURITY SESSION
    // =================================================

    const securitySession =
      await createSecuritySession({
        userId:
          user._id,

        loginHistoryId:
          challenge.loginHistoryId ||
          null,

        authenticationMethod:
          "otp",

        loginInformation: {
          browserName:
            challenge.browserName ||
            "Unknown",

          browserVersion:
            challenge.browserVersion ||
            "Unknown",

          operatingSystem:
            challenge.operatingSystem ||
            "Unknown",

          deviceType:
            challenge.deviceType ||
            "Unknown",

          deviceModel:
            challenge.deviceModel ||
            "Unknown",

          ipAddress:
            challenge.ipAddress ||
            "Unknown",
        },

        locationInformation: {
          city:
            challenge.city ||
            "Unknown",

          state:
            challenge.state ||
            "Unknown",

          country:
            challenge.country ||
            "Unknown",
        },
      });

    // =================================================
    // 14. RETURN SUCCESS
    // =================================================

    return res.status(200).json({
      message:
        "OTP verified successfully.",

      verified:
        true,

      user: {
        _id:
          user._id,

        email:
          user.email,

        name:
          user.name,

        image:
          user.image,

        channelname:
          user.channelname,

        description:
          user.description,

        themePreference:
          user.themePreference,

        subscriptionPlan:
          user.subscriptionPlan,

        subscriptionExpiresAt:
          user.subscriptionExpiresAt,
      },

      security: {
        verified:
          true,

        loginHistoryId:
          challenge.loginHistoryId ||
          null,

        verifiedAt:
          challenge.verifiedAt,

        // -----------------------------------------
        // Security session
        // -----------------------------------------

        securitySessionId:
          securitySession.securitySessionId,

        securitySessionToken:
          securitySession.securitySessionToken,

        securitySessionExpiresAt:
          securitySession.expiresAt,

        // -----------------------------------------
        // Trusted device
        // -----------------------------------------

        trustedDevice:
          trustedDeviceResult
            ? {
                trusted:
                  true,

                trustedDeviceId:
                  trustedDeviceResult.trustedDeviceId,

                trustedAt:
                  trustedDeviceResult.trustedAt,

                expiresAt:
                  trustedDeviceResult.expiresAt,

                trustedDeviceToken:
                  trustedDeviceResult.trustedDeviceToken,
              }
            : {
                trusted:
                  false,
              },
      },
    });
  } catch (error) {
    console.error(
      "Verify login OTP error:",
      error
    );

    return res.status(500).json({
      message:
        "Unable to verify OTP.",
    });
  }
};

// =====================================================
// REVOKE CURRENT SECURITY SESSION
// =====================================================

export const revokeCurrentSecuritySession =
  async (
    req,
    res
  ) => {
    try {
      const token =
        getSecuritySessionToken(
          req
        );

      if (!token) {
        return res.status(200).json({
          message:
            "No active security session.",
        });
      }

      await revokeSecuritySession(
        token,
        "logout"
      );

      return res.status(200).json({
        message:
          "Security session revoked.",
      });
    } catch (error) {
      console.error(
        "Security session revoke error:",
        error
      );

      return res.status(500).json({
        message:
          "Unable to revoke security session.",
      });
    }
  };