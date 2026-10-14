"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { io, Socket } from "socket.io-client";

interface User {
  name?: string;
  image?: string;
}

interface Participant {
  socketId: string;
  user?: User;
  isHost?: boolean;
  micEnabled?: boolean;
  cameraEnabled?: boolean;
  handRaised?: boolean;
}

interface RemoteStream {
  socketId: string;
  stream: MediaStream;
}

interface ChatMessage {
  socketId: string;
  user?: User;
  message: string;
  timestamp: string;
}

interface MeetingInfo {
  roomId: string;
  hostId: string;
  startedAt: number;
  locked: boolean;
}

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "http://localhost:5000";

export default function MeetingPage() {
  const router = useRouter();
  const { roomId } = router.query;

  // =====================================================
  // REFERENCES
  // =====================================================

  const localVideoRef =
    useRef<HTMLVideoElement>(null);

  const socketRef =
    useRef<Socket | null>(null);

  const localStreamRef =
    useRef<MediaStream | null>(null);

  const screenStreamRef =
    useRef<MediaStream | null>(null);

  const cameraTrackRef =
    useRef<MediaStreamTrack | null>(null);

  const peerConnectionsRef =
    useRef<Record<string, RTCPeerConnection>>({});

  const meetingStartedRef =
    useRef(false);

  const joinedRoomRef =
    useRef(false);

  // =====================================================
  // RECONNECTION / RECOVERY REFERENCES
  // =====================================================

  const intentionalLeaveRef =
    useRef(false);

  const reconnectingRef =
    useRef(false);

  const reconnectTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  const pendingIceCandidatesRef =
    useRef<Record<string, RTCIceCandidateInit[]>>({});

  // =====================================================
  // PARTICIPANT ID
  // =====================================================

  const getParticipantId = () => {
    let participantId =
      sessionStorage.getItem(
        "yourtube-meeting-participant-id"
      );

    if (!participantId) {
      participantId = crypto.randomUUID();

      sessionStorage.setItem(
        "yourtube-meeting-participant-id",
        participantId
      );
    }

    return participantId;
  };

  // =====================================================
  // TIMER REFERENCE
  // =====================================================

  const timerIntervalRef =
    useRef<ReturnType<typeof setInterval> | null>(
      null
    );

  // =====================================================
  // DEVICE REFERENCES
  // =====================================================

  const currentCameraDeviceIdRef =
    useRef<string>("");

  const currentMicrophoneDeviceIdRef =
    useRef<string>("");

  // =====================================================
  // STATES
  // =====================================================

  const [remoteStreams, setRemoteStreams] =
    useState<RemoteStream[]>([]);

  const [participants, setParticipants] =
    useState<Participant[]>([]);

  const [micEnabled, setMicEnabled] =
    useState(true);

  const [cameraEnabled, setCameraEnabled] =
    useState(true);

  const [isScreenSharing, setIsScreenSharing] =
    useState(false);

  const [error, setError] =
    useState("");

  const [connectionStatus, setConnectionStatus] =
    useState<
      "connecting" |
      "connected" |
      "reconnecting" |
      "disconnected"
    >("connecting");

  // =====================================================
  // DEVICE STATES
  // =====================================================

  const [videoDevices, setVideoDevices] =
    useState<MediaDeviceInfo[]>([]);

  const [audioDevices, setAudioDevices] =
    useState<MediaDeviceInfo[]>([]);

  const [selectedCameraId, setSelectedCameraId] =
    useState("");

  const [selectedMicrophoneId, setSelectedMicrophoneId] =
    useState("");

  const [devicesOpen, setDevicesOpen] =
    useState(false);

  const [deviceSwitching, setDeviceSwitching] =
    useState(false);

  // =====================================================
  // PERMISSION HANDLING
  // =====================================================

  const [cameraPermission, setCameraPermission] =
    useState<
      "unknown" |
      "granted" |
      "denied" |
      "unavailable"
    >("unknown");

  const [microphonePermission, setMicrophonePermission] =
    useState<
      "unknown" |
      "granted" |
      "denied" |
      "unavailable"
    >("unknown");

  const [permissionMessage, setPermissionMessage] =
    useState("");

  const [permissionLoading, setPermissionLoading] =
    useState(false);

  // =====================================================
  // MEETING TIMER
  // =====================================================

  const [meetingDuration, setMeetingDuration] =
    useState(0);

  const [meetingStartedAt, setMeetingStartedAt] =
    useState<number | null>(null);

  // =====================================================
  // CHAT
  // =====================================================

  const [chatOpen, setChatOpen] =
    useState(false);

  const [messages, setMessages] =
    useState<ChatMessage[]>([]);

  const [messageInput, setMessageInput] =
    useState("");

  // =====================================================
  // PARTICIPANTS PANEL
  // =====================================================

  const [participantsOpen, setParticipantsOpen] =
    useState(false);

  // =====================================================
  // HAND RAISE
  // =====================================================

  const [handRaised, setHandRaised] =
    useState(false);

  const [raisedHands, setRaisedHands] =
    useState<string[]>([]);

  // =====================================================
  // HOST
  // =====================================================

  const [isHost, setIsHost] =
    useState(false);

  const [hostId, setHostId] =
    useState<string | null>(null);

  const [meetingLocked, setMeetingLocked] =
    useState(false);

  // =====================================================
  // UNIQUE PARTICIPANTS
  // =====================================================

  const uniqueParticipants = (
    list: Participant[]
  ): Participant[] => {
    const map = new Map<
      string,
      Participant
    >();

    for (const participant of list) {
      if (!participant?.socketId) continue;

      map.set(
        participant.socketId,
        participant
      );
    }

    return Array.from(map.values());
  };

  // =====================================================
  // PERMISSION ERROR HANDLER
  // =====================================================

  const getPermissionErrorMessage = (
    error: unknown,
    type: "camera" | "microphone" | "both"
  ) => {
    const mediaError =
      error as DOMException;

    const errorName =
      mediaError?.name || "";

    if (
      errorName === "NotAllowedError" ||
      errorName === "PermissionDeniedError"
    ) {
      if (type === "camera") {
        return "Camera permission was denied. Please allow camera access in your browser settings and try again.";
      }

      if (type === "microphone") {
        return "Microphone permission was denied. Please allow microphone access in your browser settings and try again.";
      }

      return "Camera and microphone permissions were denied. Please allow access in your browser settings and try again.";
    }

    if (
      errorName === "NotFoundError" ||
      errorName === "DevicesNotFoundError"
    ) {
      if (type === "camera") {
        return "No camera was found on this device.";
      }

      if (type === "microphone") {
        return "No microphone was found on this device.";
      }

      return "No camera or microphone was found on this device.";
    }

    if (
      errorName === "NotReadableError" ||
      errorName === "TrackStartError"
    ) {
      if (type === "camera") {
        return "The camera is already being used by another application.";
      }

      if (type === "microphone") {
        return "The microphone is already being used by another application.";
      }

      return "The camera or microphone is currently being used by another application.";
    }

    if (
      errorName === "OverconstrainedError"
    ) {
      return "The selected camera or microphone does not support the requested settings.";
    }

    if (
      errorName === "SecurityError"
    ) {
      return "Camera and microphone access is blocked for security reasons. Please use HTTPS or localhost and check your browser permissions.";
    }

    if (
      errorName === "TypeError"
    ) {
      return "Your browser does not support camera or microphone access.";
    }

    return "Unable to access your camera or microphone. Please check your device and browser permissions.";
  };

  // =====================================================
  // CHECK MEDIA PERMISSIONS
  // =====================================================

  const checkMediaPermissions = async () => {
    try {
      if (
        typeof navigator === "undefined" ||
        !navigator.permissions
      ) {
        return;
      }

      // -------------------------------------------------
      // CAMERA PERMISSION
      // -------------------------------------------------

      try {
        const cameraStatus =
          await navigator.permissions.query({
            name: "camera" as PermissionName,
          });

        if (
          cameraStatus.state === "granted"
        ) {
          setCameraPermission("granted");
        } else if (
          cameraStatus.state === "denied"
        ) {
          setCameraPermission("denied");
        } else {
          setCameraPermission("unknown");
        }

        cameraStatus.onchange = () => {
          if (
            cameraStatus.state ===
            "granted"
          ) {
            setCameraPermission("granted");
          } else if (
            cameraStatus.state ===
            "denied"
          ) {
            setCameraPermission("denied");
          } else {
            setCameraPermission("unknown");
          }
        };
      } catch (cameraPermissionError) {
        console.log(
          "Camera permission query not supported:",
          cameraPermissionError
        );
      }

      // -------------------------------------------------
      // MICROPHONE PERMISSION
      // -------------------------------------------------

      try {
        const microphoneStatus =
          await navigator.permissions.query({
            name: "microphone" as PermissionName,
          });

        if (
          microphoneStatus.state ===
          "granted"
        ) {
          setMicrophonePermission("granted");
        } else if (
          microphoneStatus.state ===
          "denied"
        ) {
          setMicrophonePermission("denied");
        } else {
          setMicrophonePermission("unknown");
        }

        microphoneStatus.onchange = () => {
          if (
            microphoneStatus.state ===
            "granted"
          ) {
            setMicrophonePermission("granted");
          } else if (
            microphoneStatus.state ===
            "denied"
          ) {
            setMicrophonePermission("denied");
          } else {
            setMicrophonePermission("unknown");
          }
        };
      } catch (microphonePermissionError) {
        console.log(
          "Microphone permission query not supported:",
          microphonePermissionError
        );
      }
    } catch (err) {
      console.error(
        "Permission check error:",
        err
      );
    }
  };

  // =====================================================
  // REQUEST CAMERA PERMISSION
  // =====================================================

  const requestCameraPermission = async () => {
    try {
      setPermissionLoading(true);
      setPermissionMessage("");

      const stream =
        await navigator.mediaDevices.getUserMedia(
          {
            video: true,
            audio: false,
          }
        );

      const cameraTrack =
        stream.getVideoTracks()[0];

      if (cameraTrack) {
        cameraTrack.stop();
      }

      setCameraPermission("granted");

      await updateAvailableDevices();

      setPermissionMessage(
        "Camera permission granted successfully."
      );
    } catch (err) {
      console.error(
        "Camera permission error:",
        err
      );

      const errorName =
        (err as DOMException)?.name;

      if (
        errorName === "NotAllowedError" ||
        errorName ===
        "PermissionDeniedError"
      ) {
        setCameraPermission("denied");
      } else if (
        errorName === "NotFoundError"
      ) {
        setCameraPermission("unavailable");
      }

      setPermissionMessage(
        getPermissionErrorMessage(
          err,
          "camera"
        )
      );
    } finally {
      setPermissionLoading(false);
    }
  };

  // =====================================================
  // REQUEST MICROPHONE PERMISSION
  // =====================================================

  const requestMicrophonePermission =
    async () => {
      try {
        setPermissionLoading(true);
        setPermissionMessage("");

        const stream =
          await navigator.mediaDevices.getUserMedia(
            {
              video: false,
              audio: true,
            }
          );

        const microphoneTrack =
          stream.getAudioTracks()[0];

        if (microphoneTrack) {
          microphoneTrack.stop();
        }

        setMicrophonePermission(
          "granted"
        );

        await updateAvailableDevices();

        setPermissionMessage(
          "Microphone permission granted successfully."
        );
      } catch (err) {
        console.error(
          "Microphone permission error:",
          err
        );

        const errorName =
          (err as DOMException)?.name;

        if (
          errorName === "NotAllowedError" ||
          errorName ===
          "PermissionDeniedError"
        ) {
          setMicrophonePermission(
            "denied"
          );
        } else if (
          errorName === "NotFoundError"
        ) {
          setMicrophonePermission(
            "unavailable"
          );
        }

        setPermissionMessage(
          getPermissionErrorMessage(
            err,
            "microphone"
          )
        );
      } finally {
        setPermissionLoading(false);
      }
    };

  // =====================================================
  // REQUEST BOTH PERMISSIONS
  // =====================================================

  const requestMediaPermissions =
    async () => {
      try {
        setPermissionLoading(true);
        setPermissionMessage("");

        const stream =
          await navigator.mediaDevices.getUserMedia(
            {
              video: true,
              audio: true,
            }
          );

        stream
          .getTracks()
          .forEach((track) =>
            track.stop()
          );

        setCameraPermission("granted");
        setMicrophonePermission(
          "granted"
        );

        await updateAvailableDevices();

        setPermissionMessage(
          "Camera and microphone permissions granted successfully."
        );
      } catch (err) {
        console.error(
          "Media permission error:",
          err
        );

        const errorName =
          (err as DOMException)?.name;

        if (
          errorName === "NotAllowedError" ||
          errorName ===
          "PermissionDeniedError"
        ) {
          await checkMediaPermissions();

          setPermissionMessage(
            "Camera or microphone permission was denied. You can allow the required permission and retry."
          );
        } else {
          setPermissionMessage(
            getPermissionErrorMessage(
              err,
              "both"
            )
          );
        }
      } finally {
        setPermissionLoading(false);
      }
    };

  // =====================================================
  // PERMISSION PANEL
  // =====================================================

  const permissionRequired =
    cameraPermission === "denied" ||
    microphonePermission === "denied" ||
    cameraPermission === "unavailable" ||
    microphonePermission === "unavailable";

  // =====================================================
  // FORMAT TIMER
  // =====================================================

  const formatMeetingDuration = (
    totalSeconds: number
  ) => {
    const hours =
      Math.floor(totalSeconds / 3600);

    const minutes =
      Math.floor(
        (totalSeconds % 3600) / 60
      );

    const seconds =
      totalSeconds % 60;

    const formattedHours =
      String(hours).padStart(2, "0");

    const formattedMinutes =
      String(minutes).padStart(2, "0");

    const formattedSeconds =
      String(seconds).padStart(2, "0");

    if (hours > 0) {
      return `${formattedHours}:${formattedMinutes}:${formattedSeconds}`;
    }

    return `${formattedMinutes}:${formattedSeconds}`;
  };

  // =====================================================
  // START TIMER
  // =====================================================

  const startMeetingTimer = (
    startedAt: number
  ) => {
    if (timerIntervalRef.current) {
      clearInterval(
        timerIntervalRef.current
      );
    }

    setMeetingStartedAt(
      startedAt
    );

    const updateTimer = () => {
      const elapsedMilliseconds =
        Date.now() - startedAt;

      const elapsedSeconds =
        Math.max(
          0,
          Math.floor(
            elapsedMilliseconds / 1000
          )
        );

      setMeetingDuration(
        elapsedSeconds
      );
    };

    updateTimer();

    timerIntervalRef.current =
      setInterval(
        updateTimer,
        1000
      );
  };

  // =====================================================
  // STOP TIMER
  // =====================================================

  const stopMeetingTimer = () => {
    if (
      timerIntervalRef.current
    ) {
      clearInterval(
        timerIntervalRef.current
      );

      timerIntervalRef.current =
        null;
    }
  };

  // =====================================================
  // GET AVAILABLE DEVICES
  // =====================================================

  const updateAvailableDevices = async () => {
    try {
      if (
        !navigator.mediaDevices ||
        !navigator.mediaDevices.enumerateDevices
      ) {
        return;
      }

      const devices =
        await navigator.mediaDevices.enumerateDevices();

      const cameras =
        devices.filter(
          (device) =>
            device.kind ===
            "videoinput"
        );

      const microphones =
        devices.filter(
          (device) =>
            device.kind ===
            "audioinput"
        );

      setVideoDevices(
        cameras
      );

      setAudioDevices(
        microphones
      );

      const currentVideoTrack =
        localStreamRef.current
          ?.getVideoTracks()[0];

      if (
        currentVideoTrack
      ) {
        const settings =
          currentVideoTrack.getSettings();

        if (
          settings.deviceId
        ) {
          currentCameraDeviceIdRef.current =
            settings.deviceId;

          setSelectedCameraId(
            settings.deviceId
          );
        }
      } else if (
        cameras.length > 0 &&
        !selectedCameraId
      ) {
        setSelectedCameraId(
          cameras[0].deviceId
        );
      }

      const currentAudioTrack =
        localStreamRef.current
          ?.getAudioTracks()[0];

      if (
        currentAudioTrack
      ) {
        const settings =
          currentAudioTrack.getSettings();

        if (
          settings.deviceId
        ) {
          currentMicrophoneDeviceIdRef.current =
            settings.deviceId;

          setSelectedMicrophoneId(
            settings.deviceId
          );
        }
      } else if (
        microphones.length > 0 &&
        !selectedMicrophoneId
      ) {
        setSelectedMicrophoneId(
          microphones[0].deviceId
        );
      }
    } catch (err) {
      console.error(
        "Unable to get media devices:",
        err
      );
    }
  };

  // =====================================================
  // DEVICE CHANGE LISTENER
  // =====================================================

  useEffect(() => {
    const handleDeviceChange =
      () => {
        updateAvailableDevices();
      };

    if (
      navigator.mediaDevices
    ) {
      navigator.mediaDevices.addEventListener(
        "devicechange",
        handleDeviceChange
      );
    }

    return () => {
      if (
        navigator.mediaDevices
      ) {
        navigator.mediaDevices.removeEventListener(
          "devicechange",
          handleDeviceChange
        );
      }
    };
  }, []);

  // =====================================================
  // INITIAL PERMISSION CHECK
  // =====================================================

  useEffect(() => {
    checkMediaPermissions();
  }, []);

  // =====================================================
  // START MEETING
  // =====================================================

  useEffect(() => {
    if (
      !router.isReady ||
      !roomId ||
      typeof roomId !== "string"
    ) {
      return;
    }

    if (meetingStartedRef.current) {
      return;
    }

    // Reset lifecycle flags whenever this effect starts.
    // In React/Next.js development mode, effects may run, clean up,
    // and run again. Cleanup sets intentionalLeaveRef to true, so it
    // must be reset before creating the new socket connection.
    intentionalLeaveRef.current = false;
    reconnectingRef.current = false;
    joinedRoomRef.current = false;

    meetingStartedRef.current = true;

    let mounted = true;

    // =====================================================
    // CLOSE PEER CONNECTION
    // =====================================================

    const closePeerConnection = (
      targetSocketId: string
    ) => {
      const peer =
        peerConnectionsRef.current[targetSocketId];

      if (peer) {
        peer.ontrack = null;
        peer.onicecandidate = null;
        peer.onconnectionstatechange = null;
        peer.close();

        delete peerConnectionsRef.current[
          targetSocketId
        ];
      }

      delete pendingIceCandidatesRef.current[
        targetSocketId
      ];

      setRemoteStreams((prev) =>
        prev.filter(
          (item) =>
            item.socketId !==
            targetSocketId
        )
      );
    };

    // =====================================================
    // CREATE PEER CONNECTION
    // =====================================================

    const createPeerConnection = (
      targetSocketId: string
    ): RTCPeerConnection => {
      const existing =
        peerConnectionsRef.current[
        targetSocketId
        ];

      if (existing) {
        if (
          existing.connectionState !== "closed" &&
          existing.connectionState !== "failed"
        ) {
          return existing;
        }

        closePeerConnection(targetSocketId);
      }

      const peerConnection =
        new RTCPeerConnection({
          iceServers: [
            {
              urls:
                "stun:stun.l.google.com:19302",
            },
          ],
        });

      peerConnectionsRef.current[
        targetSocketId
      ] = peerConnection;

      // =====================================================
      // ADD LOCAL TRACKS
      // =====================================================

      if (localStreamRef.current) {
        localStreamRef.current
          .getTracks()
          .forEach((track) => {
            peerConnection.addTrack(
              track,
              localStreamRef.current!
            );
          });
      }

      // =====================================================
      // REMOTE STREAM
      // =====================================================

      peerConnection.ontrack = (
        event
      ) => {
        const stream =
          event.streams[0];

        if (!stream) return;

        setRemoteStreams((prev) => {
          const exists =
            prev.some(
              (item) =>
                item.socketId ===
                targetSocketId
            );

          if (exists) {
            return prev.map(
              (item) =>
                item.socketId ===
                  targetSocketId
                  ? {
                    ...item,
                    stream,
                  }
                  : item
            );
          }

          return [
            ...prev,
            {
              socketId:
                targetSocketId,
              stream,
            },
          ];
        });
      };

      // =====================================================
      // ICE
      // =====================================================

      peerConnection.onicecandidate = (
        event
      ) => {
        if (
          event.candidate &&
          socketRef.current
        ) {
          socketRef.current.emit(
            "ice-candidate",
            {
              target:
                targetSocketId,
              candidate:
                event.candidate,
            }
          );
        }
      };

      // =====================================================
      // CONNECTION STATE
      // =====================================================

      peerConnection.onconnectionstatechange =
        () => {
          const state =
            peerConnection.connectionState;

          console.log(
            `Peer ${targetSocketId} connection state:`,
            state
          );

          if (state === "connected") {
            return;
          }

          if (
            state === "failed" ||
            state === "disconnected"
          ) {
            setRemoteStreams((prev) =>
              prev.filter(
                (item) =>
                  item.socketId !==
                  targetSocketId
              )
            );

            window.setTimeout(async () => {
              const currentPeer =
                peerConnectionsRef.current[
                targetSocketId
                ];

              if (
                currentPeer !== peerConnection ||
                !socketRef.current?.connected ||
                !mounted
              ) {
                return;
              }

              if (
                currentPeer.connectionState !==
                "failed" &&
                currentPeer.connectionState !==
                "disconnected"
              ) {
                return;
              }

              closePeerConnection(
                targetSocketId
              );

              try {
                await createOffer(
                  targetSocketId
                );
              } catch (err) {
                console.error(
                  "WebRTC recovery error:",
                  err
                );
              }
            }, 1500);
          }
        };

      return peerConnection;
    };

    // =====================================================
    // CREATE OFFER
    // =====================================================

    const createOffer = async (
      targetSocketId: string
    ) => {
      if (
        !socketRef.current ||
        targetSocketId ===
        socketRef.current.id
      ) {
        return;
      }

      try {
        const peerConnection =
          createPeerConnection(
            targetSocketId
          );

        const offer =
          await peerConnection.createOffer();

        await peerConnection.setLocalDescription(
          offer
        );

        socketRef.current.emit(
          "offer",
          {
            target:
              targetSocketId,
            offer,
          }
        );
      } catch (err) {
        console.error(
          "Error creating offer:",
          err
        );
      }
    };

    // =====================================================
    // START MEETING
    // =====================================================

    const startMeeting = async () => {
      try {
        setPermissionMessage("");

        // =====================================================
        // REQUEST CAMERA + MICROPHONE
        // =====================================================

        let stream: MediaStream;

        try {
          stream =
            await navigator.mediaDevices.getUserMedia(
              {
                video: true,
                audio: true,
              }
            );

          setCameraPermission(
            "granted"
          );

          setMicrophonePermission(
            "granted"
          );
        } catch (mediaError) {
          console.error(
            "Initial media permission error:",
            mediaError
          );

          await checkMediaPermissions();

          const errorName =
            (mediaError as DOMException)?.name;

          // -------------------------------------------------
          // CAMERA/MIC DENIED TOGETHER
          // -------------------------------------------------

          if (
            errorName ===
            "NotAllowedError" ||
            errorName ===
            "PermissionDeniedError"
          ) {
            setPermissionMessage(
              "Camera or microphone permission was denied. You can still try to allow the required permissions and retry."
            );

            // Try camera separately
            let cameraStream:
              | MediaStream
              | null = null;

            let microphoneStream:
              | MediaStream
              | null = null;

            try {
              cameraStream =
                await navigator.mediaDevices.getUserMedia(
                  {
                    video: true,
                    audio: false,
                  }
                );

              setCameraPermission(
                "granted"
              );
            } catch (cameraError) {
              console.error(
                "Camera access failed:",
                cameraError
              );

              const cameraErrorName =
                (cameraError as DOMException)
                  ?.name;

              if (
                cameraErrorName ===
                "NotAllowedError" ||
                cameraErrorName ===
                "PermissionDeniedError"
              ) {
                setCameraPermission(
                  "denied"
                );
              } else if (
                cameraErrorName ===
                "NotFoundError"
              ) {
                setCameraPermission(
                  "unavailable"
                );
              }
            }

            // Try microphone separately
            try {
              microphoneStream =
                await navigator.mediaDevices.getUserMedia(
                  {
                    video: false,
                    audio: true,
                  }
                );

              setMicrophonePermission(
                "granted"
              );
            } catch (microphoneError) {
              console.error(
                "Microphone access failed:",
                microphoneError
              );

              const microphoneErrorName =
                (
                  microphoneError as DOMException
                )?.name;

              if (
                microphoneErrorName ===
                "NotAllowedError" ||
                microphoneErrorName ===
                "PermissionDeniedError"
              ) {
                setMicrophonePermission(
                  "denied"
                );
              } else if (
                microphoneErrorName ===
                "NotFoundError"
              ) {
                setMicrophonePermission(
                  "unavailable"
                );
              }
            }

            // -------------------------------------------------
            // CREATE AVAILABLE MEDIA STREAM
            // -------------------------------------------------

            const tracks: MediaStreamTrack[] =
              [];

            if (cameraStream) {
              cameraStream
                .getVideoTracks()
                .forEach(
                  (track) =>
                    tracks.push(track)
                );
            }

            if (microphoneStream) {
              microphoneStream
                .getAudioTracks()
                .forEach(
                  (track) =>
                    tracks.push(track)
                );
            }

            if (tracks.length === 0) {
              setError(
                "No camera or microphone is available. Please allow at least one device permission to join the meeting."
              );

              setPermissionMessage(
                "Camera and microphone access are required for video/audio. Allow at least one permission and click Retry permissions."
              );

              return;
            }

            stream =
              new MediaStream(
                tracks
              );
          } else {
            setError(
              getPermissionErrorMessage(
                mediaError,
                "both"
              )
            );

            return;
          }
        }

        if (!mounted) {
          stream
            .getTracks()
            .forEach((track) =>
              track.stop()
            );

          return;
        }

        localStreamRef.current =
          stream;

        // -------------------------------------------------
        // SET CAMERA STATE
        // -------------------------------------------------

        const videoTracks =
          stream.getVideoTracks();

        const audioTracks =
          stream.getAudioTracks();

        const hasCamera =
          videoTracks.length > 0;

        const hasMicrophone =
          audioTracks.length > 0;

        setCameraEnabled(
          hasCamera
        );

        setMicEnabled(
          hasMicrophone
        );

        if (!hasCamera) {
          setCameraPermission(
            "denied"
          );
        }

        if (!hasMicrophone) {
          setMicrophonePermission(
            "denied"
          );
        }

        // -------------------------------------------------
        // LOCAL VIDEO
        // -------------------------------------------------

        if (localVideoRef.current) {
          localVideoRef.current.srcObject =
            stream;
        }

        // -------------------------------------------------
        // DEVICE LIST
        // -------------------------------------------------

        await updateAvailableDevices();

        // =====================================================
        // SOCKET
        // =====================================================

        const socket =
          io(BACKEND_URL, {
            transports: [
              "websocket",
              "polling",
            ],
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 10000,
            timeout: 10000,
          });

        socketRef.current =
          socket;

        const participantId =
          getParticipantId();

        // =====================================================
        // JOIN ROOM ACKNOWLEDGEMENT / DIAGNOSTICS
        // =====================================================

        socket.on(
          "join-room-result",
          (result: {
            success?: boolean;
            message?: string;
            error?: string;
          }) => {
            console.log(
              "Join room result received from server:",
              result
            );

            if (!mounted) return;

            if (
              result?.success === false ||
              result?.error
            ) {
              joinedRoomRef.current = false;
              setError(
                result.message ||
                result.error ||
                "The server could not add you to the meeting."
              );
              return;
            }

            joinedRoomRef.current = true;
            setError("");
            setConnectionStatus("connected");
          }
        );

        // =====================================================
        // CONNECT
        // =====================================================

        socket.on("connect", () => {
          console.log(
            "Meeting socket connected:",
            socket.id,
            "Backend:",
            BACKEND_URL,
            "Room:",
            roomId
          );

          // Log the lifecycle flags so we can identify an early return.
          console.log("[DEBUG] join-room guard:", {
            mounted,
            intentionalLeave: intentionalLeaveRef.current,
          });

          // Do not join if this meeting page has already unmounted
          // or the user intentionally left the meeting.
          if (!mounted || intentionalLeaveRef.current) {
            console.warn("[DEBUG] Skipping join-room because the meeting is inactive.");
            return;
          }

          console.log("Socket connected:", socket.connected);
          console.log("Room ID before joining:", roomId);

          const wasReconnecting =
            reconnectingRef.current;

          reconnectingRef.current = false;
          joinedRoomRef.current = false;
          setConnectionStatus("connected");
          setError("");

          if (wasReconnecting) {
            Object.keys(
              peerConnectionsRef.current
            ).forEach(
              (targetSocketId) =>
                closePeerConnection(
                  targetSocketId
                )
            );

            setRemoteStreams([]);
            setParticipants([]);
            setRaisedHands([]);
            setHostId(null);
            setIsHost(false);
          }

          const joinPayload = {
            roomId,
            participantId,
            user: {
              name: "Guest",
            },
          };

          console.log(
            "Emitting join-room event:",
            joinPayload
          );

          console.log("Emitting join-room now");

          socket.emit(
            "join-room",
            joinPayload
          );
        });

        // =====================================================
        // DISCONNECT
        // =====================================================

        socket.on(
          "disconnect",
          (reason) => {
            console.warn(
              "Meeting socket disconnected:",
              reason
            );

            if (
              intentionalLeaveRef.current ||
              !mounted
            ) {
              setConnectionStatus(
                "disconnected"
              );

              return;
            }

            reconnectingRef.current = true;
            joinedRoomRef.current = false;

            setConnectionStatus(
              "reconnecting"
            );

            setError(
              "Connection lost. Reconnecting to the meeting..."
            );

            Object.keys(
              peerConnectionsRef.current
            ).forEach(
              (targetSocketId) =>
                closePeerConnection(
                  targetSocketId
                )
            );

            setRemoteStreams([]);
          }
        );

        // =====================================================
        // CONNECT ERROR
        // =====================================================

        socket.on(
          "connect_error",
          (socketError) => {
            console.error(
              "Meeting socket connection error:",
              socketError
            );

            if (
              intentionalLeaveRef.current ||
              !mounted
            ) {
              return;
            }

            reconnectingRef.current = true;

            setConnectionStatus(
              "reconnecting"
            );

            setError(
              "Unable to connect to the meeting server. Retrying..."
            );
          }
        );

        socket.io.on(
          "reconnect_attempt",
          (attempt) => {
            console.log(
              "Socket.IO reconnect attempt:",
              attempt
            );

            if (
              mounted &&
              !intentionalLeaveRef.current
            ) {
              setConnectionStatus(
                "reconnecting"
              );
            }
          }
        );

        socket.io.on(
          "reconnect_failed",
          () => {
            if (
              mounted &&
              !intentionalLeaveRef.current
            ) {
              setConnectionStatus(
                "disconnected"
              );

              setError(
                "Connection could not be restored. Please check your internet connection."
              );
            }
          }
        );

        // =====================================================
        // ROOM USERS
        // =====================================================

        socket.on(
          "room-users",
          async (
            users: Participant[]
          ) => {
            if (!mounted) return;

            const cleaned =
              uniqueParticipants(
                users
              );

            console.log(
              "Existing participants:",
              cleaned
            );

            setParticipants(
              cleaned
            );

            setRaisedHands(
              cleaned
                .filter(
                  (p) =>
                    p.handRaised
                )
                .map(
                  (p) =>
                    p.socketId
                )
            );

            for (
              const participant of cleaned
            ) {
              if (
                participant.socketId ===
                socket.id
              ) {
                continue;
              }

              await createOffer(
                participant.socketId
              );
            }
          }
        );

        // =====================================================
        // HOST INFO
        // =====================================================

        socket.on(
          "host-info",
          ({
            hostId,
          }: {
            hostId: string;
          }) => {
            if (!mounted) return;

            setHostId(
              hostId
            );

            setIsHost(
              socket.id ===
              hostId
            );
          }
        );

        // =====================================================
        // MEETING INFO
        // =====================================================

        socket.on(
          "meeting-info",
          ({
            roomId,
            hostId,
            startedAt,
            locked,
          }: MeetingInfo) => {
            if (!mounted) return;

            console.log(
              "Meeting info:",
              {
                roomId,
                hostId,
                startedAt,
                locked,
              }
            );

            setHostId(
              hostId
            );

            setIsHost(
              socket.id ===
              hostId
            );

            setMeetingLocked(
              locked
            );

            if (
              typeof startedAt ===
              "number" &&
              startedAt > 0
            ) {
              startMeetingTimer(
                startedAt
              );
            }
          }
        );

        // =====================================================
        // NEW USER
        // =====================================================

        socket.on(
          "user-joined",
          (
            participant: Participant
          ) => {
            if (!mounted) return;

            if (
              !participant?.socketId
            ) {
              return;
            }

            if (
              participant.socketId ===
              socket.id
            ) {
              return;
            }

            setParticipants(
              (prev) =>
                uniqueParticipants([
                  ...prev,
                  participant,
                ])
            );

            if (
              participant.handRaised
            ) {
              setRaisedHands(
                (prev) =>
                  prev.includes(
                    participant.socketId
                  )
                    ? prev
                    : [
                      ...prev,
                      participant.socketId,
                    ]
              );
            }
          }
        );

        // =====================================================
        // OFFER
        // =====================================================

        socket.on(
          "offer",
          async ({
            sender,
            offer,
          }: {
            sender: string;
            offer: RTCSessionDescriptionInit;
          }) => {
            try {
              if (
                sender ===
                socket.id
              ) {
                return;
              }

              const peerConnection =
                createPeerConnection(
                  sender
                );

              await peerConnection.setRemoteDescription(
                new RTCSessionDescription(
                  offer
                )
              );

              const pendingCandidates =
                pendingIceCandidatesRef.current[
                sender
                ] || [];

              for (
                const pendingCandidate of pendingCandidates
              ) {
                try {
                  await peerConnection.addIceCandidate(
                    new RTCIceCandidate(
                      pendingCandidate
                    )
                  );
                } catch (iceError) {
                  console.error(
                    "Pending ICE error:",
                    iceError
                  );
                }
              }

              delete pendingIceCandidatesRef.current[
                sender
              ];

              const answer =
                await peerConnection.createAnswer();

              await peerConnection.setLocalDescription(
                answer
              );

              socket.emit(
                "answer",
                {
                  target:
                    sender,
                  answer,
                }
              );
            } catch (err) {
              console.error(
                "Offer error:",
                err
              );
            }
          }
        );

        // =====================================================
        // ANSWER
        // =====================================================

        socket.on(
          "answer",
          async ({
            sender,
            answer,
          }: {
            sender: string;
            answer: RTCSessionDescriptionInit;
          }) => {
            try {
              const peerConnection =
                peerConnectionsRef.current[
                sender
                ];

              if (
                !peerConnection
              ) {
                return;
              }

              if (
                peerConnection.signalingState !==
                "have-local-offer"
              ) {
                return;
              }

              await peerConnection.setRemoteDescription(
                new RTCSessionDescription(
                  answer
                )
              );

              const pendingCandidates =
                pendingIceCandidatesRef.current[
                sender
                ] || [];

              for (
                const pendingCandidate of pendingCandidates
              ) {
                try {
                  await peerConnection.addIceCandidate(
                    new RTCIceCandidate(
                      pendingCandidate
                    )
                  );
                } catch (iceError) {
                  console.error(
                    "Pending ICE error:",
                    iceError
                  );
                }
              }

              delete pendingIceCandidatesRef.current[
                sender
              ];
            } catch (err) {
              console.error(
                "Answer error:",
                err
              );
            }
          }
        );

        // =====================================================
        // ICE CANDIDATE
        // =====================================================

        socket.on(
          "ice-candidate",
          async ({
            sender,
            candidate,
          }: {
            sender: string;
            candidate: RTCIceCandidateInit;
          }) => {
            try {
              const peerConnection =
                peerConnectionsRef.current[
                sender
                ];

              if (
                !peerConnection ||
                !candidate
              ) {
                return;
              }

              if (
                !peerConnection.remoteDescription
              ) {
                if (
                  !pendingIceCandidatesRef.current[
                  sender
                  ]
                ) {
                  pendingIceCandidatesRef.current[
                    sender
                  ] = [];
                }

                pendingIceCandidatesRef.current[
                  sender
                ].push(candidate);

                return;
              }

              await peerConnection.addIceCandidate(
                new RTCIceCandidate(
                  candidate
                )
              );
            } catch (err) {
              console.error(
                "ICE error:",
                err
              );
            }
          }
        );

        // =====================================================
        // PARTICIPANTS UPDATED
        // =====================================================

        socket.on(
          "participants-updated",
          (
            updatedParticipants: Participant[]
          ) => {
            if (!mounted) return;

            const cleaned =
              uniqueParticipants(
                updatedParticipants
              );

            setParticipants(
              cleaned
            );

            const current =
              cleaned.find(
                (p) =>
                  p.socketId ===
                  socket.id
              );

            if (current) {
              setIsHost(
                Boolean(
                  current.isHost
                )
              );

              setHandRaised(
                Boolean(
                  current.handRaised
                )
              );
            }

            setRaisedHands(
              cleaned
                .filter(
                  (p) =>
                    p.handRaised
                )
                .map(
                  (p) =>
                    p.socketId
                )
            );
          }
        );

        // =====================================================
        // MIC
        // =====================================================

        socket.on(
          "mic-status-updated",
          ({
            socketId,
            enabled,
          }: {
            socketId: string;
            enabled: boolean;
          }) => {
            setParticipants(
              (prev) =>
                uniqueParticipants(
                  prev.map(
                    (p) =>
                      p.socketId ===
                        socketId
                        ? {
                          ...p,
                          micEnabled:
                            enabled,
                        }
                        : p
                  )
                )
            );

            if (
              socketId ===
              socket.id
            ) {
              setMicEnabled(
                enabled
              );
            }
          }
        );

        // =====================================================
        // CAMERA
        // =====================================================

        socket.on(
          "camera-status-updated",
          ({
            socketId,
            enabled,
          }: {
            socketId: string;
            enabled: boolean;
          }) => {
            setParticipants(
              (prev) =>
                uniqueParticipants(
                  prev.map(
                    (p) =>
                      p.socketId ===
                        socketId
                        ? {
                          ...p,
                          cameraEnabled:
                            enabled,
                        }
                        : p
                  )
                )
            );

            if (
              socketId ===
              socket.id
            ) {
              setCameraEnabled(
                enabled
              );
            }
          }
        );

        // =====================================================
        // CHAT
        // =====================================================

        socket.on(
          "receive-message",
          (
            chatMessage: ChatMessage
          ) => {
            setMessages(
              (prev) => [
                ...prev,
                chatMessage,
              ]
            );
          }
        );

        // =====================================================
        // HAND RAISED
        // =====================================================

        socket.on(
          "hand-raised",
          ({
            socketId,
            raised,
          }: {
            socketId: string;
            raised: boolean;
          }) => {
            setRaisedHands(
              (prev) => {
                if (raised) {
                  return prev.includes(
                    socketId
                  )
                    ? prev
                    : [
                      ...prev,
                      socketId,
                    ];
                }

                return prev.filter(
                  (id) =>
                    id !== socketId
                );
              }
            );

            setParticipants(
              (prev) =>
                uniqueParticipants(
                  prev.map(
                    (p) =>
                      p.socketId ===
                        socketId
                        ? {
                          ...p,
                          handRaised:
                            raised,
                        }
                        : p
                  )
                )
            );

            if (
              socketId ===
              socket.id
            ) {
              setHandRaised(
                raised
              );
            }
          }
        );

        // =====================================================
        // MEETING LOCK
        // =====================================================

        socket.on(
          "meeting-lock-updated",
          ({
            locked,
          }: {
            locked: boolean;
          }) => {
            setMeetingLocked(
              locked
            );
          }
        );

        // =====================================================
        // USER LEFT
        // =====================================================

        socket.on(
          "user-left",
          ({
            socketId,
          }: {
            socketId: string;
          }) => {
            console.log(
              "User left:",
              socketId
            );

            const peer =
              peerConnectionsRef.current[
              socketId
              ];

            if (peer) {
              peer.close();

              delete peerConnectionsRef.current[
                socketId
              ];
            }

            setRemoteStreams(
              (prev) =>
                prev.filter(
                  (item) =>
                    item.socketId !==
                    socketId
                )
            );

            setParticipants(
              (prev) =>
                prev.filter(
                  (p) =>
                    p.socketId !==
                    socketId
                )
            );

            setRaisedHands(
              (prev) =>
                prev.filter(
                  (id) =>
                    id !== socketId
                )
            );
          }
        );

        // =====================================================
        // REMOVED
        // =====================================================

        socket.on(
          "removed-from-meeting",
          () => {
            setError(
              "You have been removed from this meeting."
            );

            setTimeout(() => {
              router.push("/");
            }, 1500);
          }
        );

        // =====================================================
        // KICKED
        // =====================================================

        socket.on(
          "user-kicked",
          ({
            socketId,
          }: {
            socketId: string;
          }) => {
            if (
              socketId ===
              socket.id
            ) {
              setError(
                "You were removed from the meeting."
              );

              setTimeout(() => {
                router.push("/");
              }, 1500);
            }
          }
        );

        // =====================================================
        // FORCE MUTE
        // =====================================================

        socket.on(
          "force-mute",
          () => {
            if (
              localStreamRef.current
            ) {
              localStreamRef.current
                .getAudioTracks()
                .forEach(
                  (track) => {
                    track.enabled =
                      false;
                  }
                );
            }

            setMicEnabled(
              false
            );
          }
        );

        // =====================================================
        // FORCE CAMERA OFF
        // =====================================================

        socket.on(
          "force-camera-off",
          () => {
            if (
              localStreamRef.current
            ) {
              localStreamRef.current
                .getVideoTracks()
                .forEach(
                  (track) => {
                    track.enabled =
                      false;
                  }
                );
            }

            setCameraEnabled(
              false
            );
          }
        );

        // =====================================================
        // LOCKED
        // =====================================================

        socket.on(
          "meeting-locked",
          () => {
            setError(
              "This meeting is locked. New participants cannot join."
            );
          }
        );
      } catch (err) {
        console.error(
          "Meeting error:",
          err
        );

        setError(
          getPermissionErrorMessage(
            err,
            "both"
          )
        );
      }
    };

    startMeeting();

    // =====================================================
    // CLEANUP
    // =====================================================

    return () => {
      mounted = false;
      intentionalLeaveRef.current = true;

      if (
        reconnectTimerRef.current
      ) {
        clearTimeout(
          reconnectTimerRef.current
        );

        reconnectTimerRef.current =
          null;
      }

      meetingStartedRef.current =
        false;

      joinedRoomRef.current =
        false;

      stopMeetingTimer();

      setMeetingStartedAt(
        null
      );

      setMeetingDuration(
        0
      );

      if (
        screenStreamRef.current
      ) {
        screenStreamRef.current
          .getTracks()
          .forEach((track) =>
            track.stop()
          );

        screenStreamRef.current =
          null;
      }

      Object.values(
        peerConnectionsRef.current
      ).forEach(
        (peerConnection) => {
          peerConnection.ontrack =
            null;

          peerConnection.onicecandidate =
            null;

          peerConnection.close();
        }
      );

      peerConnectionsRef.current =
        {};

      pendingIceCandidatesRef.current =
        {};

      if (
        localStreamRef.current
      ) {
        localStreamRef.current
          .getTracks()
          .forEach((track) =>
            track.stop()
          );

        localStreamRef.current =
          null;
      }

      if (
        socketRef.current
      ) {
        socketRef.current.emit(
          "leave-room"
        );

        socketRef.current.disconnect();

        socketRef.current =
          null;
      }
    };
  }, [
    router.isReady,
    roomId,
  ]);

  // =====================================================
  // MICROPHONE
  // =====================================================

  const toggleMicrophone = () => {
    if (
      !localStreamRef.current
    ) {
      return;
    }

    const tracks =
      localStreamRef.current.getAudioTracks();

    if (tracks.length === 0) {
      setPermissionMessage(
        "No microphone is available. Please allow microphone permission first."
      );

      requestMicrophonePermission();

      return;
    }

    const newState =
      !micEnabled;

    tracks.forEach(
      (track) => {
        track.enabled =
          newState;
      }
    );

    setMicEnabled(
      newState
    );

    if (
      socketRef.current &&
      typeof roomId === "string"
    ) {
      socketRef.current.emit(
        "mic-status",
        {
          roomId,
          enabled:
            newState,
        }
      );
    }
  };

  // =====================================================
  // CAMERA
  // =====================================================

  const toggleCamera = () => {
    if (
      !localStreamRef.current
    ) {
      return;
    }

    const tracks =
      localStreamRef.current.getVideoTracks();

    if (tracks.length === 0) {
      setPermissionMessage(
        "No camera is available. Please allow camera permission first."
      );

      requestCameraPermission();

      return;
    }

    const newState =
      !cameraEnabled;

    tracks.forEach(
      (track) => {
        track.enabled =
          newState;
      }
    );

    setCameraEnabled(
      newState
    );

    if (
      socketRef.current &&
      typeof roomId === "string"
    ) {
      socketRef.current.emit(
        "camera-status",
        {
          roomId,
          enabled:
            newState,
        }
      );
    }
  };

  // =====================================================
  // SWITCH CAMERA
  // =====================================================

  const switchCamera = async (
    deviceId: string
  ) => {
    if (
      !deviceId ||
      deviceSwitching
    ) {
      return;
    }

    if (
      !localStreamRef.current
    ) {
      return;
    }

    try {
      setDeviceSwitching(
        true
      );

      const oldCameraTrack =
        localStreamRef.current.getVideoTracks()[0];

      const newStream =
        await navigator.mediaDevices.getUserMedia(
          {
            video: {
              deviceId: {
                exact:
                  deviceId,
              },
            },
            audio: false,
          }
        );

      const newCameraTrack =
        newStream.getVideoTracks()[0];

      if (!newCameraTrack) {
        throw new Error(
          "Unable to access selected camera."
        );
      }

      newCameraTrack.enabled =
        cameraEnabled;

      if (!isScreenSharing) {
        Object.values(
          peerConnectionsRef.current
        ).forEach(
          (peerConnection) => {
            const sender =
              peerConnection
                .getSenders()
                .find(
                  (sender) =>
                    sender.track?.kind ===
                    "video"
                );

            if (sender) {
              sender.replaceTrack(
                newCameraTrack
              ).catch((err) =>
                console.error(
                  "Camera track replacement error:",
                  err
                )
              );
            }
          }
        );
      }

      if (
        oldCameraTrack
      ) {
        localStreamRef.current.removeTrack(
          oldCameraTrack
        );

        oldCameraTrack.stop();
      }

      localStreamRef.current.addTrack(
        newCameraTrack
      );

      if (isScreenSharing) {
        cameraTrackRef.current =
          newCameraTrack;
      } else {
        cameraTrackRef.current =
          null;

        if (
          localVideoRef.current
        ) {
          localVideoRef.current.srcObject =
            localStreamRef.current;
        }
      }

      currentCameraDeviceIdRef.current =
        deviceId;

      setSelectedCameraId(
        deviceId
      );

      setCameraPermission(
        "granted"
      );

      await updateAvailableDevices();

      console.log(
        "Camera switched successfully:",
        deviceId
      );
    } catch (err) {
      console.error(
        "Camera switching error:",
        err
      );

      setPermissionMessage(
        getPermissionErrorMessage(
          err,
          "camera"
        )
      );
    } finally {
      setDeviceSwitching(
        false
      );
    }
  };

  // =====================================================
  // SWITCH MICROPHONE
  // =====================================================

  const switchMicrophone = async (
    deviceId: string
  ) => {
    if (
      !deviceId ||
      deviceSwitching
    ) {
      return;
    }

    if (
      !localStreamRef.current
    ) {
      return;
    }

    try {
      setDeviceSwitching(
        true
      );

      const oldMicrophoneTrack =
        localStreamRef.current.getAudioTracks()[0];

      const newStream =
        await navigator.mediaDevices.getUserMedia(
          {
            video: false,
            audio: {
              deviceId: {
                exact:
                  deviceId,
              },
            },
          }
        );

      const newMicrophoneTrack =
        newStream.getAudioTracks()[0];

      if (!newMicrophoneTrack) {
        throw new Error(
          "Unable to access selected microphone."
        );
      }

      newMicrophoneTrack.enabled =
        micEnabled;

      Object.values(
        peerConnectionsRef.current
      ).forEach(
        (peerConnection) => {
          const sender =
            peerConnection
              .getSenders()
              .find(
                (sender) =>
                  sender.track?.kind ===
                  "audio"
              );

          if (sender) {
            sender.replaceTrack(
              newMicrophoneTrack
            ).catch((err) =>
              console.error(
                "Microphone track replacement error:",
                err
              )
            );
          }
        }
      );

      if (
        oldMicrophoneTrack
      ) {
        localStreamRef.current.removeTrack(
          oldMicrophoneTrack
        );

        oldMicrophoneTrack.stop();
      }

      localStreamRef.current.addTrack(
        newMicrophoneTrack
      );

      currentMicrophoneDeviceIdRef.current =
        deviceId;

      setSelectedMicrophoneId(
        deviceId
      );

      setMicrophonePermission(
        "granted"
      );

      await updateAvailableDevices();

      console.log(
        "Microphone switched successfully:",
        deviceId
      );
    } catch (err) {
      console.error(
        "Microphone switching error:",
        err
      );

      setPermissionMessage(
        getPermissionErrorMessage(
          err,
          "microphone"
        )
      );
    } finally {
      setDeviceSwitching(
        false
      );
    }
  };

  // =====================================================
  // SCREEN SHARE
  // =====================================================

  const toggleScreenShare =
    async () => {
      try {
        if (
          isScreenSharing
        ) {
          await stopScreenSharing();
          return;
        }

        if (
          !localStreamRef.current
        ) {
          return;
        }

        const screenStream =
          await navigator.mediaDevices.getDisplayMedia(
            {
              video: true,
              audio: false,
            }
          );

        const screenTrack =
          screenStream.getVideoTracks()[0];

        if (!screenTrack) {
          return;
        }

        screenStreamRef.current =
          screenStream;

        const cameraTrack =
          localStreamRef.current.getVideoTracks()[0];

        cameraTrackRef.current =
          cameraTrack;

        Object.values(
          peerConnectionsRef.current
        ).forEach(
          (peerConnection) => {
            const sender =
              peerConnection
                .getSenders()
                .find(
                  (s) =>
                    s.track?.kind ===
                    "video"
                );

            if (sender) {
              sender.replaceTrack(
                screenTrack
              );
            }
          }
        );

        if (
          localVideoRef.current
        ) {
          localVideoRef.current.srcObject =
            screenStream;
        }

        setIsScreenSharing(
          true
        );

        screenTrack.onended =
          () => {
            stopScreenSharing();
          };
      } catch (err) {
        console.error(
          "Screen share error:",
          err
        );

        setError(
          "Screen sharing was cancelled or could not be started."
        );
      }
    };

  // =====================================================
  // STOP SCREEN SHARE
  // =====================================================

  const stopScreenSharing =
    async () => {
      const cameraTrack =
        cameraTrackRef.current;

      if (
        !cameraTrack ||
        !localStreamRef.current
      ) {
        return;
      }

      Object.values(
        peerConnectionsRef.current
      ).forEach(
        (peerConnection) => {
          const sender =
            peerConnection
              .getSenders()
              .find(
                (s) =>
                  s.track?.kind ===
                  "video"
              );

          if (sender) {
            sender.replaceTrack(
              cameraTrack
            );
          }
        }
      );

      if (
        localVideoRef.current
      ) {
        localVideoRef.current.srcObject =
          localStreamRef.current;
      }

      if (
        screenStreamRef.current
      ) {
        screenStreamRef.current
          .getTracks()
          .forEach((track) =>
            track.stop()
          );

        screenStreamRef.current =
          null;
      }

      cameraTrackRef.current =
        null;

      setIsScreenSharing(
        false
      );
    };

  // =====================================================
  // RAISE HAND
  // =====================================================

  const toggleRaiseHand =
    () => {
      if (
        !socketRef.current ||
        typeof roomId !== "string"
      ) {
        return;
      }

      const newState =
        !handRaised;

      socketRef.current.emit(
        "raise-hand",
        {
          roomId,
          raised:
            newState,
        }
      );

      setHandRaised(
        newState
      );
    };

  // =====================================================
  // CHAT
  // =====================================================

  const sendMessage = () => {
    const message =
      messageInput.trim();

    if (
      !message ||
      !socketRef.current ||
      typeof roomId !== "string"
    ) {
      return;
    }

    socketRef.current.emit(
      "send-message",
      {
        roomId,
        message,
      }
    );

    setMessageInput("");
  };

  const handleChatKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (
      event.key === "Enter"
    ) {
      event.preventDefault();

      sendMessage();
    }
  };

  // =====================================================
  // LOCK / UNLOCK
  // =====================================================

  const toggleMeetingLock =
    () => {
      if (
        !socketRef.current ||
        typeof roomId !== "string" ||
        !isHost
      ) {
        return;
      }

      socketRef.current.emit(
        meetingLocked
          ? "unlock-meeting"
          : "lock-meeting",
        {
          roomId,
        }
      );
    };

  // =====================================================
  // KICK
  // =====================================================

  const kickParticipant = (
    targetSocketId: string
  ) => {
    if (
      !socketRef.current ||
      typeof roomId !== "string" ||
      !isHost
    ) {
      return;
    }

    socketRef.current.emit(
      "kick-participant",
      {
        roomId,
        targetSocketId,
      }
    );
  };

  // =====================================================
  // HOST MUTE
  // =====================================================

  const muteParticipant = (
    targetSocketId: string
  ) => {
    if (
      !socketRef.current ||
      typeof roomId !== "string" ||
      !isHost
    ) {
      return;
    }

    socketRef.current.emit(
      "host-mute-participant",
      {
        roomId,
        targetSocketId,
      }
    );
  };

  // =====================================================
  // HOST CAMERA OFF
  // =====================================================

  const turnOffParticipantCamera =
    (
      targetSocketId: string
    ) => {
      if (
        !socketRef.current ||
        typeof roomId !== "string" ||
        !isHost
      ) {
        return;
      }

      socketRef.current.emit(
        "host-camera-off",
        {
          roomId,
          targetSocketId,
        }
      );
    };

  // =====================================================
  // LEAVE
  // =====================================================

  const leaveMeeting = () => {
    intentionalLeaveRef.current = true;

    if (
      reconnectTimerRef.current
    ) {
      clearTimeout(
        reconnectTimerRef.current
      );

      reconnectTimerRef.current =
        null;
    }

    setConnectionStatus(
      "disconnected"
    );

    stopMeetingTimer();

    if (
      screenStreamRef.current
    ) {
      screenStreamRef.current
        .getTracks()
        .forEach((track) =>
          track.stop()
        );

      screenStreamRef.current =
        null;
    }

    Object.values(
      peerConnectionsRef.current
    ).forEach(
      (peer) =>
        peer.close()
    );

    peerConnectionsRef.current =
      {};

    if (
      socketRef.current
    ) {
      socketRef.current.emit(
        "leave-room"
      );

      socketRef.current.disconnect();

      socketRef.current =
        null;
    }

    if (
      localStreamRef.current
    ) {
      localStreamRef.current
        .getTracks()
        .forEach((track) =>
          track.stop()
        );

      localStreamRef.current =
        null;
    }

    meetingStartedRef.current =
      false;

    joinedRoomRef.current =
      false;

    router.push("/");
  };

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-7xl mx-auto">

        {/* HEADER */}

        <div className="flex justify-between items-center mb-6">

          <div>
            <h1 className="text-2xl font-bold">
              Video Meeting
            </h1>

            <p className="text-gray-400 mt-1">
              Room ID: {roomId}
            </p>
          </div>

          <div className="flex items-center gap-3">

            {/* MEETING TIMER */}

            <div className="flex items-center gap-2 bg-gray-800 px-4 py-2 rounded-lg border border-gray-700">

              <span className="text-green-400">
                ●
              </span>

              <span className="font-mono font-semibold">
                {formatMeetingDuration(
                  meetingDuration
                )}
              </span>

            </div>

            {/* CONNECTION STATUS */}

            <div
              className={`px-3 py-2 rounded-lg text-sm font-semibold ${connectionStatus === "connected"
                ? "bg-green-900/50 text-green-400"
                : connectionStatus === "reconnecting" ||
                  connectionStatus === "connecting"
                  ? "bg-yellow-900/50 text-yellow-400"
                  : "bg-red-900/50 text-red-400"
                }`}
            >
              {connectionStatus === "connected"
                ? "🟢 Connected"
                : connectionStatus === "reconnecting"
                  ? "🟡 Reconnecting..."
                  : connectionStatus === "connecting"
                    ? "🟡 Connecting..."
                    : "🔴 Disconnected"}
            </div>

            <p className="text-gray-400">
              Participants:{" "}
              {participants.length}
            </p>

            {isHost && (
              <span className="bg-yellow-500 text-black px-3 py-1 rounded-lg font-semibold">
                👑 Host
              </span>
            )}

          </div>

        </div>

        {/* =====================================================
            PERMISSION HANDLING PANEL
        ===================================================== */}

        {(permissionRequired ||
          permissionMessage) && (
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 mb-5">

              <div className="flex justify-between items-start gap-4">

                <div className="flex-1">

                  <h2 className="text-lg font-semibold mb-2">
                    🔐 Camera & Microphone Permissions
                  </h2>

                  <p className="text-gray-400 text-sm">
                    YourTube needs permission to use your camera and microphone for the meeting.
                  </p>

                  {/* CAMERA STATUS */}

                  <div className="flex items-center gap-2 mt-4 text-sm">

                    <span>
                      📷 Camera:
                    </span>

                    <span
                      className={
                        cameraPermission ===
                          "granted"
                          ? "text-green-400"
                          : cameraPermission ===
                            "denied"
                            ? "text-red-400"
                            : cameraPermission ===
                              "unavailable"
                              ? "text-yellow-400"
                              : "text-gray-400"
                      }
                    >
                      {cameraPermission ===
                        "granted"
                        ? "Allowed"
                        : cameraPermission ===
                          "denied"
                          ? "Blocked"
                          : cameraPermission ===
                            "unavailable"
                            ? "Not available"
                            : "Not checked"}
                    </span>

                  </div>

                  {/* MICROPHONE STATUS */}

                  <div className="flex items-center gap-2 mt-2 text-sm">

                    <span>
                      🎤 Microphone:
                    </span>

                    <span
                      className={
                        microphonePermission ===
                          "granted"
                          ? "text-green-400"
                          : microphonePermission ===
                            "denied"
                            ? "text-red-400"
                            : microphonePermission ===
                              "unavailable"
                              ? "text-yellow-400"
                              : "text-gray-400"
                      }
                    >
                      {microphonePermission ===
                        "granted"
                        ? "Allowed"
                        : microphonePermission ===
                          "denied"
                          ? "Blocked"
                          : microphonePermission ===
                            "unavailable"
                            ? "Not available"
                            : "Not checked"}
                    </span>

                  </div>

                  {/* MESSAGE */}

                  {permissionMessage && (
                    <div className="mt-4 bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm text-gray-300">
                      {permissionMessage}
                    </div>
                  )}

                </div>

                {/* PERMISSION BUTTONS */}

                <div className="flex flex-col gap-2">

                  <button
                    onClick={
                      requestMediaPermissions
                    }
                    disabled={
                      permissionLoading
                    }
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded-lg font-semibold text-sm whitespace-nowrap"
                  >
                    {permissionLoading
                      ? "Requesting..."
                      : "🔄 Retry permissions"}
                  </button>

                  {cameraPermission !==
                    "granted" && (
                      <button
                        onClick={
                          requestCameraPermission
                        }
                        disabled={
                          permissionLoading
                        }
                        className="bg-gray-800 hover:bg-gray-700 border border-gray-700 disabled:opacity-50 px-4 py-2 rounded-lg text-sm whitespace-nowrap"
                      >
                        📷 Allow camera
                      </button>
                    )}

                  {microphonePermission !==
                    "granted" && (
                      <button
                        onClick={
                          requestMicrophonePermission
                        }
                        disabled={
                          permissionLoading
                        }
                        className="bg-gray-800 hover:bg-gray-700 border border-gray-700 disabled:opacity-50 px-4 py-2 rounded-lg text-sm whitespace-nowrap"
                      >
                        🎤 Allow microphone
                      </button>
                    )}

                </div>

              </div>

            </div>
          )}

        {/* ERROR */}

        {error && (
          <div className="bg-red-600 text-white p-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        {/* MAIN */}

        <div className="flex gap-4">

          {/* VIDEO AREA */}

          <div className="flex-1">

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* LOCAL VIDEO */}

              <div className="relative aspect-video bg-black rounded-lg overflow-hidden">

                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />

                {!cameraEnabled && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-900">

                    <div className="text-center">

                      <div className="text-5xl mb-2">
                        📷
                      </div>

                      <p className="text-gray-400">
                        Camera Off
                      </p>

                      {cameraPermission ===
                        "denied" && (
                          <button
                            onClick={
                              requestCameraPermission
                            }
                            className="mt-3 bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded-lg text-sm"
                          >
                            Allow Camera
                          </button>
                        )}

                    </div>

                  </div>
                )}

                <div className="absolute bottom-3 left-3 bg-black/70 px-3 py-1 rounded">

                  You

                  {isHost &&
                    " 👑"}

                  {isScreenSharing &&
                    " - Screen"}

                </div>

                <div className="absolute bottom-3 right-3 bg-black/70 px-2 py-1 rounded">

                  {micEnabled
                    ? "🎤"
                    : "🔇"}

                </div>

                {handRaised && (
                  <div className="absolute top-3 right-3 bg-yellow-500 text-black px-3 py-2 rounded-lg font-semibold">
                    ✋ Hand Raised
                  </div>
                )}

              </div>

              {/* REMOTE VIDEOS */}

              {remoteStreams.map(
                (item) => {
                  const participant =
                    participants.find(
                      (p) =>
                        p.socketId ===
                        item.socketId
                    );

                  return (
                    <RemoteVideo
                      key={
                        item.socketId
                      }
                      stream={
                        item.stream
                      }
                      name={
                        participant
                          ?.user
                          ?.name ||
                        "Guest"
                      }
                      micEnabled={
                        participant
                          ?.micEnabled ??
                        true
                      }
                      cameraEnabled={
                        participant
                          ?.cameraEnabled ??
                        true
                      }
                      handRaised={
                        raisedHands.includes(
                          item.socketId
                        )
                      }
                      isHost={
                        participant
                          ?.isHost ??
                        false
                      }
                    />
                  );
                }
              )}

            </div>

          </div>

          {/* RIGHT SIDEBAR */}

          {(participantsOpen ||
            chatOpen) && (
              <div className="w-80 bg-gray-900 rounded-lg flex flex-col h-[500px]">

                {/* SIDEBAR HEADER */}

                <div className="flex border-b border-gray-700">

                  <button
                    onClick={() => {
                      setParticipantsOpen(
                        true
                      );

                      setChatOpen(
                        false
                      );
                    }}
                    className={`flex-1 p-3 font-semibold ${participantsOpen
                      ? "bg-gray-800"
                      : "text-gray-400"
                      }`}
                  >
                    👥 Participants (
                    {participants.length}
                    )
                  </button>

                  <button
                    onClick={() => {
                      setChatOpen(
                        true
                      );

                      setParticipantsOpen(
                        false
                      );
                    }}
                    className={`flex-1 p-3 font-semibold ${chatOpen
                      ? "bg-gray-800"
                      : "text-gray-400"
                      }`}
                  >
                    💬 Chat
                  </button>

                </div>

                {/* PARTICIPANTS */}

                {participantsOpen && (
                  <div className="flex-1 overflow-y-auto">

                    <div className="p-3">

                      <div className="flex justify-between items-center mb-3">

                        <h2 className="font-semibold">
                          Participants
                        </h2>

                        {isHost && (
                          <button
                            onClick={
                              toggleMeetingLock
                            }
                            className={`px-3 py-1 rounded-lg text-sm font-semibold ${meetingLocked
                              ? "bg-green-600 hover:bg-green-700"
                              : "bg-yellow-500 text-black hover:bg-yellow-400"
                              }`}
                          >
                            {meetingLocked
                              ? "🔓 Unlock"
                              : "🔒 Lock"}
                          </button>
                        )}

                      </div>

                      {meetingLocked && (
                        <div className="bg-yellow-500/20 border border-yellow-500/40 text-yellow-300 rounded-lg p-2 mb-3 text-sm">
                          🔒 Meeting is locked
                        </div>
                      )}

                      <div className="space-y-2">

                        {participants.map(
                          (
                            participant
                          ) => {

                            const currentSocketId =
                              socketRef.current
                                ?.id;

                            const participantIsMe =
                              participant.socketId ===
                              currentSocketId;

                            return (
                              <div
                                key={
                                  participant.socketId
                                }
                                className="bg-gray-800 rounded-lg p-3"
                              >

                                <div className="flex justify-between items-center">

                                  <div className="flex items-center gap-2">

                                    <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center">

                                      {participant
                                        .user
                                        ?.image ? (
                                        <img
                                          src={
                                            participant
                                              .user
                                              .image
                                          }
                                          alt=""
                                          className="w-8 h-8 rounded-full object-cover"
                                        />
                                      ) : (
                                        "👤"
                                      )}

                                    </div>

                                    <div>

                                      <p className="font-semibold text-sm">

                                        {participantIsMe
                                          ? "You"
                                          : participant
                                            .user
                                            ?.name ||
                                          "Guest"}

                                        {participant.isHost &&
                                          " 👑"}

                                      </p>

                                      <div className="flex gap-2 text-xs text-gray-400">

                                        <span>
                                          {participant
                                            .micEnabled
                                            ? "🎤"
                                            : "🔇"}
                                        </span>

                                        <span>
                                          {participant
                                            .cameraEnabled
                                            ? "📹"
                                            : "📷"}
                                        </span>

                                        {participant.handRaised && (
                                          <span>
                                            ✋
                                          </span>
                                        )}

                                      </div>

                                    </div>

                                  </div>

                                  {isHost &&
                                    !participantIsMe &&
                                    !participant.isHost && (
                                      <div className="flex gap-1">

                                        <button
                                          onClick={() =>
                                            muteParticipant(
                                              participant.socketId
                                            )
                                          }
                                          className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded"
                                          title="Mute participant"
                                        >
                                          🔇
                                        </button>

                                        <button
                                          onClick={() =>
                                            turnOffParticipantCamera(
                                              participant.socketId
                                            )
                                          }
                                          className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded"
                                          title="Turn off camera"
                                        >
                                          📷
                                        </button>

                                        <button
                                          onClick={() =>
                                            kickParticipant(
                                              participant.socketId
                                            )
                                          }
                                          className="text-xs bg-red-600 hover:bg-red-700 px-2 py-1 rounded"
                                          title="Remove participant"
                                        >
                                          ✕
                                        </button>

                                      </div>
                                    )}

                                </div>

                              </div>
                            );
                          }
                        )}

                      </div>

                    </div>

                  </div>
                )}

                {/* CHAT */}

                {chatOpen && (
                  <>
                    <div className="flex justify-between items-center p-4 border-b border-gray-700">

                      <h2 className="font-semibold">
                        💬 Chat
                      </h2>

                      <button
                        onClick={() =>
                          setChatOpen(
                            false
                          )
                        }
                        className="text-gray-400 hover:text-white"
                      >
                        ✕
                      </button>

                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-3">

                      {messages.length ===
                        0 ? (
                        <p className="text-gray-500 text-sm text-center">
                          No messages yet
                        </p>
                      ) : (
                        messages.map(
                          (
                            msg,
                            index
                          ) => (
                            <div
                              key={`${msg.socketId}-${msg.timestamp}-${index}`}
                              className="bg-gray-800 rounded-lg p-3"
                            >

                              <div className="flex justify-between gap-2 mb-1">

                                <span className="text-sm font-semibold">
                                  {msg
                                    .user
                                    ?.name ||
                                    "Guest"}
                                </span>

                                <span className="text-xs text-gray-500">
                                  {new Date(
                                    msg.timestamp
                                  ).toLocaleTimeString(
                                    [],
                                    {
                                      hour: "2-digit",
                                      minute:
                                        "2-digit",
                                    }
                                  )}
                                </span>

                              </div>

                              <p className="text-sm break-words">
                                {msg.message}
                              </p>

                            </div>
                          )
                        )
                      )}

                    </div>

                    <div className="p-3 border-t border-gray-700">

                      <div className="flex gap-2">

                        <input
                          type="text"
                          value={
                            messageInput
                          }
                          onChange={(e) =>
                            setMessageInput(
                              e.target
                                .value
                            )
                          }
                          onKeyDown={
                            handleChatKeyDown
                          }
                          placeholder="Type a message..."
                          className="flex-1 bg-gray-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                        />

                        <button
                          onClick={
                            sendMessage
                          }
                          className="bg-blue-600 hover:bg-blue-700 px-3 rounded-lg"
                        >
                          ➤
                        </button>

                      </div>

                    </div>
                  </>
                )}

              </div>
            )}

        </div>

        {/* =====================================================
            DEVICE PANEL
        ===================================================== */}

        {devicesOpen && (
          <div className="mt-5 max-w-xl mx-auto bg-gray-900 border border-gray-700 rounded-xl p-5">

            <div className="flex justify-between items-center mb-5">

              <div>
                <h2 className="text-lg font-semibold">
                  🎛️ Meeting Devices
                </h2>

                <p className="text-gray-400 text-sm mt-1">
                  Switch your camera or microphone without leaving the meeting.
                </p>
              </div>

              <button
                onClick={() =>
                  setDevicesOpen(false)
                }
                className="text-gray-400 hover:text-white text-xl"
              >
                ✕
              </button>

            </div>

            {/* CAMERA */}

            <div className="mb-4">

              <label className="block text-sm font-semibold text-gray-300 mb-2">
                📷 Camera
              </label>

              <select
                value={
                  selectedCameraId
                }
                onChange={(e) =>
                  switchCamera(
                    e.target.value
                  )
                }
                disabled={
                  deviceSwitching ||
                  videoDevices.length === 0
                }
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-3 outline-none focus:ring-2 focus:ring-blue-500"
              >

                {videoDevices.length ===
                  0 ? (
                  <option value="">
                    No camera found
                  </option>
                ) : (
                  videoDevices.map(
                    (
                      device,
                      index
                    ) => (
                      <option
                        key={
                          device.deviceId
                        }
                        value={
                          device.deviceId
                        }
                      >
                        {device.label ||
                          `Camera ${index + 1
                          }`}
                      </option>
                    )
                  )
                )}

              </select>

            </div>

            {/* MICROPHONE */}

            <div className="mb-4">

              <label className="block text-sm font-semibold text-gray-300 mb-2">
                🎤 Microphone
              </label>

              <select
                value={
                  selectedMicrophoneId
                }
                onChange={(e) =>
                  switchMicrophone(
                    e.target.value
                  )
                }
                disabled={
                  deviceSwitching ||
                  audioDevices.length === 0
                }
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-3 outline-none focus:ring-2 focus:ring-blue-500"
              >

                {audioDevices.length ===
                  0 ? (
                  <option value="">
                    No microphone found
                  </option>
                ) : (
                  audioDevices.map(
                    (
                      device,
                      index
                    ) => (
                      <option
                        key={
                          device.deviceId
                        }
                        value={
                          device.deviceId
                        }
                      >
                        {device.label ||
                          `Microphone ${index + 1
                          }`}
                      </option>
                    )
                  )
                )}

              </select>

            </div>

            {/* PERMISSION SHORTCUTS */}

            <div className="grid grid-cols-2 gap-2 mb-3">

              <button
                onClick={
                  requestCameraPermission
                }
                className="bg-gray-800 hover:bg-gray-700 border border-gray-700 px-3 py-2 rounded-lg text-sm"
              >
                📷 Test Camera
              </button>

              <button
                onClick={
                  requestMicrophonePermission
                }
                className="bg-gray-800 hover:bg-gray-700 border border-gray-700 px-3 py-2 rounded-lg text-sm"
              >
                🎤 Test Microphone
              </button>

            </div>

            {/* REFRESH DEVICES */}

            <button
              onClick={
                updateAvailableDevices
              }
              disabled={
                deviceSwitching
              }
              className="w-full bg-gray-800 hover:bg-gray-700 border border-gray-700 px-4 py-3 rounded-lg font-semibold"
            >
              🔄 Refresh devices
            </button>

            {deviceSwitching && (
              <p className="text-center text-blue-400 text-sm mt-3">
                Switching device...
              </p>
            )}

          </div>
        )}

        {/* =====================================================
            CONTROLS
        ===================================================== */}

        <div className="flex justify-center gap-3 mt-8 flex-wrap">

          {/* MIC */}

          <button
            onClick={
              toggleMicrophone
            }
            className="px-5 py-3 rounded-lg bg-gray-800 hover:bg-gray-700"
          >
            {micEnabled
              ? "🎤 Mute"
              : "🔇 Unmute"}
          </button>

          {/* CAMERA */}

          <button
            onClick={
              toggleCamera
            }
            className="px-5 py-3 rounded-lg bg-gray-800 hover:bg-gray-700"
          >
            {cameraEnabled
              ? "📹 Turn camera off"
              : "📷 Turn camera on"}
          </button>

          {/* SCREEN */}

          <button
            onClick={
              toggleScreenShare
            }
            className="px-5 py-3 rounded-lg bg-gray-800 hover:bg-gray-700"
          >
            {isScreenSharing
              ? "🛑 Stop sharing"
              : "🖥️ Share screen"}
          </button>

          {/* HAND */}

          <button
            onClick={
              toggleRaiseHand
            }
            className={`px-5 py-3 rounded-lg ${handRaised
              ? "bg-yellow-500 text-black hover:bg-yellow-400"
              : "bg-gray-800 hover:bg-gray-700"
              }`}
          >
            {handRaised
              ? "✋ Lower hand"
              : "✋ Raise hand"}
          </button>

          {/* PARTICIPANTS */}

          <button
            onClick={() => {
              setParticipantsOpen(
                (prev) => !prev
              );

              setChatOpen(
                false
              );

              setDevicesOpen(
                false
              );
            }}
            className={`px-5 py-3 rounded-lg ${participantsOpen
              ? "bg-blue-600 hover:bg-blue-700"
              : "bg-gray-800 hover:bg-gray-700"
              }`}
          >
            👥 Participants (
            {participants.length})
          </button>

          {/* CHAT */}

          <button
            onClick={() => {
              setChatOpen(
                (prev) => !prev
              );

              setParticipantsOpen(
                false
              );

              setDevicesOpen(
                false
              );
            }}
            className={`px-5 py-3 rounded-lg ${chatOpen
              ? "bg-blue-600 hover:bg-blue-700"
              : "bg-gray-800 hover:bg-gray-700"
              }`}
          >
            💬 Chat
          </button>

          {/* DEVICES */}

          <button
            onClick={() => {
              setDevicesOpen(
                (prev) => !prev
              );

              setChatOpen(
                false
              );

              setParticipantsOpen(
                false
              );

              updateAvailableDevices();
            }}
            className={`px-5 py-3 rounded-lg ${devicesOpen
              ? "bg-blue-600 hover:bg-blue-700"
              : "bg-gray-800 hover:bg-gray-700"
              }`}
          >
            🎛️ Devices
          </button>

          {/* LOCK */}

          {isHost && (
            <button
              onClick={
                toggleMeetingLock
              }
              className={`px-5 py-3 rounded-lg ${meetingLocked
                ? "bg-green-600 hover:bg-green-700"
                : "bg-gray-800 hover:bg-gray-700"
                }`}
            >
              {meetingLocked
                ? "🔓 Unlock meeting"
                : "🔒 Lock meeting"}
            </button>
          )}

          {/* LEAVE */}

          <button
            onClick={
              leaveMeeting
            }
            className="px-5 py-3 rounded-lg bg-red-600 hover:bg-red-700"
          >
            📞 Leave Meeting
          </button>

        </div>

      </div>
    </div>
  );
}

// =====================================================
// REMOTE VIDEO
// =====================================================

function RemoteVideo({
  stream,
  name,
  micEnabled,
  cameraEnabled,
  handRaised,
  isHost,
}: {
  stream: MediaStream;
  socketId?: string;
  name: string;
  micEnabled: boolean;
  cameraEnabled: boolean;
  handRaised: boolean;
  isHost: boolean;
}) {
  const videoRef =
    useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject =
        stream;
    }
  }, [stream]);

  return (
    <div className="relative aspect-video bg-black rounded-lg overflow-hidden">

      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="w-full h-full object-cover"
      />

      {!cameraEnabled && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900">

          <div className="text-center">

            <div className="text-5xl mb-2">
              📷
            </div>

            <p className="text-gray-400">
              Camera Off
            </p>

          </div>

        </div>
      )}

      <div className="absolute bottom-3 left-3 bg-black/70 px-3 py-1 rounded">

        {name}

        {isHost &&
          " 👑"}

      </div>

      <div className="absolute bottom-3 right-3 bg-black/70 px-2 py-1 rounded">

        {micEnabled
          ? "🎤"
          : "🔇"}

      </div>

      {handRaised && (
        <div className="absolute top-3 right-3 bg-yellow-500 text-black px-3 py-2 rounded-lg font-semibold">
          ✋ Hand Raised
        </div>
      )}

    </div>
  );
}