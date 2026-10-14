import mongoose from "mongoose";

const commentReportSchema = mongoose.Schema(
  {
    // =====================================================
    // COMMENT BEING REPORTED
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
    // USER WHO SUBMITTED THE REPORT
    // =====================================================

    reporterUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },

    // =====================================================
    // REPORT REASON
    // =====================================================

    reason: {
      type: String,

      enum: [
        "spam",
        "harassment",
        "offensive_content",
        "malicious_link",
        "other",
      ],

      required: true,
    },

    // =====================================================
    // OPTIONAL REPORT DETAILS
    // =====================================================

    details: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000,
    },

    // =====================================================
    // REPORT STATUS
    // =====================================================

    status: {
      type: String,

      enum: [
        "pending",
        "reviewed",
        "resolved",
        "dismissed",
      ],

      default: "pending",

      index: true,
    },

    // =====================================================
    // ADMIN / MODERATOR INFORMATION
    // =====================================================

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      default: null,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },

    moderationAction: {
      type: String,

      enum: [
        "none",
        "approved",
        "flagged",
        "blocked",
        "deleted",
      ],

      default: "none",
    },

    moderationNote: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000,
    },

    // =====================================================
    // REPORT TIMESTAMP
    // =====================================================

    reportedAt: {
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

// Reports for a particular comment
commentReportSchema.index({
  commentId: 1,
  reportedAt: -1,
});

// Reports submitted by a particular user
commentReportSchema.index({
  reporterUserId: 1,
  reportedAt: -1,
});

// Pending reports for moderation
commentReportSchema.index({
  status: 1,
  reportedAt: -1,
});

// =====================================================
// DUPLICATE REPORT PREVENTION
// =====================================================

/*
  The same user should not be able to submit the same
  report repeatedly for the same comment and reason.

  We will also validate this in the controller later.
*/

commentReportSchema.index(
  {
    commentId: 1,
    reporterUserId: 1,
    reason: 1,
  },
  {
    unique: true,
  }
);

export default mongoose.model(
  "CommentReport",
  commentReportSchema
);