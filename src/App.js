import React, { useState } from "react";
import { io } from "socket.io-client";
import VideoGrid from "./VideoGrid";
import Peer from "simple-peer";
import QRCode from "react-qr-code";

const socket = io("http://localhost:4000");

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name) || "";
}

function App() {
  // --- State hooks ---
  const [step, setStep] = useState("landing"); // landing | join | room
  const [roomCode, setRoomCode] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [room, setRoom] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [error, setError] = useState("");
  const [round, setRound] = useState(null); // { objectName, phase, answers, correct }
  const [myAnswer, setMyAnswer] = useState(null);
  const [allAnswered, setAllAnswered] = useState(false);
  const [result, setResult] = useState(null); // { objectName, correct, answers, wrongPlayers }
  const [objectInput, setObjectInput] = useState("");
  const [dareAssignments, setDareAssignments] = useState({}); // { playerId: dare }
  const [myDare, setMyDare] = useState(null);
  const [emojiReactions, setEmojiReactions] = useState([]); // [{id, emoji, name}]
  const [highlightId, setHighlightId] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [peers, setPeers] = useState([]); // [{stream, name, id, isHighlighted}]
  const [cameraError, setCameraError] = useState("");
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [availableCameras, setAvailableCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [roomName, setRoomName] = useState("");
  const [directLink, setDirectLink] = useState("");

  // --- Utility ---
  function isMobileDevice() {
    return /Mobi|Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(
      navigator.userAgent
    );
  }

  // --- Camera/Mic controls ---
  const toggleCamera = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach((track) => {
        track.enabled = !cameraOn;
      });
      setCameraOn((on) => !on);
    }
  };

  const toggleMic = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = !micOn;
      });
      setMicOn((on) => !on);
    }
  };

  // --- On mount, check for direct link params ---
  React.useEffect(() => {
    const urlRoomName = getQueryParam("roomName");
    const urlRoomCode = getQueryParam("roomCode");
    if (urlRoomName && urlRoomCode) {
      setStep("join");
      setRoomName(urlRoomName);
      setRoomCode(urlRoomCode);
    }
  }, []);

  // --- Create room: fetch new code and show link ---
  const handleCreateRoom = async (e) => {
    e.preventDefault();
    if (!roomName || !playerName)
      return setError("Enter room name and your name");
    try {
      const res = await fetch("/api/new-room-code");
      if (!res.ok) throw new Error("Server error");
      const data = await res.json();
      setRoomCode(data.code);
      setDirectLink(
        `${window.location.origin}/?roomName=${encodeURIComponent(
          roomName
        )}&roomCode=${data.code}`
      );
      setError("");
    } catch (err) {
      setError(
        "Could not generate room code. Please make sure the backend server is running."
      );
    }
  };

  // --- Join/create room with name+code ---
  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (!roomCode || !roomName || !playerName)
      return setError("Enter room name, code, and your name");
    socket.emit("join_room", { roomCode, roomName, playerName }, (res) => {
      if (res.error) return setError(res.error);
      setIsHost(res.isHost);
      setStep("room");
      setError("");
    });
  };

  // --- Socket listeners ---
  React.useEffect(() => {
    socket.on("room_update", (roomData) => {
      setRoom(roomData);
    });
    return () => {
      socket.off("room_update");
    };
  }, []);

  React.useEffect(() => {
    socket.on("round_started", ({ objectName }) => {
      setRound({ objectName, phase: "question", answers: {}, correct: null });
      setMyAnswer(null);
      setResult(null);
      setAllAnswered(false);
    });
    socket.on("answers_update", ({ count }) => {});
    socket.on("all_answered", () => {
      setAllAnswered(true);
    });
    socket.on("round_result", (data) => {
      setRound((r) =>
        r ? { ...r, phase: "result", correct: data.correct } : null
      );
      setResult(data);
    });
    socket.on("dare_assigned", ({ dare }) => {
      setMyDare(dare);
      setHighlightId(socket.id);
      setTimeout(() => setHighlightId(null), 5000);
    });
    socket.on("emoji_reaction", ({ id, emoji, name }) => {
      setEmojiReactions((r) => [...r, { id, emoji, name }]);
      setTimeout(
        () => setEmojiReactions((r) => r.filter((e) => e.id !== id)),
        2000
      );
    });
    return () => {
      socket.off("round_started");
      socket.off("answers_update");
      socket.off("all_answered");
      socket.off("round_result");
      socket.off("dare_assigned");
      socket.off("emoji_reaction");
    };
  }, [roomCode]);

  // --- Get available cameras on mount ---
  React.useEffect(() => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices)
      return;
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      const videoInputs = devices.filter((d) => d.kind === "videoinput");
      setAvailableCameras(videoInputs);
      if (videoInputs.length > 0 && !selectedCameraId) {
        setSelectedCameraId(videoInputs[0].deviceId);
      }
    });
  }, []);

  // --- Camera/Mic setup with selected camera ---
  React.useEffect(() => {
    if (step !== "room" || !room) return;
    setCameraError("");
    const constraints = {
      video: selectedCameraId
        ? { deviceId: { exact: selectedCameraId } }
        : true,
      audio: true,
    };
    navigator.mediaDevices
      .getUserMedia(constraints)
      .then((stream) => {
        setLocalStream(stream);
        setCameraError("");
        socket.emit("media_ready", { roomCode });
      })
      .catch((err) => {
        if (isMobileDevice()) {
          setCameraError(
            "No camera found or access denied. Please allow camera access or check your device settings."
          );
        } else {
          setCameraError(
            "No camera found. Please connect an external webcam or select a different camera."
          );
        }
      });
  }, [step, room, roomCode, selectedCameraId]);

  React.useEffect(() => {
    if (!localStream || !room) return;
    const peerObjs = {};
    function addPeer(peerId, initiator, name) {
      const peer = new Peer({ initiator, trickle: false, stream: localStream });
      peer.on("signal", (data) => {
        socket.emit("signal", {
          roomCode,
          to: peerId,
          from: socket.id,
          signal: data,
        });
      });
      peer.on("stream", (remoteStream) => {
        setPeers((p) => [
          ...p.filter((x) => x.id !== peerId),
          { id: peerId, stream: remoteStream, name, isHighlighted: false },
        ]);
      });
      peerObjs[peerId] = peer;
      return peer;
    }
    socket.on("signal", ({ from, signal, name }) => {
      if (!peerObjs[from]) addPeer(from, false, name);
      peerObjs[from].signal(signal);
    });
    socket.on("media_ready", ({ id, name }) => {
      if (!peerObjs[id]) addPeer(id, true, name);
    });
    return () => {
      Object.values(peerObjs).forEach((p) => p.destroy());
      setPeers([]);
      socket.off("signal");
      socket.off("media_ready");
    };
  }, [localStream, room, roomCode]);

  React.useEffect(() => {
    setPeers((peers) =>
      peers.map((p) => ({ ...p, isHighlighted: highlightId === p.id }))
    );
  }, [highlightId]);

  // --- Game logic ---
  const handleStartRound = (e) => {
    e.preventDefault();
    if (!objectInput) return;
    socket.emit("start_round", { roomCode, objectName: objectInput });
    setObjectInput("");
  };

  const handleAnswer = (answer) => {
    setMyAnswer(answer);
    socket.emit("submit_answer", { roomCode, answer });
  };

  const handleReveal = (correct) => {
    socket.emit("reveal_result", { roomCode, correct });
  };

  const handleNextRound = () => {
    setRound(null);
    setResult(null);
    setAllAnswered(false);
    setMyAnswer(null);
    setDareAssignments({});
    setMyDare(null);
  };

  const handleAssignDare = (playerId, dare) => {
    socket.emit("assign_dare", { roomCode, playerId, dare }, (res) => {
      if (res && res.success) {
        setDareAssignments((a) => ({ ...a, [playerId]: dare }));
        setHighlightId(playerId);
        setTimeout(() => setHighlightId(null), 5000);
      }
    });
  };

  const sendEmoji = (emoji) => {
    socket.emit("emoji_reaction", { roomCode, emoji, name: playerName });
  };

  // --- Camera selector UI ---
  const cameraSelector = (
    <div className="mb-2">
      <label className="mr-2 font-semibold text-sm">Camera:</label>
      <select
        className="border rounded px-2 py-1"
        value={selectedCameraId}
        onChange={(e) => setSelectedCameraId(e.target.value)}>
        {availableCameras.map((cam) => (
          <option key={cam.deviceId} value={cam.deviceId}>
            {cam.label || `Camera ${cam.deviceId.slice(-4)}`}
          </option>
        ))}
      </select>
    </div>
  );

  // --- UI ---
  if (step === "landing") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-200 via-yellow-100 to-pink-200 flex flex-col items-center justify-center p-2">
        {/* Animated flying object */}
        <div className="relative mb-8">
          <div className="animate-bounce w-32 h-32 flex items-center justify-center">
            <span
              role="img"
              aria-label="paper plane"
              className="text-7xl drop-shadow-lg">
              🛩️
            </span>
          </div>
        </div>
        {/* Title */}
        <h1 className="text-4xl md:text-5xl font-extrabold text-blue-700 mb-2 text-center drop-shadow">
          Does It Fly? <span className="text-pink-500">– Dare Edition</span>
        </h1>
        <p className="text-lg md:text-xl text-gray-700 mb-8 text-center max-w-xl">
          Take turns naming objects and asking,{" "}
          <span className="font-semibold text-blue-600">"Does it fly?"</span>{" "}
          <br />
          Guess right, or face a dare from the host! Play live with friends,
          complete dares on video, and react with emojis!
        </p>
        {/* Buttons */}
        <div className="flex gap-6 mb-8 flex-wrap justify-center">
          <button
            className="px-8 py-3 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-xl shadow-lg transition-all text-lg"
            onClick={() => setStep("create")}>
            Create Room
          </button>
          <button
            className="px-8 py-3 bg-pink-400 hover:bg-pink-500 text-white font-bold rounded-xl shadow-lg transition-all text-lg"
            onClick={() => setStep("join")}>
            Join Room
          </button>
        </div>
        {/* Footer */}
        <div className="mt-10 text-gray-500 text-sm">
          Made with <span className="text-red-400">♥</span> for daredevils &
          friends
        </div>
      </div>
    );
  }

  if (step === "create") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-200 via-yellow-100 to-pink-200 p-2">
        <form
          onSubmit={handleCreateRoom}
          className="bg-white rounded-xl shadow-xl p-8 flex flex-col gap-4 w-full max-w-xs">
          <h2 className="text-2xl font-bold text-blue-700 mb-2 text-center">
            Create Room
          </h2>
          <input
            className="border rounded px-3 py-2"
            placeholder="Room Name"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            maxLength={24}
          />
          <input
            className="border rounded px-3 py-2"
            placeholder="Your Name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            maxLength={16}
          />
          {directLink && (
            <div className="bg-blue-50 border border-blue-200 rounded p-2 text-xs text-center">
              <div className="mb-1">
                Room Code:{" "}
                <span className="font-bold text-blue-700">{roomCode}</span>
              </div>
              <div className="mb-1">Direct Link:</div>
              <input
                className="w-full border rounded px-1 py-1 text-xs"
                value={directLink}
                readOnly
                onClick={(e) => e.target.select()}
              />
              <button
                type="button"
                className="mt-1 text-blue-600 underline"
                onClick={() => {
                  navigator.clipboard.writeText(directLink);
                }}>
                Copy Link
              </button>
              <button
                type="button"
                className="ml-2 text-green-600 underline"
                onClick={handleJoinRoom}>
                Enter Room
              </button>
              <div className="mt-2 flex flex-col items-center">
                <span className="mb-1 font-semibold text-gray-700">
                  Scan to Join:
                </span>
                <QRCode value={directLink} size={120} />
              </div>
              <div className="mt-2 flex flex-col items-center gap-2">
                <a
                  href={`https://wa.me/?text=Join%20my%20Does%20It%20Fly%20room!%20${encodeURIComponent(
                    directLink
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-green-500 hover:bg-green-600 text-white rounded px-3 py-1 text-xs font-bold flex items-center gap-1">
                  <span role="img" aria-label="whatsapp">
                    🟢
                  </span>{" "}
                  Share via WhatsApp
                </a>
                <a
                  href={`sms:?&body=Join%20my%20Does%20It%20Fly%20room!%20${encodeURIComponent(
                    directLink
                  )}`}
                  className="bg-blue-500 hover:bg-blue-600 text-white rounded px-3 py-1 text-xs font-bold flex items-center gap-1">
                  <span role="img" aria-label="sms">
                    💬
                  </span>{" "}
                  Share via SMS
                </a>
              </div>
            </div>
          )}
          {!directLink && (
            <button className="bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-xl py-2 mt-2">
              Generate Room
            </button>
          )}
          <button
            type="button"
            className="text-gray-500 mt-2"
            onClick={() => setStep("landing")}>
            Back
          </button>
        </form>
      </div>
    );
  }

  if (step === "join") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-200 via-yellow-100 to-pink-200 p-2">
        <form
          onSubmit={handleJoinRoom}
          className="bg-white rounded-xl shadow-xl p-8 flex flex-col gap-4 w-full max-w-xs">
          <h2 className="text-2xl font-bold text-blue-700 mb-2 text-center">
            Join Room
          </h2>
          <input
            className="border rounded px-3 py-2"
            placeholder="Room Name"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            maxLength={24}
          />
          <input
            className="border rounded px-3 py-2"
            placeholder="Room Code"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            maxLength={6}
          />
          <input
            className="border rounded px-3 py-2"
            placeholder="Your Name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            maxLength={16}
          />
          {error && (
            <div className="text-red-500 text-sm text-center">{error}</div>
          )}
          <button className="bg-pink-400 hover:bg-pink-500 text-white font-bold rounded-xl py-2 mt-2">
            Enter Room
          </button>
          <button
            type="button"
            className="text-gray-500 mt-2"
            onClick={() => setStep("landing")}>
            Back
          </button>
        </form>
      </div>
    );
  }

  if (step === "room" && room) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-200 via-yellow-100 to-pink-200 p-2">
        {/* Camera selector always visible */}
        {cameraSelector}
        {/* Mic/Camera controls */}
        <div className="flex gap-4 mb-2 flex-wrap justify-center">
          <button
            onClick={toggleCamera}
            className={`px-4 py-2 rounded-xl font-bold shadow ${
              cameraOn ? "bg-green-500 text-white" : "bg-gray-300 text-gray-600"
            }`}>
            {cameraOn ? "Camera On" : "Camera Off"}
          </button>
          <button
            onClick={toggleMic}
            className={`px-4 py-2 rounded-xl font-bold shadow ${
              micOn ? "bg-green-500 text-white" : "bg-gray-300 text-gray-600"
            }`}>
            {micOn ? "Mic On" : "Mic Off"}
          </button>
        </div>
        {/* Video grid or camera error */}
        {cameraError ? (
          <div className="bg-red-100 border-2 border-red-400 text-red-700 rounded-xl p-4 mb-4 text-center max-w-md">
            <div className="font-bold mb-2">Camera Error</div>
            <div>{cameraError}</div>
            <div className="mt-2 text-xs text-gray-600">
              <div>
                If you are on a PC/laptop, try connecting an external webcam or
                selecting a different camera above.
              </div>
              <div>
                If you are on a smartphone, please allow camera access or check
                your device settings.
              </div>
              <div>
                If you are on mobile, make sure to use your local network IP
                (not localhost) and a supported browser (Chrome, Safari,
                Firefox).
              </div>
            </div>
          </div>
        ) : (
          <VideoGrid
            peers={peers}
            localStream={localStream}
            localName={playerName}
            localHighlight={highlightId === socket.id}
          />
        )}
        <div className="bg-white rounded-xl shadow-xl p-4 md:p-8 flex flex-col gap-4 w-full max-w-lg mx-auto">
          <h2 className="text-2xl font-bold text-blue-700 mb-2 text-center">
            Room: <span className="text-pink-500">{roomCode}</span>
          </h2>
          <div className="mb-2 text-center text-lg font-semibold">
            Room Name:{" "}
            <span className="text-blue-600">{room?.roomName || roomName}</span>
          </div>
          <div className="mb-2 text-center">
            {isHost ? "You are the host 🎩" : "Waiting for host..."}
          </div>
          <div>
            <div className="font-semibold mb-1">Players:</div>
            <ul className="flex flex-wrap gap-2">
              {room.players.map((p) => (
                <li
                  key={p.id}
                  className={`rounded px-3 py-1 font-medium ${
                    p.id === room.host
                      ? "bg-yellow-200 text-yellow-800"
                      : "bg-blue-100 text-blue-700"
                  }`}>
                  {p.name}
                  {p.id === room.host ? " 👑" : ""}
                </li>
              ))}
            </ul>
          </div>

          {/* Game round UI */}
          <div className="mt-6">
            {/* Host: Start round */}
            {isHost &&
              (!round || round.phase === "result" || !round.objectName) && (
                <form
                  onSubmit={handleStartRound}
                  className="flex gap-2 items-center justify-center">
                  <input
                    className="border rounded px-3 py-2 flex-1"
                    placeholder="Enter an object (e.g. Penguin)"
                    value={objectInput}
                    onChange={(e) => setObjectInput(e.target.value)}
                    maxLength={32}
                  />
                  <button className="bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-xl py-2 px-4">
                    Ask
                  </button>
                </form>
              )}

            {/* Question phase */}
            {round && round.phase === "question" && (
              <div className="mt-4 text-center">
                <div className="text-xl font-bold mb-2">
                  Does <span className="text-pink-500">{round.objectName}</span>{" "}
                  fly?
                </div>
                {/* Players: Answer */}
                {!isHost && myAnswer == null && (
                  <div className="flex gap-4 justify-center mt-2">
                    <button
                      className="bg-blue-400 hover:bg-blue-500 text-white font-bold rounded-xl py-2 px-6"
                      onClick={() => handleAnswer("yes")}>
                      Yes
                    </button>
                    <button
                      className="bg-pink-400 hover:bg-pink-500 text-white font-bold rounded-xl py-2 px-6"
                      onClick={() => handleAnswer("no")}>
                      No
                    </button>
                  </div>
                )}
                {!isHost && myAnswer && (
                  <div className="mt-2 text-green-600 font-semibold">
                    You answered: {myAnswer.toUpperCase()}
                  </div>
                )}
                {/* Host: Wait for answers */}
                {isHost && (
                  <div className="mt-2 text-gray-500">
                    Waiting for all players to answer...
                  </div>
                )}
                {/* Host: Reveal answer */}
                {isHost && allAnswered && (
                  <div className="flex gap-4 justify-center mt-4">
                    <button
                      className="bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl py-2 px-4"
                      onClick={() => handleReveal("yes")}>
                      Correct: Yes
                    </button>
                    <button
                      className="bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl py-2 px-4"
                      onClick={() => handleReveal("no")}>
                      Correct: No
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Result phase with dare assignment */}
            {round && round.phase === "result" && result && (
              <div className="mt-4 text-center">
                <div className="text-xl font-bold mb-2">
                  Result:{" "}
                  <span className="text-green-600">
                    {result.correct.toUpperCase()}
                  </span>
                </div>
                <div className="mb-2">
                  Object:{" "}
                  <span className="text-pink-500">{result.objectName}</span>
                </div>
                <div className="mb-2">Players who must do a dare:</div>
                <ul className="flex flex-wrap gap-2 justify-center">
                  {result.wrongPlayers.length === 0 ? (
                    <li className="text-green-600 font-semibold">None! 🎉</li>
                  ) : (
                    result.wrongPlayers.map((p) => (
                      <li
                        key={p.id}
                        className={`bg-pink-200 text-pink-800 rounded px-3 py-1 font-medium ${
                          highlightId === p.id ? "ring-4 ring-pink-400" : ""
                        }`}>
                        {p.name}
                        {isHost && !dareAssignments[p.id] && (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              handleAssignDare(p.id, e.target.dare.value);
                              e.target.reset();
                            }}
                            className="inline-block ml-2">
                            <input
                              name="dare"
                              className="border rounded px-2 py-1 text-xs"
                              placeholder="Enter dare"
                              required
                            />
                            <button className="ml-1 bg-pink-400 text-white rounded px-2 py-1 text-xs">
                              Assign
                            </button>
                          </form>
                        )}
                        {dareAssignments[p.id] && (
                          <span className="ml-2 text-xs text-pink-700">
                            Dare assigned!
                          </span>
                        )}
                      </li>
                    ))
                  )}
                </ul>
                <div className="mt-4">
                  <button
                    className="bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-xl py-2 px-4"
                    onClick={handleNextRound}>
                    Next Round
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        {/* Dare card for player */}
        {myDare && (
          <div className="fixed inset-0 flex items-center justify-center z-50">
            <div className="bg-pink-100 border-4 border-pink-400 rounded-2xl shadow-2xl p-8 animate-bounce text-center">
              <div className="text-2xl font-bold mb-2">Your Dare!</div>
              <div className="text-lg mb-4">{myDare}</div>
              <button
                className="bg-pink-400 text-white rounded-xl px-4 py-2 font-bold"
                onClick={() => setMyDare(null)}>
                Done
              </button>
            </div>
          </div>
        )}
        {/* Emoji reactions */}
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex gap-2 z-40">
          {["😂", "👏", "😱", "🔥", "🎉"].map((emoji) => (
            <button
              key={emoji}
              className="text-3xl"
              onClick={() => sendEmoji(emoji)}>
              {emoji}
            </button>
          ))}
        </div>
        {/* Show emoji reactions */}
        <div className="fixed top-8 left-1/2 -translate-x-1/2 flex gap-2 z-40">
          {emojiReactions.map((e, i) => (
            <span key={i} className="text-4xl animate-bounce drop-shadow">
              {e.emoji}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

export default App;
