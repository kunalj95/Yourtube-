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

export default function HistoryContent() {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useUser();

  useEffect(() => {
    if (user) {
      loadHistory();
    } else {
      setHistory([]);
      setLoading(false);
    }
  }, [user]);

  const loadHistory = async () => {
    if (!user) return;

    setLoading(true);

    try {
      const historyData = await axiosInstance.get(`/history/${user._id}`);

      const validHistory = Array.isArray(historyData.data)
        ? historyData.data.filter(
            (item: any) => item && item.videoid
          )
        : [];

      setHistory(validHistory);
    } catch (error) {
      console.error("Error loading history:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveFromHistory = async (historyId: string) => {
    try {
      console.log("Removing from history:", historyId);

      // Keep the existing UI behavior.
      // The backend removal request can be added after checking its route.
      setHistory((previousHistory) =>
        previousHistory.filter((item) => item._id !== historyId)
      );
    } catch (error) {
      console.error("Error removing from history:", error);
    }
  };

  if (!user) {
    return (
      <div className="text-center py-12">
        <Clock className="w-16 h-16 mx-auto text-gray-400 mb-4" />
        <h2 className="text-xl font-semibold mb-2">
          Keep track of what you watch
        </h2>
        <p className="text-gray-600">
          Watch history isn't viewable when signed out.
        </p>
      </div>
    );
  }

  if (loading) {
    return <div>Loading history...</div>;
  }

  if (history.length === 0) {
    return (
      <div className="text-center py-12">
        <Clock className="w-16 h-16 mx-auto text-gray-400 mb-4" />
        <h2 className="text-xl font-semibold mb-2">
          No watch history yet
        </h2>
        <p className="text-gray-600">
          Videos you watch will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-600">
          {history.length} videos
        </p>
      </div>

      <div className="space-y-4">
        {history.map((item) => {
          const video = item.videoid;

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

          const videoTitle =
            video.videotitle || video.title || "Untitled video";

          const views = Number(video.views) || 0;

          const videoDate = video.createdAt
            ? new Date(video.createdAt)
            : null;

          const historyDate = item.createdAt
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
                  {videoDate &&
                    !Number.isNaN(videoDate.getTime()) && (
                      <>
                        {" • "}
                        {formatDistanceToNow(videoDate)} ago
                      </>
                    )}
                </p>

                {historyDate &&
                  !Number.isNaN(historyDate.getTime()) && (
                    <p className="text-xs text-gray-500 mt-1">
                      Added {formatDistanceToNow(historyDate)} ago
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
                    onClick={() => handleRemoveFromHistory(item._id)}
                  >
                    <X className="w-4 h-4 mr-2" />
                    Remove from watch history
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
