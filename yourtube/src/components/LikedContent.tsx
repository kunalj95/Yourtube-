"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { MoreVertical, X, ThumbsUp, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUser } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";

export default function LikedVideosContent() {
  const [likedVideos, setLikedVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useUser();

  useEffect(() => {
    if (user) {
      loadLikedVideos();
    } else {
      setLikedVideos([]);
      setLoading(false);
    }
  }, [user]);

  const loadLikedVideos = async () => {
    if (!user) return;

    setLoading(true);

    try {
      const likedData = await axiosInstance.get(`/like/${user._id}`);

      const validLikedVideos = Array.isArray(likedData.data)
        ? likedData.data.filter(
            (item: any) => item && item.videoid
          )
        : [];

      setLikedVideos(validLikedVideos);
    } catch (error) {
      console.error("Error loading liked videos:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleUnlikeVideo = async (
    videoId: string,
    likedVideoId: string
  ) => {
    if (!user) return;

    try {
      // Update the UI only after the backend request succeeds.
      // The exact API endpoint must match your existing backend route.
      await axiosInstance.delete(`/like/${likedVideoId}`);

      setLikedVideos((previousVideos) =>
        previousVideos.filter((item) => item._id !== likedVideoId)
      );
    } catch (error) {
      console.error("Error unliking video:", error);
    }
  };

  if (!user) {
    return (
      <div className="text-center py-12">
        <ThumbsUp className="w-16 h-16 mx-auto text-gray-400 mb-4" />

        <h2 className="text-xl font-semibold mb-2">
          Keep track of videos you like
        </h2>

        <p className="text-gray-600">
          Sign in to see your liked videos.
        </p>
      </div>
    );
  }

  if (loading) {
    return <div>Loading liked videos...</div>;
  }

  if (likedVideos.length === 0) {
    return (
      <div className="text-center py-12">
        <ThumbsUp className="w-16 h-16 mx-auto text-gray-400 mb-4" />

        <h2 className="text-xl font-semibold mb-2">
          No liked videos yet
        </h2>

        <p className="text-gray-600">
          Videos you like will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-600">
          {likedVideos.length} videos
        </p>

        <Button
          className="flex items-center gap-2"
          onClick={() => {
            const firstVideo = likedVideos.find(
              (item) => item.videoid?._id
            );

            if (firstVideo) {
              window.location.href = `/watch/${firstVideo.videoid._id}`;
            }
          }}
        >
          <Play className="w-4 h-4" />
          Play all
        </Button>
      </div>

      <div className="space-y-4">
        {likedVideos.map((item) => {
          const video = item.videoid;

          // Defensive check in case a record changes after loading.
          if (!video || !video._id) {
            return null;
          }

          const videoUrl =
            typeof video.filepath === "string" &&
            video.filepath.startsWith("http")
              ? video.filepath
              : video.filepath
                ? `${process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000"}/${video.filepath.replace(/^\/+/, "").replace(/\\/g, "/")}`
                : "";

          const videoTitle = video.videotitle || video.title || "Untitled video";
          const views = Number(video.views) || 0;
          const videoDate = video.createdAt
            ? new Date(video.createdAt)
            : null;
          const likedDate = item.createdAt
            ? new Date(item.createdAt)
            : null;

          return (
            <div
              key={item._id}
              className="flex gap-4 group"
            >
              {/* Video thumbnail */}
              <Link
                href={`/watch/${video._id}`}
                className="flex-shrink-0"
              >
                <div className="relative w-40 aspect-video bg-gray-100 rounded overflow-hidden">
                  {videoUrl ? (
                    <video
                      src={videoUrl}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      preload="metadata"
                      muted
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-500">
                      <Play className="w-8 h-8" />
                    </div>
                  )}
                </div>
              </Link>

              {/* Video information */}
              <div className="flex-1 min-w-0">
                <Link href={`/watch/${video._id}`}>
                  <h3 className="font-medium text-sm line-clamp-2 group-hover:text-blue-600 mb-1">
                    {videoTitle}
                  </h3>
                </Link>

                <p className="text-sm text-gray-600">
                  {video.videochanel || "Unknown channel"}
                </p>

                <p className="text-sm text-gray-600">
                  {views.toLocaleString()} views
                  {videoDate && !Number.isNaN(videoDate.getTime()) && (
                    <>
                      {" • "}
                      {formatDistanceToNow(videoDate)} ago
                    </>
                  )}
                </p>

                {likedDate && !Number.isNaN(likedDate.getTime()) && (
                  <p className="text-xs text-gray-500 mt-1">
                    Liked {formatDistanceToNow(likedDate)} ago
                  </p>
                )}
              </div>

              {/* More options */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 group-hover:opacity-100"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() =>
                      handleUnlikeVideo(video._id, item._id)
                    }
                  >
                    <X className="w-4 h-4 mr-2" />
                    Remove from liked videos
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        })}
      </div>
    </div>
  );
}
