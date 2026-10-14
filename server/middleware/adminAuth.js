import users from "../Modals/Auth.js";

// =====================================================
// ADMIN AUTHENTICATION
// =====================================================

const adminAuth = async (req, res, next) => {
  try {
    // =================================================
    // CHECK SECURITY SESSION
    // =================================================

    const authenticatedUserId =
      req.securityUserId || null;

    if (!authenticatedUserId) {
      return res.status(401).json({
        message: "Security session is required.",
      });
    }

    // =================================================
    // FIND USER
    // =================================================

    const existingUser = await users.findById(
      authenticatedUserId
    );

    if (!existingUser) {
      return res.status(401).json({
        message: "User not found.",
      });
    }

    // =================================================
    // CHECK ADMIN ROLE
    // =================================================

    if (existingUser.role !== "admin") {
      return res.status(403).json({
        message: "Admin access required.",
      });
    }

    // =================================================
    // STORE ADMIN USER
    // =================================================

    req.adminUser = existingUser;

    // =================================================
    // CONTINUE
    // =================================================

    next();

  } catch (error) {
    console.error(
      "Admin authentication error:",
      error
    );

    return res.status(500).json({
      message:
        "Something went wrong while checking admin access.",
    });
  }
};

export default adminAuth;