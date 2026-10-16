"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { MoreVertical, X, Clock, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import axiosInstance from "@/lib/axiosinstance";
import { useUser } from "@/lib/AuthContext";

export default function WatchLaterContent() {
  const [watchLater, setWatchLater] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useUser();

  useEffect(() => {
    if (user) {
      loadWatchLater();
    } else {
      setWatchLater([]);
      setLoading(false);
    }
  }, [user]);

  const loadWatchLater = async () => {
    if (!user) return;

    setLoading(true);

    try {
      const watchLaterData = await axiosInstance.get(`/watch/${user._id}`);

      const validVideos = Array.isArray(watchLaterData.data)
        ? watchLaterData.data.filter(
            (item: any) => item && item.videoid
          )
        : [];

      setWatchLater(validVideos);
    } catch (error) {
      console.error("Error loading watch later videos:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveFromWatchLater = async (watchLaterId: string) => {
    try {
      console.log("Removing from watch later:", watchLaterId);

      // Preserve the existing UI behavior.
      // Connect the backend request after verifying its actual route.
      setWatchLater((previousVideos) =>
        previousVideos.filter((item) => item._id !== watchLaterId)
      );
    } catch (error) {
      console.error("Error removing from watch later:", error);
    }
  };

  if (!user) {
    return (
      <div className="text-center py-12">
        <Clock className="w-16 h-16 mx-auto text-gray-400 mb-4" />
        <h2 className="text-xl font-semibold mb-2">
          Save videos for later
        </h2>
        <p className="text-gray-600">
          Sign in to access your Watch later playlist.
        </p>
      </div>
    );
  }

  if (loading) {
    return <div>Loading watch later...</div>;
  }

  if (watchLater.length === 0) {
    return (
      <div className="text-center py-12">
        <Clock className="w-16 h-16 mx-auto text-gray-400 mb-4" />
        <h2 className="text-xl font-semibold mb-2">
          No videos saved
        </h2>
        <p className="text-gray-600">
          Videos you save for later will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-600">
          {watchLater.length} videos
        </p>

        <Button
          className="flex items-center gap-2"
          onClick={() => {
            const firstVideo = watchLater.find(
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
        {watchLater.map((item) => {
          const video = item.videoid;

          if (!video || !video._id) {
            return null;
          }

          const videoUrl =
            typeof video.filepath === "string" &&
            /^https?:\/\//i.test(video.filepath)
              ? video.filepath
              : video.filepath
                ? `${process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000"}/${video.filepath.replace(/^\/+/, "").replace(/\\/g, "/")}`
                : "";

          const videoTitle =
            video.videotitle || video.title || "Untitled video";

          const views = Number(video.views) || 0;

          const videoDate = video.createdAt
            ? new Date(video.createdAt)
            : null;

          const savedDate = item.createdAt
            ? new Date(item.createdAt)
            : null;

          return (
            <div key={item._id} className="flex gap-4 group">
              <Link
                href={`/watch/${video._id}`}
                className="flex-shrink-0"
              >
                <div className="relative w-40 aspect-video bg-gray-100 rounded overflow-hidden flex items-center justify-center">
                  {videoUrl ? (
                    <video
                      src={videoUrl}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      preload="metadata"
                      muted
                    />
                  ) : (
                    <Play className="w-8 h-8 text-gray-500" />
                  )}
                </div>
              </Link>

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

                {savedDate && !Number.isNaN(savedDate.getTime()) && (
                  <p className="text-xs text-gray-500 mt-1">
                    Added {formatDistanceToNow(savedDate)} ago
                  </p>
                )}
              </div>

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
                    onClick={() => handleRemoveFromWatchLater(item._id)}
                  >
                    <X className="w-4 h-4 mr-2" />
                    Remove from Watch later
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
