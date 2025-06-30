const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// In-memory room and player state
const rooms = {};

const generateRoomCode = () =>
  Math.random().toString(36).substr(2, 6).toUpperCase();

// API endpoint to generate a new room code
app.get("/api/new-room-code", (req, res) => {
  res.json({ code: generateRoomCode() });
});

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  // Create or join a room (now with roomName)
  socket.on("join_room", ({ roomCode, roomName, playerName }, callback) => {
    // Find or create room by code
    let room = rooms[roomCode];
    if (!room) {
      // Creating a new room
      rooms[roomCode] = {
        players: [],
        host: socket.id,
        gameState: null,
        roomName,
      };
      room = rooms[roomCode];
    } else {
      // Joining: check room name matches
      if (room.roomName !== roomName) {
        return callback({ error: "Room name does not match code." });
      }
    }
    if (room.players.length >= 6) {
      return callback({ error: "Room is full" });
    }
    room.players.push({ id: socket.id, name: playerName });
    socket.join(roomCode);
    io.to(roomCode).emit("room_update", room);
    callback({
      success: true,
      isHost: room.host === socket.id,
      roomName: room.roomName,
    });
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    for (const [roomCode, room] of Object.entries(rooms)) {
      room.players = room.players.filter((p) => p.id !== socket.id);
      if (room.host === socket.id && room.players.length > 0) {
        room.host = room.players[0].id; // New host
      }
      if (room.players.length === 0) {
        delete rooms[roomCode];
      } else {
        io.to(roomCode).emit("room_update", room);
      }
    }
    console.log("A user disconnected:", socket.id);
  });

  // Host starts a round
  socket.on("start_round", ({ roomCode, objectName }, callback) => {
    const room = rooms[roomCode];
    if (!room || room.host !== socket.id) return;
    room.gameState = {
      phase: "question",
      objectName,
      answers: {}, // { playerId: 'yes' | 'no' }
      correct: null,
    };
    io.to(roomCode).emit("round_started", { objectName });
  });

  // Player submits answer
  socket.on("submit_answer", ({ roomCode, answer }, callback) => {
    const room = rooms[roomCode];
    if (!room || !room.gameState || room.gameState.phase !== "question") return;
    room.gameState.answers[socket.id] = answer;
    // Optionally: emit partial answers
    io.to(roomCode).emit("answers_update", {
      count: Object.keys(room.gameState.answers).length,
    });
    // If all players except host have answered, notify host
    if (
      Object.keys(room.gameState.answers).length ===
      room.players.length - 1
    ) {
      io.to(room.host).emit("all_answered");
    }
  });

  // Host reveals correct answer
  socket.on("reveal_result", ({ roomCode, correct }, callback) => {
    const room = rooms[roomCode];
    if (!room || room.host !== socket.id || !room.gameState) return;
    room.gameState.phase = "result";
    room.gameState.correct = correct;
    // Determine who got it wrong
    const wrongPlayers = room.players.filter(
      (p) => p.id !== room.host && room.gameState.answers[p.id] !== correct
    );
    io.to(roomCode).emit("round_result", {
      objectName: room.gameState.objectName,
      correct,
      answers: room.gameState.answers,
      wrongPlayers: wrongPlayers.map((p) => ({ id: p.id, name: p.name })),
    });
  });

  // Host assigns a dare to a player
  socket.on("assign_dare", ({ roomCode, playerId, dare }, callback) => {
    const room = rooms[roomCode];
    if (!room || room.host !== socket.id || !room.gameState) return;
    if (!room.gameState.dares) room.gameState.dares = {};
    room.gameState.dares[playerId] = dare;
    io.to(playerId).emit("dare_assigned", { dare });
    if (callback) callback({ success: true });
  });

  // Game logic events (to be expanded)
  // ...
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
