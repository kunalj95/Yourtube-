import React, { useEffect, useState } from "react";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Button } from "./ui/button";
import {
  Clock,
  Download,
  MoreHorizontal,
  Share,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useUser } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";

const VideoInfo = ({ video }: any) => {
  const [likes, setlikes] = useState(video.Like || 0);
  const [dislikes, setDislikes] = useState(video.Dislike || 0);
  const [isLiked, setIsLiked] = useState(false);
  const [isDisliked, setIsDisliked] = useState(false);
  const [showFullDescription, setShowFullDescription] =
    useState(false);

  const authContext = useUser() || {};

  const user = authContext.user;
  const firebaseToken = authContext.firebaseToken;

  const [isWatchLater, setIsWatchLater] = useState(false);

  // -----------------------------------------
  // Download states
  // -----------------------------------------

  const [downloading, setDownloading] =
    useState(false);

  const [downloadMessage, setDownloadMessage] =
    useState("");

  useEffect(() => {
    setlikes(video.Like || 0);
    setDislikes(video.Dislike || 0);
    setIsLiked(false);
    setIsDisliked(false);
  }, [video]);

  useEffect(() => {
    const handleviews = async () => {
      if (user) {
        try {
          return await axiosInstance.post(
            `/history/${video._id}`,
            {
              userId: user?._id,
            }
          );
        } catch (error) {
          return console.log(error);
        }
      } else {
        return await axiosInstance.post(
          `/history/views/${video?._id}`
        );
      }
    };

    handleviews();
  }, [user, video]);

  const handleLike = async () => {
    if (!user) return;

    try {
      const res =
        await axiosInstance.post(
          `/like/${video._id}`,
          {
            userId: user?._id,
          }
        );

      if (res.data.liked) {
        if (isLiked) {
          setlikes(
            (prev: any) => prev - 1
          );

          setIsLiked(false);
        } else {
          setlikes(
            (prev: any) => prev + 1
          );

          setIsLiked(true);

          if (isDisliked) {
            setDislikes(
              (prev: any) => prev - 1
            );

            setIsDisliked(false);
          }
        }
      }
    } catch (error) {
      console.log(error);
    }
  };

  const handleWatchLater = async () => {
    try {
      const res =
        await axiosInstance.post(
          `/watch/${video._id}`,
          {
            userId: user?._id,
          }
        );

      if (res.data.watchlater) {
        setIsWatchLater(
          !isWatchLater
        );
      } else {
        setIsWatchLater(false);
      }
    } catch (error) {
      console.log(error);
    }
  };

  const handleDislike = async () => {
    if (!user) return;

    try {
      const res =
        await axiosInstance.post(
          `/like/${video._id}`,
          {
            userId: user?._id,
          }
        );

      if (!res.data.liked) {
        if (isDisliked) {
          setDislikes(
            (prev: any) => prev - 1
          );

          setIsDisliked(false);
        } else {
          setDislikes(
            (prev: any) => prev + 1
          );

          setIsDisliked(true);

          if (isLiked) {
            setlikes(
              (prev: any) => prev - 1
            );

            setIsLiked(false);
          }
        }
      }
    } catch (error) {
      console.log(error);
    }
  };

  // -----------------------------------------
  // HANDLE VIDEO DOWNLOAD
  // -----------------------------------------

  const handleDownload = async () => {
    console.log(
      "DOWNLOAD BUTTON CLICKED"
    );

    setDownloadMessage("");

    // -----------------------------------------
    // 1. Check user login
    // -----------------------------------------

    if (!user?._id) {
      setDownloadMessage(
        "Please sign in to download videos."
      );

      return;
    }

    // -----------------------------------------
    // 2. Check Firebase authentication token
    // -----------------------------------------

    if (!firebaseToken) {
      setDownloadMessage(
        "Authentication is still loading. Please try again."
      );

      return;
    }

    // -----------------------------------------
    // 3. Check video ID
    // -----------------------------------------

    if (!video?._id) {
      setDownloadMessage(
        "Video ID is not available."
      );

      return;
    }

    try {
      setDownloading(true);

      // -----------------------------------------
      // 4. Request download authorization
      // -----------------------------------------

      const response =
        await axiosInstance.post(
          "/download/request",
          {
            userId: user._id,
            videoId: video._id,
          },
          {
            headers: {
              Authorization:
                `Bearer ${firebaseToken}`,
            },
          }
        );

      console.log(
        "Download authorization response:",
        response.data
      );

      // -----------------------------------------
      // 5. Get download ID
      //    and download token
      // -----------------------------------------

      const downloadId =
        response.data?.downloadId;

      const downloadToken =
        response.data?.downloadToken;

      if (!downloadId) {
        setDownloadMessage(
          "Download authorization failed."
        );

        return;
      }

      if (!downloadToken) {
        setDownloadMessage(
          "Download token was not generated."
        );

        return;
      }

      // -----------------------------------------
      // 6. Create actual download URL
      // -----------------------------------------

      const baseURL =
        axiosInstance.defaults.baseURL ||
        "http://localhost:5000";

      const downloadURL =
        `${baseURL.replace(
          /\/$/,
          ""
        )}/download/${downloadId}?token=${encodeURIComponent(
          downloadToken
        )}`;

      console.log(
        "Starting download:",
        downloadURL
      );

      // -----------------------------------------
      // 7. Start actual download
      // -----------------------------------------

      window.location.href =
        downloadURL;

    } catch (error: any) {
      const status =
        error?.response?.status;

      const message =
        error?.response?.data?.message ||
        "Unable to download this video.";

      // -----------------------------------------
      // Expected restrictions
      // -----------------------------------------

      if (
        status === 409 ||
        status === 403 ||
        status === 401
      ) {
        setDownloadMessage(
          message
        );

        return;
      }

      // -----------------------------------------
      // Unexpected errors
      // -----------------------------------------

      console.error(
        "Download error:",
        error
      );

      setDownloadMessage(
        message
      );

    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">
        {video.videotitle}
      </h1>

      <div className="flex items-center justify-between">

        <div className="flex items-center gap-4">

          <Avatar className="w-10 h-10">
            <AvatarFallback>
              {video.videochanel[0]}
            </AvatarFallback>
          </Avatar>

          <div>
            <h3 className="font-medium">
              {video.videochanel}
            </h3>

            <p className="text-sm text-gray-600">
              1.2M subscribers
            </p>
          </div>

          <Button className="ml-4">
            Subscribe
          </Button>

        </div>

        <div className="flex items-center gap-2">

          <div className="flex items-center bg-gray-100 rounded-full">

            <Button
              variant="ghost"
              size="sm"
              className="rounded-l-full"
              onClick={handleLike}
            >
              <ThumbsUp
                className={`w-5 h-5 mr-2 ${
                  isLiked
                    ? "fill-black text-black"
                    : ""
                }`}
              />

              {likes.toLocaleString()}
            </Button>

            <div className="w-px h-6 bg-gray-300" />

            <Button
              variant="ghost"
              size="sm"
              className="rounded-r-full"
              onClick={handleDislike}
            >
              <ThumbsDown
                className={`w-5 h-5 mr-2 ${
                  isDisliked
                    ? "fill-black text-black"
                    : ""
                }`}
              />

              {dislikes.toLocaleString()}
            </Button>

          </div>

          <Button
            variant="ghost"
            size="sm"
            className={`bg-gray-100 rounded-full ${
              isWatchLater
                ? "text-primary"
                : ""
            }`}
            onClick={handleWatchLater}
          >
            <Clock className="w-5 h-5 mr-2" />

            {isWatchLater
              ? "Saved"
              : "Watch Later"}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="bg-gray-100 rounded-full"
          >
            <Share className="w-5 h-5 mr-2" />
            Share
          </Button>

          {/* -----------------------------------------
              DOWNLOAD BUTTON
          ----------------------------------------- */}

          <Button
            variant="ghost"
            size="sm"
            className="bg-gray-100 rounded-full"
            onClick={handleDownload}
            disabled={downloading}
          >
            <Download className="w-5 h-5 mr-2" />

            {downloading
              ? "Preparing..."
              : "Download"}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="bg-gray-100 rounded-full"
          >
            <MoreHorizontal className="w-5 h-5" />
          </Button>

        </div>

      </div>

      {/* -----------------------------------------
          Download message
      ----------------------------------------- */}

      {downloadMessage && (
        <p className="text-sm text-red-500">
          {downloadMessage}
        </p>
      )}

      <div className="bg-gray-100 rounded-lg p-4">

        <div className="flex gap-4 text-sm font-medium mb-2">

          <span>
            {video.views.toLocaleString()} views
          </span>

          <span>
            {formatDistanceToNow(
              new Date(video.createdAt)
            )}{" "}
            ago
          </span>

        </div>

        <div
          className={`text-sm ${
            showFullDescription
              ? ""
              : "line-clamp-3"
          }`}
        >
          <p>
            Sample video description. This
            would contain the actual video
            description from the database.
          </p>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="mt-2 p-0 h-auto font-medium"
          onClick={() =>
            setShowFullDescription(
              !showFullDescription
            )
          }
        >
          {showFullDescription
            ? "Show less"
            : "Show more"}
        </Button>

      </div>
    </div>
  );
};

export default VideoInfo;