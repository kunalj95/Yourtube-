import mongoose from "mongoose";

const commentModerationSchema = mongoose.Schema(
  {
    // =====================================================
    // COMMENT REFERENCE
    // =====================================================

    commentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "comment",
      required: true,
      index: true,
    },

    // =====================================================
    // VIDEO REFERENCE
    // =====================================================

    videoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "videofiles",
      required: true,
      index: true,
    },

    // =====================================================
    // USER WHO POSTED THE COMMENT
    // =====================================================

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },

    // =====================================================
    // MODERATION SOURCE
    // =====================================================

    source: {
      type: String,

      enum: [
        "profanity_filter",
        "spam_detection",
        "duplicate_detection",
        "special_character_detection",
        "emoji_spam_detection",
        "malicious_link_detection",
        "rate_limit",
        "user_report",
        "administrator",
        "system",
      ],

      required: true,

      index: true,
    },

    // =====================================================
    // DETECTION / MODERATION REASON
    // =====================================================

    reason: {
      type: String,

      enum: [
        "abusive_content",
        "profanity",
        "spam",
        "duplicate_comment",
        "repeated_special_characters",
        "repeated_emoji",
        "malicious_link",
        "comment_flooding",
        "reported_content",
        "other",
      ],

      required: true,
    },

    // =====================================================
    // MODERATION ACTION
    // =====================================================

    action: {
      type: String,

      enum: [
        "none",
        "allowed",
        "blocked",
        "flagged",
        "deleted",
        "restored",
      ],

      default: "none",

      index: true,
    },

    // =====================================================
    // MODERATION STATUS
    // =====================================================

    status: {
      type: String,

      enum: [
        "pending",
        "completed",
        "dismissed",
      ],

      default: "pending",

      index: true,
    },

    // =====================================================
    // MODERATOR
    // =====================================================

    moderatorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      default: null,
    },

    // =====================================================
    // MODERATION NOTE
    // =====================================================

    note: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000,
    },

    // =====================================================
    // DETECTION METADATA
    // =====================================================

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // =====================================================
    // TIMESTAMPS
    // =====================================================

    detectedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    resolvedAt: {
      type: Date,
      default: null,
    },
  },

  {
    timestamps: true,
  }
);

// =====================================================
// INDEXES
// =====================================================

// Moderation history for a comment
commentModerationSchema.index({
  commentId: 1,
  detectedAt: -1,
});

// Pending moderation records
commentModerationSchema.index({
  status: 1,
  detectedAt: -1,
});

// Moderation records for a video
commentModerationSchema.index({
  videoId: 1,
  detectedAt: -1,
});

export default mongoose.model(
  "CommentModeration",
  commentModerationSchema
);