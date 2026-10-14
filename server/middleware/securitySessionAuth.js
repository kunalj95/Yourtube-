import SecuritySession from "../Modals/SecuritySession.js";
import users from "../Modals/Auth.js";

import {
  getSecuritySessionToken,
  hashSecuritySessionToken,
} from "../services/securitySession.js";

const securitySessionAuth = async (
  req,
  res,
  next
) => {
  try {
    // -----------------------------------------
    // Firebase authentication should already
    // have happened before this middleware.
    // -----------------------------------------

    const firebaseEmail =
      req.firebaseUser?.email;

    if (!firebaseEmail) {
      return res.status(401).json({
        message:
          "Authenticated Firebase user is required.",
      });
    }

    // -----------------------------------------
    // Get security session token
    // -----------------------------------------

    const token =
      getSecuritySessionToken(req);

    if (!token) {
      return res.status(401).json({
        message:
          "Security session is required.",
      });
    }

    // -----------------------------------------
    // Hash token
    // -----------------------------------------

    const tokenHash =
      hashSecuritySessionToken(
        token
      );

    // -----------------------------------------
    // Find active session
    // -----------------------------------------

    const session =
      await SecuritySession.findOne({
        tokenHash,

        revokedAt: null,

        expiresAt: {
          $gt: new Date(),
        },
      });

    if (!session) {
      return res.status(401).json({
        message:
          "Security session is invalid or expired. Please sign in again.",
      });
    }

    // -----------------------------------------
    // Find session user
    // -----------------------------------------

    const user =
      await users.findById(
        session.userId
      );

    if (!user) {
      return res.status(401).json({
        message:
          "Security session user was not found.",
      });
    }

    // -----------------------------------------
    // Make sure Firebase identity and
    // security session belong to same user.
    // -----------------------------------------

    if (
      String(user.email).trim().toLowerCase() !==
      String(firebaseEmail).trim().toLowerCase()
    ) {
      return res.status(401).json({
        message:
          "Security session does not belong to the authenticated user.",
      });
    }

    // -----------------------------------------
    // Update last-used time
    // -----------------------------------------

    session.lastUsedAt =
      new Date();

    await session.save();

    // -----------------------------------------
    // Store security session information
    // -----------------------------------------

    req.securitySession =
      session;

    req.securityUserId =
      session.userId;

    req.securityUser =
      user;

    next();
  } catch (error) {
    console.error(
      "Security session authentication error:",
      error
    );

    return res.status(401).json({
      message:
        "Unable to validate security session.",
    });
  }
};

export default securitySessionAuth;