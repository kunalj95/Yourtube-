import mongoose from "mongoose";

const commentReactionSchema = mongoose.Schema(
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
    // USER WHO REACTED
    // =====================================================

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },

    // =====================================================
    // REACTION TYPE
    // =====================================================

    reaction: {
      type: String,

      enum: [
        "like",
        "dislike",
      ],

      required: true,
    },

    // =====================================================
    // REACTION TIMESTAMP
    // =====================================================

    reactedAt: {
      type: Date,
      default: Date.now,
    },
  },

  {
    timestamps: true,
  }
);

// =====================================================
// INDEXES
// =====================================================

// Quickly find reactions for a comment
commentReactionSchema.index({
  commentId: 1,
});

// Quickly find reactions made by a user
commentReactionSchema.index({
  userId: 1,
});

// =====================================================
// ONE REACTION PER USER PER COMMENT
// =====================================================

/*
  A user can have only one reaction on a comment.

  Example:

  user A → comment 1 → like ✅

  user A → comment 1 → like again ❌

  user A → comment 1 → dislike ✅
  (the controller will change the existing reaction)
*/

commentReactionSchema.index(
  {
    commentId: 1,
    userId: 1,
  },
  {
    unique: true,
  }
);

export default mongoose.model(
  "CommentReaction",
  commentReactionSchema
);