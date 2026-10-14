import mongoose from "mongoose";

const commentSecuritySchema = mongoose.Schema(
  {
    // =====================================================
    // USER
    // =====================================================

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },

    // =====================================================
    // VIDEO
    // =====================================================

    videoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "videofiles",
      default: null,
      index: true,
    },

    // =====================================================
    // REQUEST INFORMATION
    // =====================================================

    ipAddress: {
      type: String,
      default: "Unknown",
      index: true,
    },

    userAgent: {
      type: String,
      default: "Unknown",
    },

    // =====================================================
    // SECURITY EVENT
    // =====================================================

    eventType: {
      type: String,

      enum: [
        "comment_attempt",
        "comment_allowed",
        "comment_blocked",
        "rate_limited",
        "captcha_required",
        "captcha_passed",
        "captcha_failed",
      ],

      required: true,

      index: true,
    },

    // =====================================================
    // SECURITY REASON
    // =====================================================

    reason: {
      type: String,

      enum: [
        "none",
        "profanity",
        "spam",
        "duplicate_comment",
        "special_character_spam",
        "emoji_spam",
        "malicious_link",
        "comment_flooding",
        "rate_limit_exceeded",
        "captcha_required",
        "captcha_failed",
        "other",
      ],

      default: "none",
    },

    // =====================================================
    // CAPTCHA STATUS
    // =====================================================

    captchaRequired: {
      type: Boolean,
      default: false,
    },

    captchaPassed: {
      type: Boolean,
      default: false,
    },

    // =====================================================
    // ATTEMPT COUNT
    // =====================================================

    attemptCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // =====================================================
    // TIME WINDOW
    // =====================================================

    windowStartedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    windowExpiresAt: {
      type: Date,
      default: null,
      index: true,
    },

    // =====================================================
    // ADDITIONAL SECURITY DATA
    // =====================================================

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // =====================================================
    // EVENT TIMESTAMP
    // =====================================================

    eventAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },

  {
    timestamps: true,
  }
);

// =====================================================
// INDEXES
// =====================================================

// Recent security activity for a user
commentSecuritySchema.index({
  userId: 1,
  eventAt: -1,
});

// Recent activity from an IP
commentSecuritySchema.index({
  ipAddress: 1,
  eventAt: -1,
});

// Find active rate-limit records
commentSecuritySchema.index({
  userId: 1,
  windowExpiresAt: 1,
});

// Security events by type
commentSecuritySchema.index({
  eventType: 1,
  eventAt: -1,
});

export default mongoose.model(
  "CommentSecurity",
  commentSecuritySchema
);