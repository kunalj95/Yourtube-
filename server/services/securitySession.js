import crypto from "crypto";

import SecuritySession from "../Modals/SecuritySession.js";

// =====================================================
// SECURITY SESSION CONFIGURATION
// =====================================================

const getSecuritySessionHours = () => {
  const configuredValue =
    Number(
      process.env.SECURITY_SESSION_HOURS
    );

  if (
    Number.isFinite(
      configuredValue
    ) &&
    configuredValue > 0
  ) {
    return configuredValue;
  }

  // Default: 24 hours
  return 24;
};

// =====================================================
// TOKEN HELPERS
// =====================================================

export const generateSecuritySessionToken = () => {
  return crypto
    .randomBytes(32)
    .toString("hex");
};

export const hashSecuritySessionToken = (
  token
) => {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
};

export const getSecuritySessionToken = (
  req
) => {
  const token =
    req.headers[
      "x-yourtube-security-session-token"
    ];

  if (!token) {
    return null;
  }

  return String(token).trim() || null;
};

// =====================================================
// CREATE SECURITY SESSION
// =====================================================

export const createSecuritySession = async ({
  userId,
  loginHistoryId,
  authenticationMethod,
  loginInformation,
  locationInformation,
}) => {
  const rawToken =
    generateSecuritySessionToken();

  const tokenHash =
    hashSecuritySessionToken(
      rawToken
    );

  const createdAt =
    new Date();

  const sessionHours =
    getSecuritySessionHours();

  const expiresAt =
    new Date(
      createdAt.getTime() +
        sessionHours *
          60 *
          60 *
          1000
    );

  const session =
    await SecuritySession.create({
      userId,

      tokenHash,

      loginHistoryId:
        loginHistoryId || null,

      authenticationMethod:
        authenticationMethod ||
        "standard",

      browserName:
        loginInformation?.browserName ||
        "Unknown",

      browserVersion:
        loginInformation?.browserVersion ||
        "Unknown",

      operatingSystem:
        loginInformation?.operatingSystem ||
        "Unknown",

      deviceType:
        loginInformation?.deviceType ||
        "Unknown",

      deviceModel:
        loginInformation?.deviceModel ||
        "Unknown",

      ipAddress:
        loginInformation?.ipAddress ||
        "Unknown",

      city:
        locationInformation?.city ||
        "Unknown",

      state:
        locationInformation?.state ||
        "Unknown",

      country:
        locationInformation?.country ||
        "Unknown",

      createdAt,

      expiresAt,

      lastUsedAt:
        createdAt,

      revokedAt: null,

      revokedReason: null,
    });

  return {
    securitySessionId:
      session._id,

    securitySessionToken:
      rawToken,

    createdAt:
      session.createdAt,

    expiresAt:
      session.expiresAt,
  };
};

// =====================================================
// REVOKE SECURITY SESSION
// =====================================================

export const revokeSecuritySession = async (
  token,
  reason = "logout"
) => {
  if (!token) {
    return null;
  }

  const tokenHash =
    hashSecuritySessionToken(
      token
    );

  return await SecuritySession.findOneAndUpdate(
    {
      tokenHash,

      revokedAt: null,
    },
    {
      $set: {
        revokedAt: new Date(),

        revokedReason:
          reason,
      },
    },
    {
      new: true,
    }
  );
};