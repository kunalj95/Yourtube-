import Comments from "@/components/Comments";
import RelatedVideos from "@/components/RelatedVideos";
import VideoInfo from "@/components/VideoInfo";
import VideoPlayer from "@/components/Videoplayer";
import axiosInstance from "@/lib/axiosinstance";
import { useRouter } from "next/router";
import React, {
  useEffect,
  useState,
} from "react";

const Index = () => {
  const router = useRouter();
  const { id } = router.query;

  const [videos, setvideo] =
    useState<any>(null);

  const [video, setvide] =
    useState<any>(null);

  const [loading, setloading] =
    useState(true);

  useEffect(() => {
    const fetchvideo = async () => {
      // -----------------------------------------
      // Wait until router is ready
      // -----------------------------------------

      if (
        !router.isReady ||
        typeof id !== "string"
      ) {
        return;
      }

      try {
        const res =
          await axiosInstance.get(
            "/video/getall"
          );

        const selectedVideo =
          res.data?.find(
            (vid: any) =>
              vid._id === id
          );

        setvideo(
          selectedVideo || null
        );

        setvide(
          res.data
        );
      } catch (error) {
        console.log(error);
      } finally {
        setloading(false);
      }
    };

    fetchvideo();
  }, [
    router.isReady,
    id,
  ]);

  // =====================================================
  // LOADING
  // =====================================================

  if (loading) {
    return (
      <div>
        Loading..
      </div>
    );
  }

  // =====================================================
  // VIDEO NOT FOUND
  // =====================================================

  if (!videos) {
    return (
      <div>
        Video not found
      </div>
    );
  }

  // =====================================================
  // WATCH PAGE
  // =====================================================

  return (
    <div className="min-h-screen bg-white w-full">
      <div className="w-full p-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* =================================================
              MAIN VIDEO SECTION
          ================================================= */}

          <div className="lg:col-span-2 space-y-4">
            <VideoPlayer
              key={videos._id}
              video={videos}
            />

            <VideoInfo
              video={videos}
            />

            <Comments
              videoId={id as string}
            />
          </div>

          {/* =================================================
              RELATED VIDEOS
          ================================================= */}

          <div className="space-y-4">
            <RelatedVideos
              videos={video}
            />
          </div>

        </div>
      </div>
    </div>
  );
};

export default Index;