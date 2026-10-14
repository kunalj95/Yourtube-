
const rooms = new Map();

// =========================================================
// RECONNECTION SETTINGS
// =========================================================

const RECONNECT_GRACE_PERIOD = 60 * 1000;

// =========================================================
// JOIN ACKNOWLEDGEMENT / DIAGNOSTICS
// =========================================================

const acknowledgeJoin = (socket, success, message, extra = {}) => {
  const response = {
    success,
    message,
    ...extra,
  };

  console.log("JOIN ROOM ACKNOWLEDGEMENT:", {
    socketId: socket.id,
    ...response,
  });

  socket.emit("join-room-result", response);
};

// =========================================================
// CREATE SAFE PARTICIPANT OBJECT
// =========================================================

const getPublicParticipant = (participant) => {
  if (!participant) return null;

  const { reconnectTimer, ...publicParticipant } = participant;
  return publicParticipant;
};

const getPublicParticipants = (room) => {
  return Array.from(room.participants.values())
    .map(getPublicParticipant)
    .filter(Boolean);
};

// =========================================================
// TRANSFER HOST
// =========================================================

const transferHost = (room, roomId, io) => {
  const participants = Array.from(room.participants.values());

  if (participants.length === 0) {
    room.hostId = null;
    return;
  }

  const nextHost =
    participants.find((participant) => participant.connected) ||
    participants[0];

  room.hostId = nextHost.socketId;

  room.participants.forEach((participant) => {
    participant.isHost = participant.socketId === room.hostId;
  });

  const newHostSocket = io.sockets.sockets.get(room.hostId);

  if (newHostSocket) {
    newHostSocket.data.isHost = true;
  }

  io.to(roomId).emit("host-info", {
    hostId: room.hostId,
  });

  io.to(roomId).emit(
    "participants-updated",
    getPublicParticipants(room)
  );

  console.log(`Host transferred in ${roomId}: ${room.hostId}`);
};

// =========================================================
// REMOVE USER FROM ROOM
// =========================================================

const removeUserFromRoom = (socket, io, intentional = false) => {
  const roomId = socket.data.roomId;
  const participantId = socket.data.participantId;

  if (!roomId || !participantId) return;

  const room = rooms.get(roomId);

  if (!room) {
    socket.data.roomId = null;
    socket.data.participantId = null;
    socket.data.isHost = false;
    return;
  }

  const participant = room.participants.get(participantId);

  if (!participant) {
    socket.data.roomId = null;
    socket.data.participantId = null;
    socket.data.isHost = false;
    return;
  }

  // Only the current socket can remove this participant.
  if (participant.socketId !== socket.id) return;

  if (participant.reconnectTimer) {
    clearTimeout(participant.reconnectTimer);
    participant.reconnectTimer = null;
  }

  const wasHost = room.hostId === socket.id;

  room.participants.delete(participantId);

  socket.to(roomId).emit("user-left", {
    socketId: socket.id,
    participantId,
  });

  if (wasHost && room.participants.size > 0) {
    transferHost(room, roomId, io);
  }

  io.to(roomId).emit(
    "participants-updated",
    getPublicParticipants(room)
  );

  if (room.participants.size === 0) {
    rooms.delete(roomId);
    console.log(`Room ${roomId} deleted because it is empty`);
  } else {
    rooms.set(roomId, room);
  }

  socket.leave(roomId);

  socket.data.roomId = null;
  socket.data.participantId = null;
  socket.data.isHost = false;
  socket.data.hasLeftRoom = true;
  socket.data.intentionalLeave = intentional;

  console.log(`User ${socket.id} left room ${roomId}`);
};

// =========================================================
// MARK USER TEMPORARILY DISCONNECTED
// =========================================================

const markUserDisconnected = (socket, io) => {
  const roomId = socket.data.roomId;
  const participantId = socket.data.participantId;

  if (!roomId || !participantId) return;

  const room = rooms.get(roomId);

  if (!room) return;

  const participant = room.participants.get(participantId);

  if (!participant || participant.socketId !== socket.id) return;

  participant.connected = false;
  participant.disconnectedAt = Date.now();

  if (participant.reconnectTimer) {
    clearTimeout(participant.reconnectTimer);
  }

  socket.to(roomId).emit("user-disconnected", {
    socketId: socket.id,
    participantId,
    disconnectedAt: participant.disconnectedAt,
  });

  room.participants.set(participantId, participant);
  rooms.set(roomId, room);

  // Immediately broadcast the updated participant state.
  io.to(roomId).emit(
    "participants-updated",
    getPublicParticipants(room)
  );

  participant.reconnectTimer = setTimeout(() => {
    const currentRoom = rooms.get(roomId);

    if (!currentRoom) return;

    const currentParticipant =
      currentRoom.participants.get(participantId);

    if (!currentParticipant) return;

    // A successful reconnection cancels removal.
    if (currentParticipant.connected) return;

    currentRoom.participants.delete(participantId);

    io.to(roomId).emit("user-left", {
      socketId: currentParticipant.socketId,
      participantId,
    });

    if (currentRoom.hostId === currentParticipant.socketId) {
      transferHost(currentRoom, roomId, io);
    }

    io.to(roomId).emit(
      "participants-updated",
      getPublicParticipants(currentRoom)
    );

    if (currentRoom.participants.size === 0) {
      rooms.delete(roomId);
      console.log(
        `Room ${roomId} deleted after reconnection timeout`
      );
      return;
    }

    rooms.set(roomId, currentRoom);

    console.log(
      `Participant ${participantId} removed after reconnect timeout`
    );
  }, RECONNECT_GRACE_PERIOD);

  console.log(
    `Participant ${participantId} temporarily disconnected from ${roomId}`
  );

  console.log(
    `Waiting ${RECONNECT_GRACE_PERIOD / 1000}s for reconnection`
  );
};

// =========================================================
// SETUP MEETING SOCKET
// =========================================================

export const setupMeetingSocket = (io) => {
  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.onAny((eventName, ...args) => {
      console.log("[SOCKET EVENT RECEIVED]", eventName, args);
    });

    // =====================================================
    // JOIN / REJOIN ROOM
    // =====================================================

    socket.on(
      "join-room",
      ({ roomId, user, participantId } = {}) => {
        console.log("JOIN ROOM EVENT RECEIVED:", {
          roomId,
          participantId,
          socketId: socket.id,
          connected: socket.connected,
        });

        if (!roomId || !participantId) {
          acknowledgeJoin(
            socket,
            false,
            "Missing roomId or participantId"
          );
          return;
        }

        // Prevent the same socket from joining different rooms.
        if (socket.data.roomId) {
          acknowledgeJoin(
            socket,
            false,
            `Socket is already in room ${socket.data.roomId}`,
            { roomId: socket.data.roomId }
          );
          return;
        }

        let room = rooms.get(roomId);

        // =================================================
        // CREATE ROOM
        // =================================================

        if (!room) {
          room = {
            participants: new Map(),
            hostId: socket.id,
            locked: false,
            startedAt: Date.now(),
            kickedParticipants: new Set(),
          };

          rooms.set(roomId, room);

          console.log(`Room ${roomId} created. Host: ${socket.id}`);
        }

        // =================================================
        // CHECK IF PARTICIPANT WAS KICKED
        // =================================================

        if (
          room.kickedParticipants &&
          room.kickedParticipants.has(participantId)
        ) {
          acknowledgeJoin(
            socket,
            false,
            "You have been removed from this meeting",
            { roomId }
          );

          socket.emit("removed-from-meeting");
          return;
        }

        const existingParticipant = room.participants.get(participantId);

        // =================================================
        // RECONNECTION
        // =================================================

        if (existingParticipant) {
          const previousSocketId = existingParticipant.socketId;

          if (existingParticipant.reconnectTimer) {
            clearTimeout(existingParticipant.reconnectTimer);
            existingParticipant.reconnectTimer = null;
          }

          const wasHost = room.hostId === previousSocketId;

          existingParticipant.socketId = socket.id;
          existingParticipant.connected = true;
          existingParticipant.disconnectedAt = null;

          if (user) {
            existingParticipant.user = user;
          }

          if (wasHost) {
            room.hostId = socket.id;
          }

          room.participants.forEach((participant) => {
            participant.isHost = participant.socketId === room.hostId;
          });

          room.participants.set(participantId, existingParticipant);
          rooms.set(roomId, room);

          socket.data.roomId = roomId;
          socket.data.user = existingParticipant.user;
          socket.data.participantId = participantId;
          socket.data.isHost = room.hostId === socket.id;
          socket.data.hasLeftRoom = false;
          socket.data.intentionalLeave = false;

          socket.join(roomId);

          // Prevent an old socket from affecting the reconnected user.
          if (previousSocketId && previousSocketId !== socket.id) {
            const oldSocket = io.sockets.sockets.get(previousSocketId);

            if (oldSocket) {
              oldSocket.data.roomId = null;
              oldSocket.data.participantId = null;
              oldSocket.data.isHost = false;
              oldSocket.data.hasLeftRoom = true;
              oldSocket.data.intentionalLeave = true;
            }
          }

          socket.emit(
            "room-users",
            getPublicParticipants(room).filter(
              (participant) => participant.socketId !== socket.id
            )
          );

          socket.emit("host-info", {
            hostId: room.hostId,
          });

          console.log("SENDING MEETING INFO AFTER RECONNECTION:", {
            roomId,
            socketId: socket.id,
            participantId,
          });

          socket.emit("meeting-info", {
            roomId,
            hostId: room.hostId,
            startedAt: room.startedAt,
            locked: room.locked,
          });

          acknowledgeJoin(
            socket,
            true,
            "Rejoined meeting successfully",
            {
              roomId,
              participantId,
              hostId: room.hostId,
            }
          );

          socket.to(roomId).emit("participant-reconnected", {
            participant: getPublicParticipant(existingParticipant),
            previousSocketId,
            newSocketId: socket.id,
          });

          io.to(roomId).emit(
            "participants-updated",
            getPublicParticipants(room)
          );

          io.to(roomId).emit("host-info", {
            hostId: room.hostId,
          });

          console.log(`Participant ${participantId} reconnected`);
          return;
        }

        // =================================================
        // LOCK CHECK
        // =================================================

        if (room.locked) {
          acknowledgeJoin(
            socket,
            false,
            "This meeting is locked",
            { roomId }
          );

          socket.emit("meeting-locked");
          return;
        }

        // =================================================
        // DUPLICATE SOCKET CHECK
        // =================================================

        const duplicateParticipant = Array.from(
          room.participants.values()
        ).find((participant) => participant.socketId === socket.id);

        if (duplicateParticipant) {
          acknowledgeJoin(
            socket,
            false,
            "This socket has already joined the meeting",
            { roomId }
          );
          return;
        }

        // =================================================
        // USER INFORMATION
        // =================================================

        const participantUser = user || { name: "Guest" };
        const isHost = room.participants.size === 0;

        // =================================================
        // CREATE PARTICIPANT
        // =================================================

        const participant = {
          participantId,
          socketId: socket.id,
          user: participantUser,
          isHost,
          micEnabled: true,
          cameraEnabled: true,
          handRaised: false,
          joinedAt: Date.now(),
          connected: true,
          disconnectedAt: null,
          reconnectTimer: null,
        };

        if (room.participants.size === 0) {
          room.hostId = socket.id;
        }

        room.participants.set(participantId, participant);
        rooms.set(roomId, room);

        // =================================================
        // SAVE SOCKET DATA
        // =================================================

        socket.data.roomId = roomId;
        socket.data.user = participantUser;
        socket.data.participantId = participantId;
        socket.data.isHost = room.hostId === socket.id;
        socket.data.hasLeftRoom = false;
        socket.data.intentionalLeave = false;

        socket.join(roomId);

        // =================================================
        // SEND EXISTING PARTICIPANTS
        // =================================================

        socket.emit(
          "room-users",
          getPublicParticipants(room).filter(
            (participant) => participant.socketId !== socket.id
          )
        );

        // =================================================
        // HOST INFO
        // =================================================

        socket.emit("host-info", {
          hostId: room.hostId,
        });

        // =================================================
        // MEETING INFO
        // =================================================

        console.log("SENDING MEETING INFO AFTER NEW JOIN:", {
          roomId,
          socketId: socket.id,
          participantId,
        });

        socket.emit("meeting-info", {
          roomId,
          hostId: room.hostId,
          startedAt: room.startedAt,
          locked: room.locked,
        });

        acknowledgeJoin(
          socket,
          true,
          "Joined meeting successfully",
          {
            roomId,
            participantId,
            hostId: room.hostId,
          }
        );

        // =================================================
        // TELL EXISTING USERS
        // =================================================

        socket.to(roomId).emit(
          "user-joined",
          getPublicParticipant(participant)
        );

        // =================================================
        // UPDATE PARTICIPANTS
        // =================================================

        io.to(roomId).emit(
          "participants-updated",
          getPublicParticipants(room)
        );

        io.to(roomId).emit("host-info", {
          hostId: room.hostId,
        });

        console.log(
          `User ${socket.id} joined room ${roomId}${isHost ? " as HOST" : ""}`
        );

        console.log(`Participant ID: ${participantId}`);
        console.log(`Participants in ${roomId}: ${room.participants.size}`);
      }
    );

    // =====================================================
    // WEBRTC OFFER
    // =====================================================

    socket.on("offer", ({ target, offer } = {}) => {
      if (!target || !offer) return;

      io.to(target).emit("offer", {
        sender: socket.id,
        offer,
      });
    });

    // =====================================================
    // WEBRTC ANSWER
    // =====================================================

    socket.on("answer", ({ target, answer } = {}) => {
      if (!target || !answer) return;

      io.to(target).emit("answer", {
        sender: socket.id,
        answer,
      });
    });

    // =====================================================
    // ICE CANDIDATE
    // =====================================================

    socket.on("ice-candidate", ({ target, candidate } = {}) => {
      if (!target || !candidate) return;

      io.to(target).emit("ice-candidate", {
        sender: socket.id,
        candidate,
      });
    });

    // =====================================================
    // CHAT
    // =====================================================

    socket.on("send-message", ({ roomId, message } = {}) => {
      if (!roomId || !message) return;
      if (socket.data.roomId !== roomId) return;

      const cleanMessage = String(message).trim();

      if (!cleanMessage) return;

      io.to(roomId).emit("receive-message", {
        socketId: socket.id,
        participantId: socket.data.participantId,
        user: socket.data.user || { name: "Guest" },
        message: cleanMessage,
        timestamp: new Date().toISOString(),
      });
    });

    // =====================================================
    // RAISE HAND
    // =====================================================

    socket.on("raise-hand", ({ roomId, raised } = {}) => {
      if (!roomId || socket.data.roomId !== roomId) return;

      const room = rooms.get(roomId);
      if (!room) return;

      const participant = room.participants.get(socket.data.participantId);
      if (!participant) return;

      participant.handRaised = Boolean(raised);

      room.participants.set(socket.data.participantId, participant);
      rooms.set(roomId, room);

      io.to(roomId).emit("hand-raised", {
        socketId: socket.id,
        participantId: participant.participantId,
        raised: participant.handRaised,
      });

      io.to(roomId).emit(
        "participants-updated",
        getPublicParticipants(room)
      );
    });

    // =====================================================
    // MICROPHONE STATUS
    // =====================================================

    socket.on("mic-status", ({ roomId, enabled } = {}) => {
      if (!roomId || socket.data.roomId !== roomId) return;

      const room = rooms.get(roomId);
      if (!room) return;

      const participant = room.participants.get(socket.data.participantId);
      if (!participant) return;

      participant.micEnabled = Boolean(enabled);

      room.participants.set(socket.data.participantId, participant);
      rooms.set(roomId, room);

      io.to(roomId).emit("mic-status-updated", {
        socketId: socket.id,
        participantId: participant.participantId,
        enabled: participant.micEnabled,
      });

      io.to(roomId).emit(
        "participants-updated",
        getPublicParticipants(room)
      );
    });

    // =====================================================
    // CAMERA STATUS
    // =====================================================

    socket.on("camera-status", ({ roomId, enabled } = {}) => {
      if (!roomId || socket.data.roomId !== roomId) return;

      const room = rooms.get(roomId);
      if (!room) return;

      const participant = room.participants.get(socket.data.participantId);
      if (!participant) return;

      participant.cameraEnabled = Boolean(enabled);

      room.participants.set(socket.data.participantId, participant);
      rooms.set(roomId, room);

      io.to(roomId).emit("camera-status-updated", {
        socketId: socket.id,
        participantId: participant.participantId,
        enabled: participant.cameraEnabled,
      });

      io.to(roomId).emit(
        "participants-updated",
        getPublicParticipants(room)
      );
    });

    // =====================================================
    // HOST CHECK
    // =====================================================

    const isSocketHost = (roomId) => {
      const room = rooms.get(roomId);
      return Boolean(room && room.hostId === socket.id);
    };

    // =====================================================
    // LOCK MEETING
    // =====================================================

    socket.on("lock-meeting", ({ roomId } = {}) => {
      if (!roomId || socket.data.roomId !== roomId) return;
      if (!isSocketHost(roomId)) return;

      const room = rooms.get(roomId);
      if (!room) return;

      room.locked = true;
      rooms.set(roomId, room);

      io.to(roomId).emit("meeting-lock-updated", {
        locked: true,
      });

      console.log(`Meeting ${roomId} locked by ${socket.id}`);
    });

    // =====================================================
    // UNLOCK MEETING
    // =====================================================

    socket.on("unlock-meeting", ({ roomId } = {}) => {
      if (!roomId || socket.data.roomId !== roomId) return;
      if (!isSocketHost(roomId)) return;

      const room = rooms.get(roomId);
      if (!room) return;

      room.locked = false;
      rooms.set(roomId, room);

      io.to(roomId).emit("meeting-lock-updated", {
        locked: false,
      });

      console.log(`Meeting ${roomId} unlocked by ${socket.id}`);
    });

    // =====================================================
    // KICK PARTICIPANT
    // =====================================================

    socket.on(
      "kick-participant",
      ({ roomId, targetSocketId } = {}) => {
        if (!roomId || !targetSocketId) return;
        if (socket.data.roomId !== roomId) return;
        if (!isSocketHost(roomId)) return;
        if (targetSocketId === socket.id) return;

        const room = rooms.get(roomId);
        if (!room) return;

        let targetParticipant = null;
        let targetParticipantId = null;

        for (const [participantId, participant] of room.participants.entries()) {
          if (participant.socketId === targetSocketId) {
            targetParticipant = participant;
            targetParticipantId = participantId;
            break;
          }
        }

        if (!targetParticipant || !targetParticipantId) return;

        if (!room.kickedParticipants) {
          room.kickedParticipants = new Set();
        }

        room.kickedParticipants.add(targetParticipantId);

        if (targetParticipant.reconnectTimer) {
          clearTimeout(targetParticipant.reconnectTimer);
          targetParticipant.reconnectTimer = null;
        }

        io.to(targetSocketId).emit("removed-from-meeting");
        io.to(targetSocketId).emit("user-kicked", {
          socketId: targetSocketId,
          participantId: targetParticipantId,
        });

        room.participants.delete(targetParticipantId);
        rooms.set(roomId, room);

        socket.to(roomId).emit("user-left", {
          socketId: targetSocketId,
          participantId: targetParticipantId,
        });

        io.to(roomId).emit(
          "participants-updated",
          getPublicParticipants(room)
        );

        console.log(`Host ${socket.id} kicked ${targetSocketId}`);
      }
    );

    // =====================================================
    // HOST MUTE PARTICIPANT
    // =====================================================

    socket.on(
      "host-mute-participant",
      ({ roomId, targetSocketId } = {}) => {
        if (!roomId || !targetSocketId) return;
        if (socket.data.roomId !== roomId) return;
        if (!isSocketHost(roomId)) return;
        if (targetSocketId === socket.id) return;

        const room = rooms.get(roomId);
        if (!room) return;

        let targetParticipant = null;
        let targetParticipantId = null;

        for (const [participantId, participant] of room.participants.entries()) {
          if (participant.socketId === targetSocketId) {
            targetParticipant = participant;
            targetParticipantId = participantId;
            break;
          }
        }

        if (!targetParticipant || !targetParticipantId) return;

        targetParticipant.micEnabled = false;

        room.participants.set(targetParticipantId, targetParticipant);
        rooms.set(roomId, room);

        io.to(targetSocketId).emit("force-mute");

        io.to(roomId).emit("mic-status-updated", {
          socketId: targetSocketId,
          participantId: targetParticipantId,
          enabled: false,
        });

        io.to(roomId).emit(
          "participants-updated",
          getPublicParticipants(room)
        );
      }
    );

    // =====================================================
    // HOST CAMERA OFF
    // =====================================================

    socket.on(
      "host-camera-off",
      ({ roomId, targetSocketId } = {}) => {
        if (!roomId || !targetSocketId) return;
        if (socket.data.roomId !== roomId) return;
        if (!isSocketHost(roomId)) return;
        if (targetSocketId === socket.id) return;

        const room = rooms.get(roomId);
        if (!room) return;

        let targetParticipant = null;
        let targetParticipantId = null;

        for (const [participantId, participant] of room.participants.entries()) {
          if (participant.socketId === targetSocketId) {
            targetParticipant = participant;
            targetParticipantId = participantId;
            break;
          }
        }

        if (!targetParticipant || !targetParticipantId) return;

        targetParticipant.cameraEnabled = false;

        room.participants.set(targetParticipantId, targetParticipant);
        rooms.set(roomId, room);

        io.to(targetSocketId).emit("force-camera-off");

        io.to(roomId).emit("camera-status-updated", {
          socketId: targetSocketId,
          participantId: targetParticipantId,
          enabled: false,
        });

        io.to(roomId).emit(
          "participants-updated",
          getPublicParticipants(room)
        );
      }
    );

    // =====================================================
    // INTENTIONAL LEAVE
    // =====================================================

    socket.on("leave-room", () => {
      socket.data.intentionalLeave = true;
      removeUserFromRoom(socket, io, true);
    });

    // =====================================================
    // DISCONNECT
    // =====================================================

    socket.on("disconnect", (reason) => {
      console.log(
        "User disconnected:",
        socket.id,
        "Reason:",
        reason
      );

      if (socket.data.intentionalLeave) return;

      markUserDisconnected(socket, io);
    });
  });
};
