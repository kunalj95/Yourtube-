import { adminAuth } from "../config/firebaseAdmin.js";

const firebaseAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    // Check whether Authorization header exists
    if (!authHeader) {
      return res.status(401).json({
        message: "Authentication token is required",
      });
    }

    // Expected format:
    // Authorization: Bearer <firebase-id-token>

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Invalid authentication format",
      });
    }

    // Extract token
    const idToken = authHeader.split("Bearer ")[1];

    if (!idToken) {
      return res.status(401).json({
        message: "Authentication token is missing",
      });
    }

    // Verify Firebase ID token
    const decodedToken = await adminAuth.verifyIdToken(
      idToken
    );

    // Store verified Firebase user information
    // so controllers can use it.
    req.firebaseUser = decodedToken;

    next();

  } catch (error) {
    console.error(
      "Firebase authentication error:",
      error
    );

    return res.status(401).json({
      message: "Invalid or expired authentication token",
    });
  }
};

export default firebaseAuth;