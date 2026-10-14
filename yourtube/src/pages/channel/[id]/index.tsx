import ChannelHeader from "@/components/ChannelHeader";
import Channeltabs from "@/components/Channeltabs";
import ChannelVideos from "@/components/ChannelVideos";
import DownloadsContent from "@/components/DownloadsContent";
import VideoUploader from "@/components/VideoUploader";
import { useUser } from "@/lib/AuthContext";
import { useRouter } from "next/router";
import React, { useEffect, useState } from "react";
import axiosInstance from "@/lib/axiosinstance";

const index = () => {
  const router = useRouter();
  const { id } = router.query;
  const { user } = useUser();

  const [videos, setVideos] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState("videos");

  useEffect(() => {
    const fetchVideos = async () => {
      try {
        const res = await axiosInstance.get("/video/getall");
        setVideos(res.data);
      } catch (error) {
        console.error("Error fetching videos:", error);
      }
    };

    fetchVideos();
  }, []);

  try {
    let channel = user;

    return (
      <div className="flex-1 min-h-screen bg-white">
        <div className="max-w-full mx-auto">
          <ChannelHeader channel={channel} user={user} />

          <Channeltabs onTabChange={setActiveTab} />

          {/* -----------------------------------------
              Videos Tab
          ----------------------------------------- */}

          {activeTab === "videos" && (
            <>
              <div className="px-4 pb-8">
                <VideoUploader
                  channelId={id}
                  channelName={channel?.channelname}
                />
              </div>

              <div className="px-4 pb-8">
                <ChannelVideos videos={videos} />
              </div>
            </>
          )}

          {/* -----------------------------------------
              Downloads Tab
          ----------------------------------------- */}

          {activeTab === "downloads" && (
            <DownloadsContent userId={user?._id} />
          )}
        </div>
      </div>
    );
  } catch (error) {
    console.error("Error fetching channel data:", error);
  }
};

export default index;