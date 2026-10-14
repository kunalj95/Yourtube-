"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  ChangeEvent,
  MouseEvent,
} from "react";
import { useRouter } from "next/router";
import axiosInstance from "@/lib/axiosinstance";

interface VideoPlayerProps {
  video: {
    _id: string;
    videotitle: string;
    filepath: string;
    subtitleUrl?: string;
  };
}

interface SavedVideoProgress {
  currentTime: number;
  duration: number;
  percentage: number;
  completed: boolean;
  updatedAt: number;
}

interface NextVideo {
  _id: string;
  videotitle: string;
  filepath?: string;
}

interface TimelinePreview {
  visible: boolean;
  x: number;
  time: number;
}

const SPEED_OPTIONS = [
  0.5,
  1,
  1.25,
  1.5,
  2,
];

const COMPLETION_PERCENTAGE = 90;

const PROGRESS_SAVE_INTERVAL = 5000;

const CONTROLS_HIDE_DELAY = 3000;

const NEXT_VIDEO_COUNTDOWN = 5;

const PLAYER_PLAY_EVENT =
  "yourtube-video-play";

const getProgressStorageKey = (
  videoId: string
) =>
  `yourtube-video-progress-${videoId}`;

export default function VideoPlayer({
  video,
}: VideoPlayerProps) {
  const router = useRouter();

  // =====================================================
  // REFERENCES
  // =====================================================

  const videoRef =
    useRef<HTMLVideoElement>(null);

  const previewVideoRef =
    useRef<HTMLVideoElement>(null);

  const playerRef =
    useRef<HTMLDivElement>(null);

  const timelineRef =
    useRef<HTMLDivElement>(null);

  const saveProgressTimerRef =
    useRef<ReturnType<
      typeof setInterval
    > | null>(null);

  const controlsHideTimerRef =
    useRef<ReturnType<
      typeof setTimeout
    > | null>(null);

  const nextCountdownTimerRef =
    useRef<ReturnType<
      typeof setInterval
    > | null>(null);

  const hasLoadedSavedProgressRef =
    useRef(false);

  const isSeekingRef =
    useRef(false);

  const previousVolumeRef =
    useRef(1);

  // =====================================================
  // STATES
  // =====================================================

  const [isPlaying, setIsPlaying] =
    useState(false);

  const [currentTime, setCurrentTime] =
    useState(0);

  const [duration, setDuration] =
    useState(0);

  const [volume, setVolume] =
    useState(1);

  const [isMuted, setIsMuted] =
    useState(false);

  const [playbackRate, setPlaybackRate] =
    useState(1);

  const [bufferedPercent, setBufferedPercent] =
    useState(0);

  const [isLoading, setIsLoading] =
    useState(true);

  const [quality, setQuality] =
    useState("Auto");

  const [isFullscreen, setIsFullscreen] =
    useState(false);

  const [isTheaterMode, setIsTheaterMode] =
    useState(false);

  const [isPictureInPicture, setIsPictureInPicture] =
    useState(false);

  const [hasCaptions, setHasCaptions] =
    useState(false);

  const [captionsEnabled, setCaptionsEnabled] =
    useState(false);

  const [hasSavedProgress, setHasSavedProgress] =
    useState(false);

  const [isCompleted, setIsCompleted] =
    useState(false);

  const [controlsVisible, setControlsVisible] =
    useState(true);

  const [nextVideo, setNextVideo] =
    useState<NextVideo | null>(null);

  const [nextCountdown, setNextCountdown] =
    useState<number | null>(null);

  const [nextCancelled, setNextCancelled] =
    useState(false);

  const [timelinePreview, setTimelinePreview] =
    useState<TimelinePreview>({
      visible: false,
      x: 0,
      time: 0,
    });

  const [previewLoading, setPreviewLoading] =
    useState(false);

  // =====================================================
  // VIDEO URL
  // =====================================================

  const backendUrl =
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    "http://localhost:5000";

  const normalizedBackendUrl =
    backendUrl.replace(/\/$/, "");

  const normalizedFilePath =
    video?.filepath
      ?.replace(/\\/g, "/")
      .replace(/^\/+/, "");

  const videoSrc =
    `${normalizedBackendUrl}/${normalizedFilePath}`;

  // =====================================================
  // FORMAT TIME
  // =====================================================

  const formatTime = (
    time: number
  ): string => {
    if (
      !Number.isFinite(time) ||
      time < 0
    ) {
      return "0:00";
    }

    const hours =
      Math.floor(time / 3600);

    const minutes =
      Math.floor(
        (time % 3600) / 60
      );

    const seconds =
      Math.floor(time % 60);

    if (hours > 0) {
      return `${hours}:${String(
        minutes
      ).padStart(
        2,
        "0"
      )}:${String(
        seconds
      ).padStart(
        2,
        "0"
      )}`;
    }

    return `${minutes}:${String(
      seconds
    ).padStart(
      2,
      "0"
    )}`;
  };

  // =====================================================
  // SAVE PROGRESS
  // =====================================================

  const saveProgress = () => {
    const videoElement =
      videoRef.current;

    if (!videoElement) {
      return;
    }

    const currentDuration =
      videoElement.duration;

    const currentPosition =
      videoElement.currentTime;

    if (
      !Number.isFinite(
        currentDuration
      ) ||
      currentDuration <= 0 ||
      !Number.isFinite(
        currentPosition
      )
    ) {
      return;
    }

    const percentage =
      (currentPosition /
        currentDuration) *
      100;

    const completed =
      percentage >=
      COMPLETION_PERCENTAGE;

    const progress: SavedVideoProgress =
      {
        currentTime:
          currentPosition,
        duration:
          currentDuration,
        percentage,
        completed,
        updatedAt:
          Date.now(),
      };

    try {
      localStorage.setItem(
        getProgressStorageKey(
          video._id
        ),
        JSON.stringify(
          progress
        )
      );

      if (completed) {
        setIsCompleted(
          true
        );
      }
    } catch (error) {
      console.error(
        "Unable to save video progress:",
        error
      );
    }
  };

  // =====================================================
  // LOAD SAVED PROGRESS
  // =====================================================

  const loadSavedProgress = () => {
    const videoElement =
      videoRef.current;

    if (!videoElement) {
      return;
    }

    try {
      const savedData =
        localStorage.getItem(
          getProgressStorageKey(
            video._id
          )
        );

      if (!savedData) {
        return;
      }

      const savedProgress =
        JSON.parse(
          savedData
        ) as SavedVideoProgress;

      if (
        !savedProgress ||
        !Number.isFinite(
          savedProgress.currentTime
        )
      ) {
        return;
      }

      const savedTime =
        Math.max(
          0,
          savedProgress.currentTime
        );

      if (
        savedTime >=
        videoElement.duration
      ) {
        return;
      }

      videoElement.currentTime =
        savedTime;

      setCurrentTime(
        savedTime
      );

      setHasSavedProgress(
        true
      );

      setIsCompleted(
        Boolean(
          savedProgress.completed
        )
      );
    } catch (error) {
      console.error(
        "Unable to load saved video progress:",
        error
      );
    }
  };

  // =====================================================
  // CONTROLS VISIBILITY
  // =====================================================

  const clearControlsHideTimer =
    () => {
      if (
        controlsHideTimerRef.current
      ) {
        clearTimeout(
          controlsHideTimerRef.current
        );

        controlsHideTimerRef.current =
          null;
      }
    };

  const showControls = () => {
    setControlsVisible(
      true
    );

    clearControlsHideTimer();

    const videoElement =
      videoRef.current;

    if (
      videoElement &&
      !videoElement.paused
    ) {
      controlsHideTimerRef.current =
        setTimeout(() => {
          setControlsVisible(
            false
          );
        }, CONTROLS_HIDE_DELAY);
    }
  };

  const handleMouseMove = () => {
    showControls();
  };

  const handleMouseEnter = () => {
    setControlsVisible(
      true
    );
  };

  const handleMouseLeave = () => {
    const videoElement =
      videoRef.current;

    if (
      videoElement &&
      !videoElement.paused
    ) {
      clearControlsHideTimer();

      controlsHideTimerRef.current =
        setTimeout(() => {
          setControlsVisible(
            false
          );
        }, 1000);
    }
  };

  // =====================================================
  // PLAY / PAUSE
  // =====================================================

  const togglePlay =
    async () => {
      const videoElement =
        videoRef.current;

      if (!videoElement) {
        return;
      }

      showControls();

      try {
        if (
          videoElement.paused
        ) {
          await videoElement.play();
        } else {
          videoElement.pause();
        }
      } catch (error) {
        console.error(
          "Unable to play video:",
          error
        );
      }
    };

  // =====================================================
  // SEEK
  // =====================================================

  const seekBy = (
    seconds: number
  ) => {
    const videoElement =
      videoRef.current;

    if (!videoElement) {
      return;
    }

    const newTime =
      Math.min(
        Math.max(
          videoElement.currentTime +
            seconds,
          0
        ),
        videoElement.duration ||
          0
      );

    videoElement.currentTime =
      newTime;

    setCurrentTime(
      newTime
    );

    saveProgress();

    showControls();
  };

  const handleProgressChange =
    (
      event: ChangeEvent<HTMLInputElement>
    ) => {
      const videoElement =
        videoRef.current;

      if (!videoElement) {
        return;
      }

      const newTime =
        Number(
          event.target.value
        );

      videoElement.currentTime =
        newTime;

      setCurrentTime(
        newTime
      );

      saveProgress();

      showControls();
    };

  // =====================================================
  // VOLUME
  // =====================================================

  const handleVolumeChange =
    (
      event: ChangeEvent<HTMLInputElement>
    ) => {
      const videoElement =
        videoRef.current;

      if (!videoElement) {
        return;
      }

      const newVolume =
        Number(
          event.target.value
        );

      videoElement.volume =
        newVolume;

      setVolume(
        newVolume
      );

      if (newVolume > 0) {
        setIsMuted(false);

        previousVolumeRef.current =
          newVolume;
      } else {
        setIsMuted(true);
      }

      showControls();
    };

  const adjustVolume = (
    amount: number
  ) => {
    const videoElement =
      videoRef.current;

    if (!videoElement) {
      return;
    }

    const newVolume =
      Math.min(
        Math.max(
          videoElement.volume +
            amount,
          0
        ),
        1
      );

    videoElement.volume =
      newVolume;

    setVolume(
      newVolume
    );

    if (newVolume > 0) {
      setIsMuted(false);

      previousVolumeRef.current =
        newVolume;
    } else {
      setIsMuted(true);
    }

    showControls();
  };

  const toggleMute = () => {
    const videoElement =
      videoRef.current;

    if (!videoElement) {
      return;
    }

    if (
      videoElement.muted ||
      videoElement.volume === 0
    ) {
      const restoredVolume =
        previousVolumeRef.current >
        0
          ? previousVolumeRef.current
          : 1;

      videoElement.muted =
        false;

      videoElement.volume =
        restoredVolume;

      setVolume(
        restoredVolume
      );

      setIsMuted(false);
    } else {
      previousVolumeRef.current =
        videoElement.volume;

      videoElement.muted =
        true;

      setIsMuted(true);
    }

    showControls();
  };

  // =====================================================
  // PLAYBACK SPEED
  // =====================================================

  const handleSpeedChange =
    (
      event: ChangeEvent<HTMLSelectElement>
    ) => {
      const newSpeed =
        Number(
          event.target.value
        );

      const videoElement =
        videoRef.current;

      if (videoElement) {
        videoElement.playbackRate =
          newSpeed;
      }

      setPlaybackRate(
        newSpeed
      );

      showControls();
    };

  const changePlaybackSpeed =
    (
      direction:
        | "increase"
        | "decrease"
    ) => {
      const currentIndex =
        SPEED_OPTIONS.indexOf(
          playbackRate
        );

      let newIndex =
        currentIndex;

      if (
        direction ===
        "increase"
      ) {
        newIndex =
          Math.min(
            currentIndex + 1,
            SPEED_OPTIONS.length -
              1
          );
      } else {
        newIndex =
          Math.max(
            currentIndex - 1,
            0
          );
      }

      const newSpeed =
        SPEED_OPTIONS[
          newIndex
        ];

      const videoElement =
        videoRef.current;

      if (videoElement) {
        videoElement.playbackRate =
          newSpeed;
      }

      setPlaybackRate(
        newSpeed
      );

      showControls();
    };

  // =====================================================
  // FULLSCREEN
  // =====================================================

  const toggleFullscreen =
    async () => {
      const playerElement =
        playerRef.current;

      if (!playerElement) {
        return;
      }

      try {
        if (
          !document.fullscreenElement
        ) {
          await playerElement.requestFullscreen();
        } else {
          await document.exitFullscreen();
        }
      } catch (error) {
        console.error(
          "Fullscreen error:",
          error
        );
      }

      showControls();
    };

  // =====================================================
  // THEATER MODE
  // =====================================================

  const toggleTheaterMode =
    () => {
      setIsTheaterMode(
        (current) => !current
      );

      showControls();
    };

  // =====================================================
  // PICTURE-IN-PICTURE
  // =====================================================

  const togglePictureInPicture =
    async () => {
      const videoElement =
        videoRef.current;

      if (!videoElement) {
        return;
      }

      try {
        if (
          document.pictureInPictureElement
        ) {
          await document.exitPictureInPicture();

          return;
        }

        const pipVideo =
          videoElement as HTMLVideoElement & {
            requestPictureInPicture?: () =>
              Promise<unknown>;
          };

        if (
          typeof pipVideo.requestPictureInPicture ===
          "function"
        ) {
          await pipVideo.requestPictureInPicture();
        } else {
          console.error(
            "Picture-in-Picture is not supported by this browser."
          );
        }
      } catch (error) {
        console.error(
          "Picture-in-Picture error:",
          error
        );
      }

      showControls();
    };

  // =====================================================
  // CAPTIONS
  // =====================================================

  const toggleCaptions =
    () => {
      const videoElement =
        videoRef.current;

      if (
        !videoElement ||
        videoElement.textTracks.length ===
          0
      ) {
        return;
      }

      const nextState =
        !captionsEnabled;

      for (
        let index = 0;
        index <
        videoElement.textTracks.length;
        index++
      ) {
        videoElement.textTracks[
          index
        ].mode = nextState
          ? "showing"
          : "disabled";
      }

      setCaptionsEnabled(
        nextState
      );

      showControls();
    };

  // =====================================================
  // BUFFERED PROGRESS
  // =====================================================

  const updateBufferedProgress =
    () => {
      const videoElement =
        videoRef.current;

      if (
        !videoElement ||
        !videoElement.duration
      ) {
        setBufferedPercent(
          0
        );

        return;
      }

      if (
        videoElement.buffered.length ===
        0
      ) {
        setBufferedPercent(
          0
        );

        return;
      }

      const bufferedEnd =
        videoElement.buffered.end(
          videoElement.buffered.length -
            1
        );

      const percent =
        Math.min(
          (bufferedEnd /
            videoElement.duration) *
            100,
          100
        );

      setBufferedPercent(
        percent
      );
    };

  // =====================================================
  // VIDEO QUALITY
  // =====================================================

  const updateQuality = () => {
    const videoElement =
      videoRef.current;

    if (!videoElement) {
      return;
    }

    const height =
      videoElement.videoHeight;

    if (!height) {
      setQuality(
        "Auto"
      );

      return;
    }

    setQuality(
      `${height}p`
    );
  };

  // =====================================================
  // CHECK CAPTIONS
  // =====================================================

  const checkCaptions = () => {
    const videoElement =
      videoRef.current;

    if (!videoElement) {
      return;
    }

    setHasCaptions(
      videoElement.textTracks.length >
        0
    );
  };

  // =====================================================
  // VIDEO CLICK
  // =====================================================

  const handleVideoClick = () => {
    togglePlay();
  };

  // =====================================================
  // DOUBLE CLICK
  // =====================================================

  const handleVideoDoubleClick =
    () => {
      toggleFullscreen();
    };

  // =====================================================
  // FIND NEXT VIDEO
  // =====================================================

  useEffect(() => {
    let mounted = true;

    const fetchNextVideo =
      async () => {
        try {
          const response =
            await axiosInstance.get(
              "/video/getall"
            );

          if (!mounted) {
            return;
          }

          const allVideos =
            Array.isArray(
              response.data
            )
              ? response.data
              : [];

          const currentIndex =
            allVideos.findIndex(
              (item: any) =>
                item?._id ===
                video._id
            );

          let foundNextVideo:
            | any
            | null = null;

          if (
            currentIndex !== -1 &&
            currentIndex <
              allVideos.length - 1
          ) {
            foundNextVideo =
              allVideos[
                currentIndex + 1
              ];
          }

          if (
            !foundNextVideo
          ) {
            foundNextVideo =
              allVideos.find(
                (item: any) =>
                  item?._id !==
                  video._id
              );
          }

          if (
            foundNextVideo
          ) {
            setNextVideo({
              _id:
                foundNextVideo._id,
              videotitle:
                foundNextVideo.videotitle,
              filepath:
                foundNextVideo.filepath,
            });
          } else {
            setNextVideo(
              null
            );
          }
        } catch (error) {
          console.error(
            "Unable to find next video:",
            error
          );

          if (mounted) {
            setNextVideo(
              null
            );
          }
        }
      };

    fetchNextVideo();

    return () => {
      mounted = false;
    };
  }, [
    video._id,
  ]);

  // =====================================================
  // GO TO NEXT VIDEO
  // =====================================================

  const goToNextVideo = () => {
    if (!nextVideo) {
      return;
    }

    if (
      nextCountdownTimerRef.current
    ) {
      clearInterval(
        nextCountdownTimerRef.current
      );

      nextCountdownTimerRef.current =
        null;
    }

    setNextCountdown(
      null
    );

    setNextCancelled(
      false
    );

    router.push(
      `/watch/${nextVideo._id}?autoplay=1`
    );
  };

  // =====================================================
  // CANCEL NEXT VIDEO
  // =====================================================

  const cancelNextVideo =
    () => {
      if (
        nextCountdownTimerRef.current
      ) {
        clearInterval(
          nextCountdownTimerRef.current
        );

        nextCountdownTimerRef.current =
          null;
      }

      setNextCountdown(
        null
      );

      setNextCancelled(
        true
      );
    };

  // =====================================================
  // START NEXT VIDEO COUNTDOWN
  // =====================================================

  const startNextVideoCountdown =
    () => {
      if (!nextVideo) {
        return;
      }

      if (
        nextCountdownTimerRef.current
      ) {
        clearInterval(
          nextCountdownTimerRef.current
        );
      }

      setNextCancelled(
        false
      );

      setNextCountdown(
        NEXT_VIDEO_COUNTDOWN
      );
    };

  // =====================================================
  // NEXT VIDEO COUNTDOWN TIMER
  // =====================================================

  useEffect(() => {
    if (
      nextCountdown === null ||
      !nextVideo
    ) {
      return;
    }

    if (
      nextCountdown <= 0
    ) {
      goToNextVideo();

      return;
    }

    if (
      nextCountdownTimerRef.current
    ) {
      clearInterval(
        nextCountdownTimerRef.current
      );
    }

    nextCountdownTimerRef.current =
      setInterval(() => {
        setNextCountdown(
          (current) => {
            if (
              current === null
            ) {
              return null;
            }

            return current - 1;
          }
        );
      }, 1000);

    return () => {
      if (
        nextCountdownTimerRef.current
      ) {
        clearInterval(
          nextCountdownTimerRef.current
        );

        nextCountdownTimerRef.current =
          null;
      }
    };
  }, [
    nextCountdown,
    nextVideo,
  ]);

  // =====================================================
  // TIMELINE HOVER PREVIEW
  // =====================================================

  const handleTimelineMouseMove =
    (
      event: MouseEvent<HTMLDivElement>
    ) => {
      const timelineElement =
        timelineRef.current;

      if (
        !timelineElement ||
        duration <= 0
      ) {
        return;
      }

      const rect =
        timelineElement.getBoundingClientRect();

      const mouseX =
        event.clientX -
        rect.left;

      const clampedX =
        Math.min(
          Math.max(
            mouseX,
            0
          ),
          rect.width
        );

      const percentage =
        rect.width > 0
          ? clampedX /
            rect.width
          : 0;

      const previewTime =
        Math.min(
          Math.max(
            percentage *
              duration,
            0
          ),
          duration
        );

      setTimelinePreview({
        visible: true,
        x: clampedX,
        time: previewTime,
      });

      setPreviewLoading(
        true
      );
    };

  const handleTimelineMouseLeave =
    () => {
      setTimelinePreview({
        visible: false,
        x: 0,
        time: 0,
      });

      setPreviewLoading(
        false
      );
    };

  const handlePreviewLoadedMetadata =
    () => {
      const previewVideo =
        previewVideoRef.current;

      if (!previewVideo) {
        return;
      }

      if (
        timelinePreview.visible
      ) {
        try {
          const previewTime =
            Math.min(
              Math.max(
                timelinePreview.time,
                0
              ),
              previewVideo.duration ||
                duration
            );

          previewVideo.currentTime =
            previewTime;
        } catch (error) {
          console.error(
            "Unable to set preview time:",
            error
          );

          setPreviewLoading(
            false
          );
        }
      }
    };

  const handlePreviewSeeked =
    () => {
      setPreviewLoading(
        false
      );
    };

  // =====================================================
  // UPDATE PREVIEW WHEN MOUSE MOVES
  // =====================================================

  useEffect(() => {
    if (
      !timelinePreview.visible
    ) {
      return;
    }

    const previewVideo =
      previewVideoRef.current;

    if (!previewVideo) {
      return;
    }

    if (
      !Number.isFinite(
        timelinePreview.time
      )
    ) {
      return;
    }

    if (
      previewVideo.readyState >= 1
    ) {
      try {
        const maxTime =
          Number.isFinite(
            previewVideo.duration
          )
            ? previewVideo.duration
            : duration;

        const targetTime =
          Math.min(
            Math.max(
              timelinePreview.time,
              0
            ),
            maxTime || 0
          );

        previewVideo.currentTime =
          targetTime;
      } catch (error) {
        console.error(
          "Unable to update preview:",
          error
        );

        setPreviewLoading(
          false
        );
      }
    }
  }, [
    timelinePreview.time,
    timelinePreview.visible,
    duration,
  ]);

  // =====================================================
  // VIDEO EVENT EFFECT
  // =====================================================

  useEffect(() => {
    const videoElement =
      videoRef.current;

    if (!videoElement) {
      return;
    }

    hasLoadedSavedProgressRef.current =
      false;

    const handleLoadedMetadata =
      () => {
        setDuration(
          videoElement.duration ||
            0
        );

        setCurrentTime(
          videoElement.currentTime ||
            0
        );

        videoElement.volume =
          volume;

        videoElement.playbackRate =
          playbackRate;

        updateQuality();
        checkCaptions();
        updateBufferedProgress();

        if (
          !hasLoadedSavedProgressRef.current
        ) {
          loadSavedProgress();

          hasLoadedSavedProgressRef.current =
            true;
        }

        setIsLoading(
          false
        );

        // Autoplay when arriving from
        // the next-video feature.
        if (
          router.isReady &&
          router.query.autoplay ===
            "1"
        ) {
          setTimeout(() => {
            videoElement
              .play()
              .catch(
                (error) => {
                  console.log(
                    "Autoplay was blocked:",
                    error
                  );
                }
              );
          }, 100);
        }
      };

    const handleTimeUpdate =
      () => {
        const newTime =
          videoElement.currentTime;

        setCurrentTime(
          newTime
        );

        if (
          !isSeekingRef.current &&
          videoElement.duration &&
          Number.isFinite(
            videoElement.duration
          )
        ) {
          const percentage =
            (newTime /
              videoElement.duration) *
            100;

          if (
            percentage >=
            COMPLETION_PERCENTAGE
          ) {
            setIsCompleted(
              true
            );
          }
        }
      };

    const handleProgress =
      () => {
        updateBufferedProgress();
      };

    const handlePlaying =
      () => {
        setIsPlaying(
          true
        );

        setIsLoading(
          false
        );

        setControlsVisible(
          true
        );

        clearControlsHideTimer();

        controlsHideTimerRef.current =
          setTimeout(() => {
            setControlsVisible(
              false
            );
          }, CONTROLS_HIDE_DELAY);

        document.dispatchEvent(
          new CustomEvent(
            PLAYER_PLAY_EVENT,
            {
              detail: {
                videoId:
                  video._id,
              },
            }
          )
        );
      };

    const handlePlay =
      () => {
        setIsPlaying(
          true
        );

        setControlsVisible(
          true
        );

        clearControlsHideTimer();

        controlsHideTimerRef.current =
          setTimeout(() => {
            setControlsVisible(
              false
            );
          }, CONTROLS_HIDE_DELAY);

        document.dispatchEvent(
          new CustomEvent(
            PLAYER_PLAY_EVENT,
            {
              detail: {
                videoId:
                  video._id,
              },
            }
          )
        );
      };

    const handlePause =
      () => {
        setIsPlaying(
          false
        );

        setControlsVisible(
          true
        );

        clearControlsHideTimer();

        saveProgress();
      };

    const handleWaiting =
      () => {
        setIsLoading(
          true
        );

        setControlsVisible(
          true
        );
      };

    const handleCanPlay =
      () => {
        setIsLoading(
          false
        );
      };

    const handleSeeking =
      () => {
        isSeekingRef.current =
          true;
      };

    const handleSeeked =
      () => {
        isSeekingRef.current =
          false;

        saveProgress();

        showControls();
      };

    const handleEnded =
      () => {
        setIsPlaying(
          false
        );

        setCurrentTime(
          videoElement.duration
        );

        setIsCompleted(
          true
        );

        setControlsVisible(
          true
        );

        clearControlsHideTimer();

        try {
          const progress: SavedVideoProgress =
            {
              currentTime:
                videoElement.duration,
              duration:
                videoElement.duration,
              percentage: 100,
              completed: true,
              updatedAt:
                Date.now(),
            };

          localStorage.setItem(
            getProgressStorageKey(
              video._id
            ),
            JSON.stringify(
              progress
            )
          );
        } catch (error) {
          console.error(
            "Unable to save completed video:",
            error
          );
        }

        startNextVideoCountdown();
      };

    const handleVolumeUpdated =
      () => {
        setVolume(
          videoElement.volume
        );

        setIsMuted(
          videoElement.muted ||
            videoElement.volume ===
              0
        );
      };

    const handleEnterPictureInPicture =
      () => {
        setIsPictureInPicture(
          true
        );
      };

    const handleLeavePictureInPicture =
      () => {
        setIsPictureInPicture(
          false
        );
      };

    const handleOtherVideoPlay =
      (event: Event) => {
        const customEvent =
          event as CustomEvent<{
            videoId?: string;
          }>;

        const otherVideoId =
          customEvent.detail
            ?.videoId;

        if (
          otherVideoId &&
          otherVideoId !==
            video._id
        ) {
          videoElement.pause();
        }
      };

    videoElement.addEventListener(
      "loadedmetadata",
      handleLoadedMetadata
    );

    videoElement.addEventListener(
      "timeupdate",
      handleTimeUpdate
    );

    videoElement.addEventListener(
      "progress",
      handleProgress
    );

    videoElement.addEventListener(
      "playing",
      handlePlaying
    );

    videoElement.addEventListener(
      "play",
      handlePlay
    );

    videoElement.addEventListener(
      "pause",
      handlePause
    );

    videoElement.addEventListener(
      "waiting",
      handleWaiting
    );

    videoElement.addEventListener(
      "canplay",
      handleCanPlay
    );

    videoElement.addEventListener(
      "seeking",
      handleSeeking
    );

    videoElement.addEventListener(
      "seeked",
      handleSeeked
    );

    videoElement.addEventListener(
      "ended",
      handleEnded
    );

    videoElement.addEventListener(
      "volumechange",
      handleVolumeUpdated
    );

    videoElement.addEventListener(
      "enterpictureinpicture",
      handleEnterPictureInPicture
    );

    videoElement.addEventListener(
      "leavepictureinpicture",
      handleLeavePictureInPicture
    );

    document.addEventListener(
      PLAYER_PLAY_EVENT,
      handleOtherVideoPlay
    );

    return () => {
      videoElement.removeEventListener(
        "loadedmetadata",
        handleLoadedMetadata
      );

      videoElement.removeEventListener(
        "timeupdate",
        handleTimeUpdate
      );

      videoElement.removeEventListener(
        "progress",
        handleProgress
      );

      videoElement.removeEventListener(
        "playing",
        handlePlaying
      );

      videoElement.removeEventListener(
        "play",
        handlePlay
      );

      videoElement.removeEventListener(
        "pause",
        handlePause
      );

      videoElement.removeEventListener(
        "waiting",
        handleWaiting
      );

      videoElement.removeEventListener(
        "canplay",
        handleCanPlay
      );

      videoElement.removeEventListener(
        "seeking",
        handleSeeking
      );

      videoElement.removeEventListener(
        "seeked",
        handleSeeked
      );

      videoElement.removeEventListener(
        "ended",
        handleEnded
      );

      videoElement.removeEventListener(
        "volumechange",
        handleVolumeUpdated
      );

      videoElement.removeEventListener(
        "enterpictureinpicture",
        handleEnterPictureInPicture
      );

      videoElement.removeEventListener(
        "leavepictureinpicture",
        handleLeavePictureInPicture
      );

      document.removeEventListener(
        PLAYER_PLAY_EVENT,
        handleOtherVideoPlay
      );
    };
  }, [
    video._id,
    video.videotitle,
    volume,
    playbackRate,
    isCompleted,
    nextVideo,
    router.isReady,
    router.query.autoplay,
  ]);

  // =====================================================
  // PERIODIC SAVE
  // =====================================================

  useEffect(() => {
    if (
      saveProgressTimerRef.current
    ) {
      clearInterval(
        saveProgressTimerRef.current
      );
    }

    saveProgressTimerRef.current =
      setInterval(() => {
        const videoElement =
          videoRef.current;

        if (
          videoElement &&
          !videoElement.paused
        ) {
          saveProgress();
        }
      }, PROGRESS_SAVE_INTERVAL);

    return () => {
      if (
        saveProgressTimerRef.current
      ) {
        clearInterval(
          saveProgressTimerRef.current
        );

        saveProgressTimerRef.current =
          null;
      }
    };
  }, [
    video._id,
  ]);

  // =====================================================
  // SAVE ON PAGE EXIT
  // =====================================================

  useEffect(() => {
    const handleBeforeUnload =
      () => {
        saveProgress();
      };

    const handlePageHide =
      () => {
        saveProgress();
      };

    window.addEventListener(
      "beforeunload",
      handleBeforeUnload
    );

    window.addEventListener(
      "pagehide",
      handlePageHide
    );

    return () => {
      window.removeEventListener(
        "beforeunload",
        handleBeforeUnload
      );

      window.removeEventListener(
        "pagehide",
        handlePageHide
      );
    };
  }, [
    video._id,
  ]);

  // =====================================================
  // FULLSCREEN STATE
  // =====================================================

  useEffect(() => {
    const handleFullscreenChange =
      () => {
        setIsFullscreen(
          Boolean(
            document.fullscreenElement
          )
        );
      };

    document.addEventListener(
      "fullscreenchange",
      handleFullscreenChange
    );

    return () => {
      document.removeEventListener(
        "fullscreenchange",
        handleFullscreenChange
      );
    };
  }, []);

  // =====================================================
  // CLEANUP CONTROLS TIMER
  // =====================================================

  useEffect(() => {
    return () => {
      clearControlsHideTimer();
    };
  }, []);

  // =====================================================
  // CLEANUP COUNTDOWN TIMER
  // =====================================================

  useEffect(() => {
    return () => {
      if (
        nextCountdownTimerRef.current
      ) {
        clearInterval(
          nextCountdownTimerRef.current
        );

        nextCountdownTimerRef.current =
          null;
      }
    };
  }, []);

  // =====================================================
  // KEYBOARD SHORTCUTS
  // =====================================================

  useEffect(() => {
    const handleKeyDown =
      (
        event: KeyboardEvent
      ) => {
        const playerElement =
          playerRef.current;

        if (!playerElement) {
          return;
        }

        const isPlayerHovered =
          playerElement.matches(
            ":hover"
          );

        const isPlayerFocused =
          playerElement.contains(
            document.activeElement
          );

        if (
          !isPlayerHovered &&
          !isPlayerFocused
        ) {
          return;
        }

        const target =
          event.target as HTMLElement | null;

        if (!target) {
          return;
        }

        const tagName =
          target.tagName.toLowerCase();

        const isFormControl =
          tagName === "input" ||
          tagName === "select" ||
          tagName === "button" ||
          tagName === "textarea";

        if (isFormControl) {
          return;
        }

        const key =
          event.key.toLowerCase();

        // Space
        if (
          event.code === "Space"
        ) {
          event.preventDefault();

          togglePlay();

          return;
        }

        // Left arrow
        if (
          event.key ===
          "ArrowLeft"
        ) {
          event.preventDefault();

          seekBy(
            event.shiftKey
              ? -30
              : -10
          );

          return;
        }

        // Right arrow
        if (
          event.key ===
          "ArrowRight"
        ) {
          event.preventDefault();

          seekBy(
            event.shiftKey
              ? 30
              : 10
          );

          return;
        }

        // Up arrow
        if (
          event.key ===
          "ArrowUp"
        ) {
          event.preventDefault();

          adjustVolume(
            0.1
          );

          return;
        }

        // Down arrow
        if (
          event.key ===
          "ArrowDown"
        ) {
          event.preventDefault();

          adjustVolume(
            -0.1
          );

          return;
        }

        // M
        if (key === "m") {
          event.preventDefault();

          toggleMute();

          return;
        }

        // [
        if (
          event.key === "["
        ) {
          event.preventDefault();

          changePlaybackSpeed(
            "decrease"
          );

          return;
        }

        // ]
        if (
          event.key === "]"
        ) {
          event.preventDefault();

          changePlaybackSpeed(
            "increase"
          );

          return;
        }

        // P
        if (key === "p") {
          event.preventDefault();

          togglePictureInPicture();

          return;
        }

        // T
        if (key === "t") {
          event.preventDefault();

          toggleTheaterMode();

          return;
        }

        // C
        if (key === "c") {
          if (hasCaptions) {
            event.preventDefault();

            toggleCaptions();
          }

          return;
        }

        // F
        if (key === "f") {
          event.preventDefault();

          toggleFullscreen();

          return;
        }

        // N
        if (key === "n") {
          event.preventDefault();

          goToNextVideo();

          return;
        }
      };

    document.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      document.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [
    hasCaptions,
    playbackRate,
    nextVideo,
  ]);

  // =====================================================
  // CALCULATED VALUES
  // =====================================================

  const remainingTime =
    Math.max(
      duration -
        currentTime,
      0
    );

  const progressPercent =
    duration > 0
      ? (currentTime /
          duration) *
        100
      : 0;

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <div
      ref={playerRef}
      tabIndex={0}
      onMouseMove={
        handleMouseMove
      }
      onMouseEnter={
        handleMouseEnter
      }
      onMouseLeave={
        handleMouseLeave
      }
      className={`relative w-full bg-black overflow-hidden outline-none ${
        isTheaterMode
          ? "fixed inset-4 z-50 flex items-center justify-center rounded-lg shadow-2xl"
          : "aspect-video rounded-lg"
      }`}
      aria-label="Custom video player"
    >
      {/* ================================================= */}
      {/* MAIN VIDEO */}
      {/* ================================================= */}

      <video
        ref={videoRef}
        className="w-full h-full object-contain bg-black cursor-pointer select-none"
        poster="/placeholder.svg?height=480&width=854"
        playsInline
        preload="metadata"
        onClick={
          handleVideoClick
        }
        onDoubleClick={
          handleVideoDoubleClick
        }
      >
        <source
          src={videoSrc}
          type="video/mp4"
        />

        {video?.subtitleUrl && (
          <track
            kind="subtitles"
            src={video.subtitleUrl}
            srcLang="en"
            label="English"
          />
        )}

        Your browser does not support the video tag.
      </video>

      {/* ================================================= */}
      {/* LOADING */}
      {/* ================================================= */}

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-white">
            <div className="h-10 w-10 rounded-full border-4 border-white/30 border-t-white animate-spin" />

            <span className="text-sm">
              Loading...
            </span>
          </div>
        </div>
      )}

      {/* ================================================= */}
      {/* RESUME */}
      {/* ================================================= */}

      {hasSavedProgress &&
        !isPlaying &&
        currentTime > 0 &&
        !isCompleted && (
          <div className="absolute top-3 left-3 bg-black/70 text-white text-xs px-3 py-1.5 rounded">
            Resumed from{" "}
            {formatTime(
              currentTime
            )}
          </div>
        )}

      {/* ================================================= */}
      {/* COMPLETED */}
      {/* ================================================= */}

      {isCompleted && (
        <div className="absolute top-3 right-3 bg-green-600/90 text-white text-xs font-medium px-3 py-1.5 rounded">
          ✓ Completed
        </div>
      )}

      {/* ================================================= */}
      {/* NEXT VIDEO COUNTDOWN */}
      {/* ================================================= */}

      {nextCountdown !==
        null &&
        nextVideo &&
        !nextCancelled && (
          <div className="absolute left-1/2 bottom-20 -translate-x-1/2 z-30 w-[min(90%,420px)]">
            <div className="bg-black/90 backdrop-blur-sm text-white rounded-xl border border-white/10 shadow-2xl p-4">
              <div className="flex justify-between items-start gap-4">
                <div>
                  <p className="text-xs text-gray-400 mb-1">
                    UP NEXT
                  </p>

                  <h3 className="font-semibold text-sm sm:text-base">
                    {
                      nextVideo.videotitle
                    }
                  </h3>

                  {nextCountdown >
                    0 && (
                    <p className="text-xs text-gray-400 mt-1">
                      Playing in{" "}
                      <span className="text-white font-semibold">
                        {
                          nextCountdown
                        }
                      </span>{" "}
                      second
                      {nextCountdown !==
                      1
                        ? "s"
                        : ""}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={
                    cancelNextVideo
                  }
                  className="text-gray-400 hover:text-white transition text-sm"
                  aria-label="Cancel autoplay"
                  title="Cancel autoplay"
                >
                  ✕
                </button>
              </div>

              <div className="flex gap-2 mt-4">
                <button
                  type="button"
                  onClick={
                    goToNextVideo
                  }
                  className="px-4 py-2 rounded-lg bg-white text-black text-sm font-semibold hover:bg-gray-200 transition"
                >
                  Play now
                </button>

                <button
                  type="button"
                  onClick={
                    cancelNextVideo
                  }
                  className="px-4 py-2 rounded-lg bg-white/10 text-white text-sm hover:bg-white/20 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

      {/* ================================================= */}
      {/* CANCELLED */}
      {/* ================================================= */}

      {nextCancelled &&
        nextVideo && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30 bg-black/80 text-white text-sm px-4 py-2 rounded-lg">
            Autoplay cancelled
          </div>
        )}

      {/* ================================================= */}
      {/* CUSTOM CONTROLS */}
      {/* ================================================= */}

      <div
        className={`absolute left-0 right-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-3 pt-10 pb-3 transition-opacity duration-300 ${
          controlsVisible
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
      >
        {/* ================================================= */}
        {/* TIMELINE */}
        {/* ================================================= */}

        <div
          ref={timelineRef}
          className="relative w-full h-5 flex items-center group"
          onMouseMove={
            handleTimelineMouseMove
          }
          onMouseLeave={
            handleTimelineMouseLeave
          }
        >
          {/* Hover preview */}

          {timelinePreview.visible && (
            <div
              className="absolute bottom-5 z-50 -translate-x-1/2 pointer-events-none"
              style={{
                left: `${timelinePreview.x}px`,
              }}
            >
              <div className="relative w-40 h-24 bg-black rounded-md overflow-hidden border border-white/20 shadow-xl">
                <video
                  ref={previewVideoRef}
                  src={videoSrc}
                  muted
                  playsInline
                  preload="metadata"
                  className="w-full h-full object-cover"
                  onLoadedMetadata={
                    handlePreviewLoadedMetadata
                  }
                  onSeeked={
                    handlePreviewSeeked
                  }
                  aria-hidden="true"
                />

                {previewLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <div className="h-5 w-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  </div>
                )}

                <div className="absolute bottom-1 left-1 bg-black/80 text-white text-[11px] px-1.5 py-0.5 rounded">
                  {formatTime(
                    timelinePreview.time
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Timeline background */}

          <div className="absolute left-0 right-0 h-1.5 rounded-full bg-white/20 overflow-hidden">
            <div
              className="absolute top-0 left-0 h-full bg-white/30"
              style={{
                width: `${bufferedPercent}%`,
              }}
            />

            <div
              className="absolute top-0 left-0 h-full bg-red-500"
              style={{
                width: `${progressPercent}%`,
              }}
            />
          </div>

          <input
            type="range"
            min={0}
            max={duration || 0}
            step="0.1"
            value={Math.min(
              currentTime,
              duration || 0
            )}
            onChange={
              handleProgressChange
            }
            className="relative z-10 w-full appearance-none bg-transparent cursor-pointer accent-red-500"
            aria-label="Video progress"
          />
        </div>

        {/* ================================================= */}
        {/* CONTROL ROW */}
        {/* ================================================= */}

        <div className="flex items-center justify-between gap-3 text-white">
          {/* LEFT */}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={
                togglePlay
              }
              className="h-9 w-9 flex items-center justify-center rounded hover:bg-white/10 transition"
              aria-label={
                isPlaying
                  ? "Pause video"
                  : "Play video"
              }
              title={
                isPlaying
                  ? "Pause"
                  : "Play"
              }
            >
              <span className="text-lg">
                {isPlaying
                  ? "❚❚"
                  : "▶"}
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                seekBy(-10)
              }
              className="h-9 px-2 rounded hover:bg-white/10 transition text-sm"
              aria-label="Seek backward 10 seconds"
              title="Back 10 seconds"
            >
              ↶ 10
            </button>

            <button
              type="button"
              onClick={() =>
                seekBy(10)
              }
              className="h-9 px-2 rounded hover:bg-white/10 transition text-sm"
              aria-label="Seek forward 10 seconds"
              title="Forward 10 seconds"
            >
              10 ↷
            </button>

            <button
              type="button"
              onClick={
                toggleMute
              }
              className="h-9 w-9 flex items-center justify-center rounded hover:bg-white/10 transition text-lg"
              aria-label={
                isMuted
                  ? "Unmute video"
                  : "Mute video"
              }
              title={
                isMuted
                  ? "Unmute"
                  : "Mute"
              }
            >
              {isMuted
                ? "🔇"
                : "🔊"}
            </button>

            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={
                isMuted
                  ? 0
                  : volume
              }
              onChange={
                handleVolumeChange
              }
              className="w-20 accent-red-500 cursor-pointer"
              aria-label="Volume"
            />

            <div className="text-xs sm:text-sm whitespace-nowrap">
              {formatTime(
                currentTime
              )}{" "}
              /{" "}
              {formatTime(
                duration
              )}
            </div>

            <div className="hidden md:block text-xs sm:text-sm text-white/70 whitespace-nowrap">
              -
              {formatTime(
                remainingTime
              )}
            </div>
          </div>

          {/* RIGHT */}

          <div className="flex items-center gap-2">
            <select
              value={
                playbackRate
              }
              onChange={
                handleSpeedChange
              }
              className="h-8 rounded border border-white/20 bg-black/70 px-2 text-xs text-white outline-none cursor-pointer"
              aria-label="Playback speed"
              title="Playback speed"
            >
              {SPEED_OPTIONS.map(
                (speed) => (
                  <option
                    key={speed}
                    value={speed}
                    className="bg-black text-white"
                  >
                    {speed}×
                  </option>
                )
              )}
            </select>

            <div
              className="hidden sm:flex h-8 items-center rounded border border-white/20 bg-black/50 px-2 text-xs text-white/80"
              title="Video quality"
            >
              {quality}
            </div>

            {hasCaptions && (
              <button
                type="button"
                onClick={
                  toggleCaptions
                }
                className={`h-8 px-2 rounded transition text-xs ${
                  captionsEnabled
                    ? "bg-white/20"
                    : "hover:bg-white/10"
                }`}
                aria-label={
                  captionsEnabled
                    ? "Disable captions"
                    : "Enable captions"
                }
                title={
                  captionsEnabled
                    ? "Disable captions"
                    : "Enable captions"
                }
              >
                CC
              </button>
            )}

            <button
              type="button"
              onClick={
                togglePictureInPicture
              }
              className={`h-8 px-2 rounded transition text-xs ${
                isPictureInPicture
                  ? "bg-white/20"
                  : "hover:bg-white/10"
              }`}
              aria-label="Picture-in-Picture"
              title="Picture-in-Picture"
            >
              PiP
            </button>

            <button
              type="button"
              onClick={
                toggleTheaterMode
              }
              className={`h-8 px-2 rounded transition text-xs ${
                isTheaterMode
                  ? "bg-white/20"
                  : "hover:bg-white/10"
              }`}
              aria-label={
                isTheaterMode
                  ? "Exit theater mode"
                  : "Enter theater mode"
              }
              title={
                isTheaterMode
                  ? "Exit theater mode"
                  : "Theater mode"
              }
            >
              Theater
            </button>

            <button
              type="button"
              onClick={
                toggleFullscreen
              }
              className="h-8 px-2 rounded hover:bg-white/10 transition text-xs"
              aria-label={
                isFullscreen
                  ? "Exit fullscreen"
                  : "Enter fullscreen"
              }
              title={
                isFullscreen
                  ? "Exit fullscreen"
                  : "Fullscreen"
              }
            >
              {isFullscreen
                ? "Exit"
                : "Full"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}