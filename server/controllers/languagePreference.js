import mongoose from "mongoose";
import users from "../Modals/Auth.js";

// =====================================================
// SUPPORTED LANGUAGES
// =====================================================

const SUPPORTED_LANGUAGES = new Set([
  "en",
  "hi",
  "es",
  "fr",
  "de",
  "it",
  "pt",
  "ru",
  "ja",
  "ko",
  "zh",
  "ar",
  "bn",
  "ta",
  "te",
  "mr",
  "gu",
  "pa",
  "pl",
  "ro",
  "nl",
  "sv",
  "da",
  "fi",
  "no",
  "cs",
  "sk",
  "sl",
  "uk",
  "tr",
  "vi",
  "th",
  "he",
  "id",
]);

// =====================================================
// GET CURRENT USER ID
// =====================================================

const getAuthenticatedUserId = (req) => {
  return req.securityUserId || null;
};

// =====================================================
// GET PREFERRED LANGUAGE
// =====================================================

export const getPreferredLanguage = async (
  req,
  res
) => {
  try {
    const userId =
      getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({
        message:
          "Security session is required.",
      });
    }

    const user = await users
      .findById(userId)
      .select("preferredLanguage");

    if (!user) {
      return res.status(404).json({
        message: "User not found.",
      });
    }

    return res.status(200).json({
      success: true,
      preferredLanguage:
        user.preferredLanguage || "en",
    });
  } catch (error) {
    console.error(
      "Get preferred language error:",
      error
    );

    return res.status(500).json({
      message:
        "Something went wrong.",
    });
  }
};

// =====================================================
// UPDATE PREFERRED LANGUAGE
// =====================================================

export const updatePreferredLanguage =
  async (req, res) => {
    try {
      const userId =
        getAuthenticatedUserId(req);

      if (!userId) {
        return res.status(401).json({
          message:
            "Security session is required.",
        });
      }

      const { preferredLanguage } =
        req.body;

      if (
        typeof preferredLanguage !==
          "string" ||
        !preferredLanguage.trim()
      ) {
        return res.status(400).json({
          message:
            "Preferred language is required.",
        });
      }

      const language =
        preferredLanguage
          .trim()
          .toLowerCase();

      if (
        !SUPPORTED_LANGUAGES.has(
          language
        )
      ) {
        return res.status(400).json({
          message:
            "Unsupported preferred language.",
        });
      }

      if (
        !mongoose.Types.ObjectId.isValid(
          userId
        )
      ) {
        return res.status(400).json({
          message: "Invalid user ID.",
        });
      }

      const updatedUser =
        await users.findByIdAndUpdate(
          userId,
          {
            $set: {
              preferredLanguage:
                language,
            },
          },
          {
            new: true,
          }
        ).select(
          "_id preferredLanguage"
        );

      if (!updatedUser) {
        return res.status(404).json({
          message: "User not found.",
        });
      }

      return res.status(200).json({
        success: true,
        message:
          "Preferred language updated successfully.",
        preferredLanguage:
          updatedUser.preferredLanguage,
      });
    } catch (error) {
      console.error(
        "Update preferred language error:",
        error
      );

      return res.status(500).json({
        message:
          "Something went wrong.",
      });
    }
  };