import mongoose from "mongoose";

import comment from "../Modals/comment.js";
import CommentReaction from "../Modals/CommentReaction.js";

// =====================================================
// HELPERS
// =====================================================

// -----------------------------------------
// Get authenticated user ID
// -----------------------------------------

const getAuthenticatedUserId = (req) => {
  return req.securityUserId || null;
};

// -----------------------------------------
// Validate ObjectId
// -----------------------------------------

const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

// =====================================================
// ADD / CHANGE / REMOVE REACTION
// =====================================================

export const reactToComment = async (
  req,
  res
) => {
  const {
    id: commentId,
  } = req.params;

  const {
    reaction,
  } = req.body;

  try {
    // -----------------------------------------
    // Authentication
    // -----------------------------------------

    const userId =
      getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({
        message:
          "Security session is required.",
      });
    }

    // -----------------------------------------
    // Validate comment ID
    // -----------------------------------------

    if (
      !isValidObjectId(
        commentId
      )
    ) {
      return res.status(400).json({
        message:
          "Invalid comment ID.",
      });
    }

    // -----------------------------------------
    // Validate reaction
    // -----------------------------------------

    if (
      !["like", "dislike"].includes(
        reaction
      )
    ) {
      return res.status(400).json({
        message:
          "Invalid reaction type.",
      });
    }

    // -----------------------------------------
    // Check comment
    // -----------------------------------------

    const existingComment =
      await comment.findOne({
        _id: commentId,

        deletedAt: null,

        moderationStatus: {
          $nin: [
            "blocked",
            "deleted",
          ],
        },
      });

    if (!existingComment) {
      return res.status(404).json({
        message:
          "Comment not found.",
      });
    }

    // -----------------------------------------
    // Check user's existing reaction
    // -----------------------------------------

    const existingReaction =
      await CommentReaction.findOne({
        commentId,

        userId,
      });

    // =================================================
    // CASE 1
    // Same reaction clicked again
    // =================================================

    if (
      existingReaction &&
      existingReaction.reaction ===
        reaction
    ) {
      await CommentReaction.deleteOne({
        _id:
          existingReaction._id,
      });

      // -----------------------------------------
      // Remove reaction count
      // -----------------------------------------

      if (
        reaction === "like"
      ) {
        existingComment.likeCount =
          Math.max(
            0,
            existingComment.likeCount -
              1
          );
      } else {
        existingComment.dislikeCount =
          Math.max(
            0,
            existingComment.dislikeCount -
              1
          );
      }

      await existingComment.save();

      return res.status(200).json({
        success:
          true,

        action:
          "removed",

        reaction:
          null,

        likeCount:
          existingComment.likeCount,

        dislikeCount:
          existingComment.dislikeCount,
      });
    }

    // =================================================
    // CASE 2
    // Change like → dislike
    // or dislike → like
    // =================================================

    if (existingReaction) {
      const previousReaction =
        existingReaction.reaction;

      existingReaction.reaction =
        reaction;

      existingReaction.reactedAt =
        new Date();

      await existingReaction.save();

      // -----------------------------------------
      // Like → Dislike
      // -----------------------------------------

      if (
        previousReaction ===
          "like" &&
        reaction ===
          "dislike"
      ) {
        existingComment.likeCount =
          Math.max(
            0,
            existingComment.likeCount -
              1
          );

        existingComment.dislikeCount +=
          1;
      }

      // -----------------------------------------
      // Dislike → Like
      // -----------------------------------------

      if (
        previousReaction ===
          "dislike" &&
        reaction ===
          "like"
      ) {
        existingComment.dislikeCount =
          Math.max(
            0,
            existingComment.dislikeCount -
              1
          );

        existingComment.likeCount +=
          1;
      }

      await existingComment.save();

      return res.status(200).json({
        success:
          true,

        action:
          "changed",

        reaction,

        likeCount:
          existingComment.likeCount,

        dislikeCount:
          existingComment.dislikeCount,
      });
    }

    // =================================================
    // CASE 3
    // First reaction
    // =================================================

    await CommentReaction.create({
      commentId,

      videoId:
        existingComment.videoid,

      userId,

      reaction,

      reactedAt:
        new Date(),
    });

    // -----------------------------------------
    // Update count
    // -----------------------------------------

    if (
      reaction === "like"
    ) {
      existingComment.likeCount +=
        1;
    } else {
      existingComment.dislikeCount +=
        1;
    }

    await existingComment.save();

    return res.status(200).json({
      success:
        true,

      action:
        "added",

      reaction,

      likeCount:
        existingComment.likeCount,

      dislikeCount:
        existingComment.dislikeCount,
    });
  } catch (error) {
    console.error(
      "Comment reaction error:",
      error
    );

    return res.status(500).json({
      message:
        "Something went wrong",
    });
  }
};

// =====================================================
// GET USER REACTION + COUNTS
// =====================================================

export const getCommentReaction =
  async (
    req,
    res
  ) => {
    const {
      id: commentId,
    } = req.params;

    try {
      // -----------------------------------------
      // Authentication
      // -----------------------------------------

      const userId =
        getAuthenticatedUserId(
          req
        );

      if (!userId) {
        return res.status(401).json({
          message:
            "Security session is required.",
        });
      }

      // -----------------------------------------
      // Validate comment ID
      // -----------------------------------------

      if (
        !isValidObjectId(
          commentId
        )
      ) {
        return res.status(400).json({
          message:
            "Invalid comment ID.",
        });
      }

      // -----------------------------------------
      // Find comment
      // -----------------------------------------

      const existingComment =
        await comment.findById(
          commentId
        );

      if (
        !existingComment
      ) {
        return res.status(404).json({
          message:
            "Comment not found.",
        });
      }

      // -----------------------------------------
      // Find current user's reaction
      // -----------------------------------------

      const userReaction =
        await CommentReaction.findOne({
          commentId,

          userId,
        }).lean();

      return res.status(200).json({
        success:
          true,

        reaction:
          userReaction?.reaction ||
          null,

        likeCount:
          existingComment.likeCount ||
          0,

        dislikeCount:
          existingComment.dislikeCount ||
          0,
      });
    } catch (error) {
      console.error(
        "Get comment reaction error:",
        error
      );

      return res.status(500).json({
        message:
          "Something went wrong",
      });
    }
  };