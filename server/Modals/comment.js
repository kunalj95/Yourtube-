import mongoose from "mongoose";

const commentschema = mongoose.Schema(
  {
    // =====================================================
    // EXISTING COMMENT INFORMATION
    // =====================================================

    userid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },

    videoid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "videofiles",
      required: true,
      index: true,
    },

    commentbody: {
      type: String,
      required: true,
      trim: true,
    },

    usercommented: {
      type: String,
      default: "Anonymous",
      trim: true,
    },

    commentedon: {
      type: Date,
      default: Date.now,
      index: true,
    },

    // =====================================================
    // USER DISPLAY INFORMATION
    // =====================================================

    /*
      These are snapshots of the information shown with
      the comment.

      Keeping them on the comment means old comments can
      continue displaying the information that existed
      when the comment was posted.
    */

    userimage: {
      type: String,
      default: "",
    },

    location: {
      city: {
        type: String,
        default: "Unknown",
      },

      state: {
        type: String,
        default: "Unknown",
      },

      country: {
        type: String,
        default: "Unknown",
      },
    },

    // =====================================================
    // LANGUAGE
    // =====================================================

    language: {
      type: String,
      default: "unknown",
      trim: true,
    },

    // =====================================================
    // REPLIES
    // =====================================================

    /*
      null = top-level comment

      ObjectId = reply to another comment
    */

    parentCommentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "comment",
      default: null,
      index: true,
    },

    // =====================================================
    // MENTIONS
    // =====================================================

    /*
      Stores the IDs of users mentioned using @username.
    */

    mentions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
      },
    ],

    // =====================================================
    // COMMENT ENGAGEMENT
    // =====================================================

    /*
      These are counters.

      Individual user reactions will be stored separately
      later so one user cannot repeatedly increase the
      same count.
    */

    likeCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    dislikeCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // =====================================================
    // EDIT INFORMATION
    // =====================================================

    isEdited: {
      type: Boolean,
      default: false,
    },

    editedAt: {
      type: Date,
      default: null,
    },

    /*
      The controller will calculate this using a
      configurable edit time limit.
    */

    editDeadline: {
      type: Date,
      default: null,
      index: true,
    },

    // =====================================================
    // MODERATION
    // =====================================================

    moderationStatus: {
      type: String,

      enum: [
        "approved",
        "pending",
        "blocked",
        "flagged",
        "deleted",
      ],

      default: "approved",

      index: true,
    },

    moderationReason: {
      type: String,
      default: null,
    },

    // =====================================================
    // SOFT DELETE
    // =====================================================

    /*
      Comments will be soft-deleted instead of physically
      removed from MongoDB.

      This allows:
      - comment history
      - moderation records
      - replies to remain intact
    */

    deletedAt: {
      type: Date,
      default: null,
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

// Comments for a video, newest first
commentschema.index({
  videoid: 1,
  createdAt: -1,
});

// Replies belonging to a parent comment
commentschema.index({
  parentCommentId: 1,
  createdAt: 1,
});

// Moderation lookup
commentschema.index({
  moderationStatus: 1,
  createdAt: -1,
});

export default mongoose.model(
  "comment",
  commentschema
);