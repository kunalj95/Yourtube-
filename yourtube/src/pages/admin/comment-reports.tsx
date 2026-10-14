
import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";

import { useUser } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";

interface CommentReport {
  _id: string;

  commentId?: {
    _id?: string;
    commentbody?: string;
    usercommented?: string;
    userimage?: string;
    commentedon?: string;
    moderationStatus?: string;
  };

  videoId?: {
    _id?: string;
    videotitle?: string;
  };

  reporterUserId?: {
    _id?: string;
    name?: string;
    email?: string;
    image?: string;
    channelname?: string;
  };

  reviewedBy?: {
    _id?: string;
    name?: string;
    email?: string;
  };

  reason: string;
  details?: string;
  status: string;
  moderationAction?: string;
  moderationNote?: string;
  reportedAt?: string;
  reviewedAt?: string;
}

type ModerationAction =
  | "approved"
  | "flagged"
  | "blocked"
  | "deleted"
  | "dismissed";

type ReportFilter =
  | "pending"
  | "resolved"
  | "dismissed"
  | "all";

const CommentReports = () => {
  const { user, firebaseToken, authLoading } = useUser();
  const router = useRouter();

  const [reports, setReports] = useState<CommentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [processingReportId, setProcessingReportId] =
    useState<string | null>(null);

  const [selectedStatus, setSelectedStatus] =
    useState<ReportFilter>("pending");

  // =====================================================
  // ADMIN ACCESS CONTROL
  // =====================================================

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user || !firebaseToken) {
      router.replace("/");
      return;
    }

    if (user.role !== "admin") {
      router.replace("/");
    }
  }, [authLoading, user, firebaseToken, router]);

  // =====================================================
  // LOAD COMMENT REPORTS
  // =====================================================

  const loadReports = async (status: ReportFilter) => {
    try {
      setLoading(true);
      setError("");

      if (!user?._id || !firebaseToken) {
        setError(
          "Please sign in to access comment reports."
        );
        return;
      }

      const response = await axiosInstance.get(
        `/comment/reports?status=${status}`,
        {
          headers: {
            Authorization: `Bearer ${firebaseToken}`,
          },
        }
      );

      setReports(response.data?.reports || []);
    } catch (error: any) {
      console.error("Load comment reports error:", error);

      const message =
        error?.response?.data?.message ||
        "Unable to load comment reports.";

      setError(message);
    } finally {
      setLoading(false);
    }
  };

  // =====================================================
  // LOAD REPORTS WHEN AUTHENTICATION OR FILTER CHANGES
  // =====================================================

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (
      user?.role === "admin" &&
      user?._id &&
      firebaseToken
    ) {
      loadReports(selectedStatus);
    }
  }, [
    authLoading,
    user?._id,
    user?.role,
    firebaseToken,
    selectedStatus,
  ]);

  // =====================================================
  // UPDATE COMMENT REPORT
  // =====================================================

  const handleModerationAction = async (
    reportId: string,
    action: ModerationAction
  ) => {
    try {
      if (!firebaseToken) {
        setError("Authentication token is not available.");
        return;
      }

      // Confirm actions that change comment visibility.
      if (action === "blocked" || action === "deleted") {
        const actionName =
          action === "blocked" ? "block" : "delete";

        const confirmed = window.confirm(
          `Are you sure you want to ${actionName} this comment?`
        );

        if (!confirmed) {
          return;
        }
      }

      setProcessingReportId(reportId);
      setError("");

      await axiosInstance.patch(
        `/comment/reports/${reportId}`,
        { action },
        {
          headers: {
            Authorization: `Bearer ${firebaseToken}`,
          },
        }
      );

      // Reload the selected filter so the displayed list
      // reflects the updated report status.
      await loadReports(selectedStatus);
    } catch (error: any) {
      console.error("Comment moderation error:", error);

      const message =
        error?.response?.data?.message ||
        "Unable to update the comment report.";

      setError(message);
    } finally {
      setProcessingReportId(null);
    }
  };

  // =====================================================
  // AUTHENTICATION / ADMIN CHECK
  // =====================================================

  if (authLoading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">
          Comment Reports
        </h1>
        <p>Checking admin access...</p>
      </div>
    );
  }

  if (!user || !firebaseToken || user.role !== "admin") {
    return null;
  }

  // =====================================================
  // REPORT FILTERS
  // =====================================================

  const filters: { label: string; value: ReportFilter }[] = [
    { label: "Pending", value: "pending" },
    { label: "Resolved", value: "resolved" },
    { label: "Dismissed", value: "dismissed" },
    { label: "All Reports", value: "all" },
  ];

  const pageTitle =
    selectedStatus === "all"
      ? "All Comment Reports"
      : selectedStatus === "pending"
        ? "Pending Comment Reports"
        : selectedStatus === "resolved"
          ? "Resolved Comment Reports"
          : "Dismissed Comment Reports";

  const emptyMessage =
    selectedStatus === "all"
      ? "There are currently no comment reports."
      : selectedStatus === "pending"
        ? "There are currently no pending comment reports."
        : selectedStatus === "resolved"
          ? "There are currently no resolved comment reports."
          : "There are currently no dismissed comment reports.";

  // =====================================================
  // REPORTS PAGE
  // =====================================================

  return (
    <div className="p-6">
      {/* PAGE HEADER */}

      <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">
            Comment Reports
          </h1>

          <p className="text-sm text-gray-500 mt-1">
            Review and manage reported comments
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="border rounded-lg px-4 py-2">
            <span className="font-semibold">
              {reports.length}
            </span>

            <span className="ml-2 text-sm">
              {selectedStatus === "all"
                ? "Reports"
                : selectedStatus.charAt(0).toUpperCase() +
                  selectedStatus.slice(1)}
            </span>
          </div>

          <button
            type="button"
            onClick={() => loadReports(selectedStatus)}
            disabled={loading}
            className="border rounded-lg px-4 py-2 text-sm disabled:opacity-50"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* REPORT FILTERS */}

      <div className="flex flex-wrap gap-2 mb-6">
        {filters.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => setSelectedStatus(filter.value)}
            disabled={
              loading && selectedStatus === filter.value
            }
            className={`border rounded-lg px-4 py-2 text-sm ${
              selectedStatus === filter.value
                ? "bg-gray-900 text-white border-gray-900"
                : "hover:bg-gray-100 hover:text-gray-900"
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* ACTION ERROR */}

      {error && (
        <div className="border rounded-lg p-4 mb-4">
          <p>{error}</p>
        </div>
      )}

      {/* LOADING */}

      {loading && (
        <div className="border rounded-lg p-6 mb-4">
          <p>Loading reports...</p>
        </div>
      )}

      {/* REPORT LIST */}

      {!loading && reports.length === 0 && !error && (
        <div className="border rounded-lg p-8 text-center">
          <h2 className="text-lg font-semibold">
            No reports found
          </h2>

          <p className="text-sm text-gray-500 mt-2">
            {emptyMessage}
          </p>
        </div>
      )}

      <div className="space-y-4">
        {reports.map((report) => (
          <div
            key={report._id}
            className="border rounded-lg p-5"
          >
            {/* COMMENT */}

            <div className="mb-4">
              <p className="text-xs text-gray-500 mb-1">
                Reported Comment
              </p>

              <p className="font-medium">
                {report.commentId?.commentbody ||
                  "Comment content unavailable."}
              </p>
            </div>

            {/* COMMENT AUTHOR */}

            <div className="mb-4">
              <p className="text-xs text-gray-500 mb-1">
                Comment Author
              </p>

              <p>
                {report.commentId?.usercommented ||
                  "Unknown user"}
              </p>
            </div>

            {/* REPORTER */}

            <div className="mb-4">
              <p className="text-xs text-gray-500 mb-1">
                Reported By
              </p>

              <p>
                {report.reporterUserId?.name ||
                  "Unknown user"}
              </p>

              {report.reporterUserId?.email && (
                <p className="text-sm text-gray-500">
                  {report.reporterUserId.email}
                </p>
              )}
            </div>

            {/* REASON */}

            <div className="mb-4">
              <p className="text-xs text-gray-500 mb-1">
                Reason
              </p>

              <span className="inline-block border rounded px-3 py-1 text-sm">
                {report.reason}
              </span>
            </div>

            {/* DETAILS */}

            {report.details && (
              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-1">
                  Additional Details
                </p>

                <p>{report.details}</p>
              </div>
            )}

            {/* VIDEO */}

            {report.videoId?.videotitle && (
              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-1">
                  Video
                </p>

                <p>{report.videoId.videotitle}</p>
              </div>
            )}

            {/* REPORT STATUS */}

            <div className="flex flex-wrap justify-between items-center gap-4 pt-4 border-t">
              <div>
                <p className="text-xs text-gray-500">
                  Status
                </p>

                <p className="font-semibold">
                  {report.status}
                </p>
              </div>

              <div>
                <p className="text-xs text-gray-500">
                  Reported
                </p>

                <p className="text-sm">
                  {report.reportedAt
                    ? new Date(
                        report.reportedAt
                      ).toLocaleString()
                    : "Unknown"}
                </p>
              </div>
            </div>

            {/* MODERATION HISTORY */}

            {report.status !== "pending" && (
              <div className="mt-4 border-t pt-4">
                <p className="text-xs text-gray-500 mb-2">
                  Moderation History
                </p>

                <p className="text-sm">
                  <span className="font-medium">
                    Action:
                  </span>{" "}
                  {report.moderationAction || "Unknown"}
                </p>

                {report.reviewedBy?.name && (
                  <p className="text-sm mt-1">
                    <span className="font-medium">
                      Reviewed by:
                    </span>{" "}
                    {report.reviewedBy.name}
                  </p>
                )}

                {report.reviewedAt && (
                  <p className="text-sm mt-1">
                    <span className="font-medium">
                      Reviewed:
                    </span>{" "}
                    {new Date(
                      report.reviewedAt
                    ).toLocaleString()}
                  </p>
                )}

                {report.moderationNote && (
                  <p className="text-sm mt-1">
                    <span className="font-medium">
                      Moderation note:
                    </span>{" "}
                    {report.moderationNote}
                  </p>
                )}
              </div>
            )}

            {/* MODERATION ACTIONS */}

            {report.status === "pending" && (
              <div className="pt-4 mt-4 border-t">
                <p className="text-xs text-gray-500 mb-3">
                  Moderation Actions
                </p>

                <div className="flex flex-wrap gap-2">
                  {/* APPROVE */}

                  <button
                    type="button"
                    disabled={
                      processingReportId === report._id
                    }
                    onClick={() =>
                      handleModerationAction(
                        report._id,
                        "approved"
                      )
                    }
                    className="border rounded px-3 py-2 text-sm disabled:opacity-50"
                  >
                    {processingReportId === report._id
                      ? "Processing..."
                      : "Approve"}
                  </button>

                  {/* FLAG */}

                  <button
                    type="button"
                    disabled={
                      processingReportId === report._id
                    }
                    onClick={() =>
                      handleModerationAction(
                        report._id,
                        "flagged"
                      )
                    }
                    className="border rounded px-3 py-2 text-sm disabled:opacity-50"
                  >
                    Flag
                  </button>

                  {/* BLOCK */}

                  <button
                    type="button"
                    disabled={
                      processingReportId === report._id
                    }
                    onClick={() =>
                      handleModerationAction(
                        report._id,
                        "blocked"
                      )
                    }
                    className="border rounded px-3 py-2 text-sm disabled:opacity-50"
                  >
                    Block
                  </button>

                  {/* DELETE */}

                  <button
                    type="button"
                    disabled={
                      processingReportId === report._id
                    }
                    onClick={() =>
                      handleModerationAction(
                        report._id,
                        "deleted"
                      )
                    }
                    className="border rounded px-3 py-2 text-sm disabled:opacity-50"
                  >
                    Delete
                  </button>

                  {/* DISMISS */}

                  <button
                    type="button"
                    disabled={
                      processingReportId === report._id
                    }
                    onClick={() =>
                      handleModerationAction(
                        report._id,
                        "dismissed"
                      )
                    }
                    className="border rounded px-3 py-2 text-sm disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default CommentReports;
