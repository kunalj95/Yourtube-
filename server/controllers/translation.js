import users from "../Modals/Auth.js";

// =====================================================
// LIBRETRANSLATE CONFIGURATION
// =====================================================

const LIBRETRANSLATE_URL =
  process.env.LIBRETRANSLATE_URL ||
  "http://127.0.0.1:5001";

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
// GET AUTHENTICATED USER
// =====================================================

const getAuthenticatedUserId = (req) => {
  return req.securityUserId || null;
};

// =====================================================
// TRANSLATE COMMENT
// =====================================================

export const translateComment = async (req, res) => {
  try {
    // -----------------------------------------
    // Authentication
    // -----------------------------------------

    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({
        message: "Security session is required.",
      });
    }

    // -----------------------------------------
    // Request data
    // -----------------------------------------

    const {
      text,
      targetLanguage,
      sourceLanguage,
    } = req.body;

    // -----------------------------------------
    // Validate text
    // -----------------------------------------

    if (
      typeof text !== "string" ||
      !text.trim()
    ) {
      return res.status(400).json({
        message: "Text is required.",
      });
    }

    const cleanText = text.trim();

    if (cleanText.length > 5000) {
      return res.status(400).json({
        message:
          "Text is too long to translate.",
      });
    }

    // -----------------------------------------
    // Get current user's preferred language
    // -----------------------------------------

    const user = await users
      .findById(userId)
      .select("preferredLanguage");

    if (!user) {
      return res.status(404).json({
        message: "User not found.",
      });
    }

    const preferredLanguage =
      user.preferredLanguage || "en";

    // -----------------------------------------
    // Target language
    // -----------------------------------------

    const target =
      typeof targetLanguage === "string" &&
      targetLanguage.trim()
        ? targetLanguage.trim().toLowerCase()
        : preferredLanguage;

    if (!SUPPORTED_LANGUAGES.has(target)) {
      return res.status(400).json({
        message:
          "Unsupported target language.",
      });
    }

    // -----------------------------------------
    // Source language
    //
    // "auto" allows LibreTranslate to detect
    // the source language automatically.
    // -----------------------------------------

    let source = "auto";

    if (
      typeof sourceLanguage === "string" &&
      sourceLanguage.trim()
    ) {
      source =
        sourceLanguage.trim().toLowerCase();

      if (
        source !== "auto" &&
        !SUPPORTED_LANGUAGES.has(source)
      ) {
        return res.status(400).json({
          message:
            "Unsupported source language.",
        });
      }
    }

    // -----------------------------------------
    // Send request to local LibreTranslate
    // -----------------------------------------

    const translationResponse =
      await fetch(
        `${LIBRETRANSLATE_URL}/translate`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            q: cleanText,
            source,
            target,
            format: "text",
          }),
        }
      );

    let translationData = null;

    try {
      translationData =
        await translationResponse.json();
    } catch {
      translationData = null;
    }

    // -----------------------------------------
    // LibreTranslate error
    // -----------------------------------------

    if (!translationResponse.ok) {
      console.error(
        "LibreTranslate error:",
        translationResponse.status,
        translationData
      );

      return res.status(502).json({
        message:
          "Translation service failed.",
      });
    }

    // -----------------------------------------
    // Validate translation response
    // -----------------------------------------

    const translatedText =
      translationData?.translatedText;

    if (
      typeof translatedText !== "string" ||
      !translatedText.trim()
    ) {
      return res.status(502).json({
        message:
          "Translation result was not available.",
      });
    }

    // -----------------------------------------
    // Return translation
    // -----------------------------------------

    return res.status(200).json({
      success: true,

      originalText: cleanText,

      translatedText:
        translatedText,

      sourceLanguage:
        translationData?.detectedLanguage
          ?.language ||
        (source === "auto"
          ? null
          : source),

      detectionConfidence:
        translationData?.detectedLanguage
          ?.confidence ?? null,

      targetLanguage: target,
    });
  } catch (error) {
    console.error(
      "Comment translation error:",
      error
    );

    return res.status(500).json({
      message:
        "Something went wrong while translating.",
    });
  }
};