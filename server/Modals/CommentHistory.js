import mongoose from "mongoose";

const commentHistorySchema = mongoose.Schema(
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
    // USER WHOSE COMMENT IS INVOLVED
    // =====================================================

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },

    // =====================================================
    // USER WHO PERFORMED THE ACTION
    // =====================================================

    actorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },

    // =====================================================
    // ACTION
    // =====================================================

    action: {
      type: String,

      enum: [
        "created",
        "edited",
        "deleted",
        "restored",
        "blocked",
        "flagged",
        "moderated",
      ],

      required: true,
      index: true,
    },

    // =====================================================
    // COMMENT CONTENT SNAPSHOT
    // =====================================================

    /*
      For an edit:

      oldCommentBody = text before edit
      newCommentBody = text after edit

      For creation:

      newCommentBody = original comment

      For deletion:

      oldCommentBody = comment before deletion
    */

    oldCommentBody: {
      type: String,
      default: null,
    },

    newCommentBody: {
      type: String,
      default: null,
    },

    // =====================================================
    // MODERATION INFORMATION
    // =====================================================

    reason: {
      type: String,
      default: null,
    },

    moderationStatus: {
      type: String,
      enum: [
        "none",
        "approved",
        "pending",
        "blocked",
        "flagged",
        "deleted",
      ],
      default: "none",
    },

    // =====================================================
    // ADDITIONAL INFORMATION
    // =====================================================

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // =====================================================
    // ACTION TIMESTAMP
    // =====================================================

    actionAt: {
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

// Complete history of one comment
commentHistorySchema.index({
  commentId: 1,
  actionAt: -1,
});

// History for a video
commentHistorySchema.index({
  videoId: 1,
  actionAt: -1,
});

// History created by a particular user
commentHistorySchema.index({
  userId: 1,
  actionAt: -1,
});

export default mongoose.model(
  "CommentHistory",
  commentHistorySchema
);