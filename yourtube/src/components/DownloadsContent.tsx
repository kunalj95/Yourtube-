import React, { useEffect, useState } from "react";
import axiosInstance from "@/lib/axiosinstance";
import { useUser } from "@/lib/AuthContext";

interface DownloadVideo {
  _id: string;
  videotitle: string;
  filename: string;
  filepath: string;
  filesize: string;
}

interface DownloadRecord {
  _id: string;
  videoId: DownloadVideo;
  downloadDate: string;
  status: "pending" | "completed" | "failed";
  fileSize: string;
  subscriptionPlan: string;
}

interface DownloadResponse {
  subscriptionPlan: string;
  downloadLimit: number;
  downloadsUsed: number;
  remainingDownloads: number;
  downloads: DownloadRecord[];
}

interface DownloadsContentProps {
  userId?: string;
}

const DownloadsContent = ({
  userId,
}: DownloadsContentProps) => {
  const [downloadData, setDownloadData] =
    useState<DownloadResponse | null>(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  // -----------------------------------------
  // Get Firebase token
  // -----------------------------------------

  const authContext = useUser() || {};

  const firebaseToken =
    authContext.firebaseToken;

  useEffect(() => {
    const fetchDownloadHistory =
      async () => {
        // -----------------------------------------
        // 1. Check user ID
        // -----------------------------------------

        if (!userId) {
          setLoading(false);
          return;
        }

        // -----------------------------------------
        // 2. Wait for Firebase token
        // -----------------------------------------

        if (!firebaseToken) {
          setLoading(true);
          return;
        }

        try {
          setLoading(true);
          setError("");

          // -----------------------------------------
          // 3. Send Firebase token
          // -----------------------------------------

          const response =
            await axiosInstance.get(
              `/download/history/${userId}`,
              {
                headers: {
                  Authorization:
                    `Bearer ${firebaseToken}`,
                },
              }
            );

          setDownloadData(
            response.data
          );

        } catch (error: any) {
          console.error(
            "Error fetching download history:",
            error
          );

          // -----------------------------------------
          // Handle authentication error
          // -----------------------------------------

          if (
            error?.response?.status === 401
          ) {
            setError(
              "Authentication is still loading. Please refresh and try again."
            );
          } else {
            setError(
              "Unable to load download history."
            );
          }

        } finally {
          setLoading(false);
        }
      };

    fetchDownloadHistory();

  }, [userId, firebaseToken]);

  // -----------------------------------------
  // Loading
  // -----------------------------------------

  if (loading) {
    return (
      <div className="px-4 py-8">
        <p className="text-gray-600">
          Loading downloads...
        </p>
      </div>
    );
  }

  // -----------------------------------------
  // Error
  // -----------------------------------------

  if (error) {
    return (
      <div className="px-4 py-8">
        <p className="text-red-500">
          {error}
        </p>
      </div>
    );
  }

  // -----------------------------------------
  // No user
  // -----------------------------------------

  if (!userId) {
    return (
      <div className="px-4 py-8">
        <p className="text-gray-600">
          Please sign in to view your downloads.
        </p>
      </div>
    );
  }

  // -----------------------------------------
  // No download data
  // -----------------------------------------

  if (!downloadData) {
    return (
      <div className="px-4 py-8">
        <p className="text-gray-600">
          No download information available.
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 pb-8">

      {/* =====================================
          DOWNLOAD SUMMARY
      ===================================== */}

      <div className="mb-6 rounded-lg border p-4">
        <h2 className="text-xl font-semibold mb-3">
          Downloads
        </h2>

        <div className="flex flex-wrap gap-6 text-sm">

          <div>
            <p className="text-gray-500">
              Subscription
            </p>

            <p className="font-medium">
              {downloadData.subscriptionPlan}
            </p>
          </div>

          <div>
            <p className="text-gray-500">
              Daily Limit
            </p>

            <p className="font-medium">
              {downloadData.downloadLimit}
            </p>
          </div>

          <div>
            <p className="text-gray-500">
              Used Today
            </p>

            <p className="font-medium">
              {downloadData.downloadsUsed}
            </p>
          </div>

          <div>
            <p className="text-gray-500">
              Remaining Today
            </p>

            <p className="font-medium">
              {downloadData.remainingDownloads}
            </p>
          </div>

        </div>
      </div>

      {/* =====================================
          DOWNLOAD LIST
      ===================================== */}

      {downloadData.downloads.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-gray-500">
            You haven't downloaded any videos yet.
          </p>
        </div>
      ) : (
        <div className="space-y-4">

          {downloadData.downloads.map(
            (download) => {

              const video =
                download.videoId;

              // -----------------------------------------
              // Convert Windows filepath to URL path
              // -----------------------------------------

              const videoPath =
                video?.filepath
                  ? video.filepath.replace(
                      /\\/g,
                      "/"
                    )
                  : "";

              const baseURL =
                axiosInstance.defaults.baseURL ||
                "http://localhost:5000";

              const videoURL =
                videoPath
                  ? `${baseURL.replace(
                      /\/$/,
                      ""
                    )}/${videoPath}`
                  : "";

              return (
                <div
                  key={download._id}
                  className="flex gap-4 border rounded-lg p-4"
                >

                  {/* =================================
                      VIDEO PREVIEW
                  ================================= */}

                  <div className="w-56 h-32 flex-shrink-0 bg-gray-100 rounded-md overflow-hidden">

                    {videoURL ? (
                      <video
                        src={videoURL}
                        muted
                        playsInline
                        preload="metadata"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-sm text-gray-500">
                        No preview
                      </div>
                    )}

                  </div>

                  {/* =================================
                      DOWNLOAD INFORMATION
                  ================================= */}

                  <div className="flex-1 min-w-0">

                    <h3 className="font-semibold text-lg">
                      {video?.videotitle ||
                        "Video unavailable"}
                    </h3>

                    <p className="text-sm text-gray-500 mt-1">
                      Downloaded:{" "}
                      {new Date(
                        download.downloadDate
                      ).toLocaleString()}
                    </p>

                    <p className="text-sm text-gray-500 mt-1">
                      File size:{" "}
                      {download.fileSize ||
                        "Unknown"}
                    </p>

                    <p className="text-sm text-gray-500 mt-1">
                      Plan used:{" "}
                      {download.subscriptionPlan}
                    </p>

                    <p className="text-sm mt-2">
                      Status:{" "}
                      <span className="font-medium">
                        {download.status}
                      </span>
                    </p>

                  </div>

                </div>
              );
            }
          )}

        </div>
      )}

    </div>
  );
};

export default DownloadsContent;