import mongoose from "mongoose";

import LoginHistory from "../Modals/LoginHistory.js";
import OtpChallenge from "../Modals/OtpChallenge.js";
import TrustedDevice from "../Modals/TrustedDevice.js";
import SecuritySession from "../Modals/SecuritySession.js";

// =====================================================
// GET SECURITY INFORMATION
// =====================================================

export const getSecurityInformation = async (
  req,
  res
) => {
  try {
    const userId =
      req.securityUserId;

    if (!userId) {
      return res.status(401).json({
        message:
          "Security session user is missing.",
      });
    }

    // =================================================
    // LOGIN HISTORY
    // =================================================

    const loginHistory =
      await LoginHistory.find({
        userId,
      })
        .sort({
          loginAt: -1,
        })
        .limit(100)
        .lean();

    // =================================================
    // OTP CHALLENGES
    // =================================================
    /*
      Do NOT return otpHash or otpSalt.
      Those values must remain private.
    */

    const otpChallenges =
      await OtpChallenge.find(
        {
          userId,
        },
        {
          otpHash: 0,
          otpSalt: 0,
        }
      )
        .sort({
          createdAt: -1,
        })
        .limit(100)
        .lean();

    // =================================================
    // TRUSTED DEVICES
    // =================================================

    const trustedDevices =
      await TrustedDevice.find(
        {
          userId,
        },
        {
          tokenHash: 0,
        }
      )
        .sort({
          trustedAt: -1,
        })
        .lean();

    // =================================================
    // SECURITY SESSIONS
    // =================================================

    const securitySessions =
      await SecuritySession.find({
        userId,
      })
        .select(
          "-tokenHash"
        )
        .sort({
          createdAt: -1,
        })
        .limit(100)
        .lean();

    // =================================================
    // MARK CURRENT SESSION
    // =================================================

    const currentSessionId =
      req.securitySession?._id
        ? String(
            req.securitySession._id
          )
        : null;

    const sessionsWithCurrentFlag =
      securitySessions.map(
        (session) => ({
          ...session,

          isCurrent:
            currentSessionId !== null &&
            String(
              session._id
            ) ===
              currentSessionId,
        })
      );

    // =================================================
    // RESPONSE
    // =================================================

    return res.status(200).json({
      loginHistory,

      otpChallenges,

      trustedDevices,

      securitySessions:
        sessionsWithCurrentFlag,
    });
  } catch (error) {
    console.error(
      "Get security information error:",
      error
    );

    return res.status(500).json({
      message:
        "Unable to load security information.",
    });
  }
};

// =====================================================
// REVOKE TRUSTED DEVICE
// =====================================================

export const revokeTrustedDevice =
  async (
    req,
    res
  ) => {
    try {
      const userId =
        req.securityUserId;

      const {
        id,
      } = req.params;

      if (
        !userId
      ) {
        return res.status(401).json({
          message:
            "Security session user is missing.",
        });
      }

      if (
        !mongoose.Types.ObjectId.isValid(
          id
        )
      ) {
        return res.status(400).json({
          message:
            "Invalid trusted-device ID.",
        });
      }

      const trustedDevice =
        await TrustedDevice.findOne({
          _id:
            id,

          userId,
        });

      if (
        !trustedDevice
      ) {
        return res.status(404).json({
          message:
            "Trusted device not found.",
        });
      }

      if (
        trustedDevice.revokedAt
      ) {
        return res.status(200).json({
          message:
            "Trusted device is already revoked.",
        });
      }

      trustedDevice.revokedAt =
        new Date();

      await trustedDevice.save();

      return res.status(200).json({
        message:
          "Trusted device revoked successfully.",
      });
    } catch (error) {
      console.error(
        "Revoke trusted device error:",
        error
      );

      return res.status(500).json({
        message:
          "Unable to revoke trusted device.",
      });
    }
  };

// =====================================================
// REVOKE SECURITY SESSION
// =====================================================

export const revokeSecuritySession =
  async (
    req,
    res
  ) => {
    try {
      const userId =
        req.securityUserId;

      const {
        id,
      } = req.params;

      if (
        !userId
      ) {
        return res.status(401).json({
          message:
            "Security session user is missing.",
        });
      }

      if (
        !mongoose.Types.ObjectId.isValid(
          id
        )
      ) {
        return res.status(400).json({
          message:
            "Invalid security session ID.",
        });
      }

      const securitySession =
        await SecuritySession.findOne({
          _id:
            id,

          userId,
        });

      if (
        !securitySession
      ) {
        return res.status(404).json({
          message:
            "Security session not found.",
        });
      }

      if (
        securitySession.revokedAt
      ) {
        return res.status(200).json({
          message:
            "Security session is already revoked.",
        });
      }

      securitySession.revokedAt =
        new Date();

      securitySession.revokedReason =
        "revoked_from_security_page";

      await securitySession.save();

      return res.status(200).json({
        message:
          "Security session revoked successfully.",
      });
    } catch (error) {
      console.error(
        "Revoke security session error:",
        error
      );

      return res.status(500).json({
        message:
          "Unable to revoke security session.",
      });
    }
  };

// =====================================================
// REVOKE ALL OTHER SECURITY SESSIONS
// =====================================================

export const revokeAllOtherSecuritySessions =
  async (
    req,
    res
  ) => {
    try {
      const userId =
        req.securityUserId;

      const currentSessionId =
        req.securitySession?._id;

      if (
        !userId
      ) {
        return res.status(401).json({
          message:
            "Security session user is missing.",
        });
      }

      const filter = {
        userId,

        revokedAt:
          null,

        expiresAt: {
          $gt:
            new Date(),
        },
      };

      if (
        currentSessionId
      ) {
        filter._id = {
          $ne:
            currentSessionId,
        };
      }

      const result =
        await SecuritySession.updateMany(
          filter,
          {
            $set: {
              revokedAt:
                new Date(),

              revokedReason:
                "revoked_all_other_sessions",
            },
          }
        );

      return res.status(200).json({
        message:
          "All other security sessions revoked successfully.",

        revokedCount:
          result.modifiedCount || 0,
      });
    } catch (error) {
      console.error(
        "Revoke all other security sessions error:",
        error
      );

      return res.status(500).json({
        message:
          "Unable to revoke other security sessions.",
      });
    }
  };