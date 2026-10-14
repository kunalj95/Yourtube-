import express from "express";

import {
  login,
  updateprofile,
} from "../controllers/auth.js";

import {
  verifyLoginOtp,
  revokeCurrentSecuritySession,
} from "../controllers/loginSecurity.js";

import {
  getSecurityInformation,
  revokeTrustedDevice,
  revokeSecuritySession,
  revokeAllOtherSecuritySessions,
} from "../controllers/security.js";

import firebaseAuth from "../middleware/firebaseAuth.js";
import securitySessionAuth from "../middleware/securitySessionAuth.js";

const routes = express.Router();

// =====================================================
// GOOGLE LOGIN
// =====================================================

routes.post(
  "/login",
  firebaseAuth,
  login
);

// =====================================================
// UPDATE PROFILE
// =====================================================

routes.patch(
  "/update/:id",
  firebaseAuth,
  securitySessionAuth,
  updateprofile
);

// =====================================================
// OTP VERIFICATION
// =====================================================

routes.post(
  "/verify-otp",
  firebaseAuth,
  verifyLoginOtp
);

// =====================================================
// REVOKE CURRENT SECURITY SESSION
// =====================================================

routes.post(
  "/revoke-session",
  firebaseAuth,
  securitySessionAuth,
  revokeCurrentSecuritySession
);

// =====================================================
// ACCOUNT SECURITY INFORMATION
// =====================================================

routes.get(
  "/security",
  firebaseAuth,
  securitySessionAuth,
  getSecurityInformation
);

// =====================================================
// REVOKE TRUSTED DEVICE
// =====================================================

routes.delete(
  "/security/trusted-device/:id",
  firebaseAuth,
  securitySessionAuth,
  revokeTrustedDevice
);

// =====================================================
// REVOKE SECURITY SESSION
// =====================================================

routes.delete(
  "/security/session/:id",
  firebaseAuth,
  securitySessionAuth,
  revokeSecuritySession
);

// =====================================================
// REVOKE ALL OTHER SECURITY SESSIONS
// =====================================================

routes.post(
  "/security/revoke-other-sessions",
  firebaseAuth,
  securitySessionAuth,
  revokeAllOtherSecuritySessions
);

export default routes;