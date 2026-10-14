
import mongoose from "mongoose";

import CommentReport from "../Modals/CommentReport.js";

import comment from "../Modals/comment.js";

// =====================================================
// HELPERS
// =====================================================

const getAuthenticatedUserId = (req) => {
  return req.securityUserId || null;
};

const isValidCommentId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

// =====================================================
// REPORT COMMENT
// =====================================================

export const reportComment = async (req, res) => {
  try {
    // =================================================
    // AUTHENTICATION
    // =================================================

    const authenticatedUserId =
      getAuthenticatedUserId(req);

    if (!authenticatedUserId) {
      return res.status(401).json({
        message: "Security session is required.",
      });
    }

    // =================================================
    // COMMENT ID
    // =================================================

    const { id: commentId } = req.params;

    if (!commentId || !isValidCommentId(commentId)) {
      return res.status(400).json({
        message: "Invalid comment ID.",
      });
    }

    // =================================================
    // REQUEST DATA
    // =================================================

    const {
      reason,
      details = "",
    } = req.body;

    // =================================================
    // VALIDATE REASON
    // =================================================

    const allowedReasons = [
      "spam",
      "harassment",
      "offensive_content",
      "malicious_link",
      "other",
    ];

    if (!allowedReasons.includes(reason)) {
      return res.status(400).json({
        message: "Invalid report reason.",
      });
    }

    // =================================================
    // VALIDATE DETAILS
    // =================================================

    if (typeof details !== "string") {
      return res.status(400).json({
        message: "Report details must be text.",
      });
    }

    const trimmedDetails = details.trim();

    if (trimmedDetails.length > 1000) {
      return res.status(400).json({
        message:
          "Report details cannot exceed 1000 characters.",
      });
    }

    // =================================================
    // FIND COMMENT
    // =================================================

    const existingComment = await comment.findOne({
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
          "Comment not found or is no longer available.",
      });
    }

    // =================================================
    // CHECK DUPLICATE REPORT
    // =================================================

    const existingReport = await CommentReport.findOne({
      commentId,
      reporterUserId: authenticatedUserId,
      reason,
    });

    if (existingReport) {
      return res.status(409).json({
        message:
          "You have already reported this comment for this reason.",
      });
    }

    // =================================================
    // CREATE REPORT
    // =================================================

    const newReport = await CommentReport.create({
      commentId,

      videoId: existingComment.videoid,

      reporterUserId: authenticatedUserId,

      reason,

      details: trimmedDetails,

      status: "pending",

      moderationAction: "none",

      reportedAt: new Date(),
    });

    // =================================================
    // SUCCESS
    // =================================================

    return res.status(201).json({
      report: true,

      message: "Comment reported successfully.",

      data: newReport,
    });

  } catch (error) {
    console.error(
      "Report comment error:",
      error
    );

    // =================================================
    // DUPLICATE INDEX ERROR
    // =================================================

    if (error?.code === 11000) {
      return res.status(409).json({
        message:
          "You have already reported this comment for this reason.",
      });
    }

    return res.status(500).json({
      message:
        "Something went wrong while reporting the comment.",
    });
  }
};

// =====================================================
// GET COMMENT REPORTS
// =====================================================

export const getCommentReports = async (req, res) => {
  try {
    // =================================================
    // GET REPORT STATUS
    // =================================================

    const {
      status = "pending",
    } = req.query;

    // =================================================
    // VALIDATE STATUS
    // =================================================

    const allowedStatuses = [
      "pending",
      "reviewed",
      "resolved",
      "dismissed",
      "all",
    ];

    if (
      typeof status !== "string" ||
      !allowedStatuses.includes(status)
    ) {
      return res.status(400).json({
        message: "Invalid report status.",
      });
    }

    // =================================================
    // BUILD REPORT QUERY
    // =================================================

    // "all" returns reports of every status.
    // Other values filter reports by the requested status.
    // If status is omitted, it defaults to "pending".

    const reportQuery =
      status === "all"
        ? {}
        : { status };

    // =================================================
    // FIND REPORTS
    // =================================================

    const reports = await CommentReport.find(
      reportQuery
    )
      .populate(
        "commentId"
      )
      .populate(
        "reporterUserId",
        "name email image channelname"
      )
      .populate(
        "videoId",
        "videotitle"
      )
      .populate(
        "reviewedBy",
        "name email"
      )
      .sort({
        reportedAt: -1,
      });

    // =================================================
    // SUCCESS
    // =================================================

    return res.status(200).json({
      reports,
      count: reports.length,
    });

  } catch (error) {
    console.error(
      "Get comment reports error:",
      error
    );

    return res.status(500).json({
      message:
        "Something went wrong while fetching comment reports.",
    });
  }
};

// =====================================================
// UPDATE COMMENT REPORT
// ADMIN MODERATION ACTION
// =====================================================

export const updateCommentReport = async (
  req,
  res
) => {
  try {
    // =================================================
    // AUTHENTICATION
    // =================================================

    const authenticatedUserId =
      getAuthenticatedUserId(req);

    if (!authenticatedUserId) {
      return res.status(401).json({
        message: "Security session is required.",
      });
    }

    // =================================================
    // REPORT ID
    // =================================================

    const {
      id: reportId,
    } = req.params;

    if (
      !reportId ||
      !mongoose.Types.ObjectId.isValid(reportId)
    ) {
      return res.status(400).json({
        message: "Invalid report ID.",
      });
    }

    // =================================================
    // REQUEST DATA
    // =================================================

    const {
      action,
      moderationNote = "",
    } = req.body;

    // =================================================
    // VALIDATE ACTION
    // =================================================

    const allowedActions = [
      "approved",
      "flagged",
      "blocked",
      "deleted",
      "dismissed",
    ];

    if (!allowedActions.includes(action)) {
      return res.status(400).json({
        message: "Invalid moderation action.",
      });
    }

    // =================================================
    // VALIDATE MODERATION NOTE
    // =================================================

    if (
      typeof moderationNote !== "string"
    ) {
      return res.status(400).json({
        message:
          "Moderation note must be text.",
      });
    }

    const trimmedModerationNote =
      moderationNote.trim();

    if (
      trimmedModerationNote.length > 1000
    ) {
      return res.status(400).json({
        message:
          "Moderation note cannot exceed 1000 characters.",
      });
    }

    // =================================================
    // FIND REPORT
    // =================================================

    const existingReport =
      await CommentReport.findById(
        reportId
      );

    if (!existingReport) {
      return res.status(404).json({
        message:
          "Comment report not found.",
      });
    }

    // =================================================
    // FIND COMMENT
    // =================================================

    const existingComment =
      await comment.findById(
        existingReport.commentId
      );

    if (!existingComment) {
      return res.status(404).json({
        message:
          "Reported comment not found.",
      });
    }

    // =================================================
    // APPLY COMMENT MODERATION
    // =================================================

    if (action === "approved") {
      existingComment.moderationStatus =
        "approved";

      existingComment.deletedAt =
        null;

      await existingComment.save();
    }

    // =================================================
    // FLAG COMMENT
    // =================================================

    if (action === "flagged") {
      // The comment remains visible.
      // The report itself will be marked as resolved.
    }

    // =================================================
    // BLOCK COMMENT
    // =================================================

    if (action === "blocked") {
      existingComment.moderationStatus =
        "blocked";

      await existingComment.save();
    }

    // =================================================
    // DELETE COMMENT
    // =================================================

    if (action === "deleted") {
      existingComment.moderationStatus =
        "deleted";

      existingComment.deletedAt =
        new Date();

      await existingComment.save();
    }

    // =================================================
    // DISMISS REPORT
    // =================================================

    if (action === "dismissed") {
      // The comment remains unchanged.
    }

    // =================================================
    // UPDATE REPORT
    // =================================================

    existingReport.reviewedBy =
      authenticatedUserId;

    existingReport.reviewedAt =
      new Date();

    existingReport.moderationAction =
      action === "dismissed"
        ? "none"
        : action;

    existingReport.moderationNote =
      trimmedModerationNote;

    // =================================================
    // UPDATE REPORT STATUS
    // =================================================

    if (action === "dismissed") {
      existingReport.status =
        "dismissed";
    } else {
      existingReport.status =
        "resolved";
    }

    await existingReport.save();

    // =================================================
    // SUCCESS
    // =================================================

    return res.status(200).json({
      report: true,

      message:
        "Comment report updated successfully.",

      data: existingReport,
    });

  } catch (error) {
    console.error(
      "Update comment report error:",
      error
    );

    return res.status(500).json({
      message:
        "Something went wrong while updating the comment report.",
    });
  }
};
