import React, { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { io } from "socket.io-client";
import {
  Play,
  Users,
  Share2,
  ExternalLink,
  Youtube,
  ChevronLeft,
  Video,
  VideoOff,
  Mic,
  MicOff,
  PhoneOff,
  MonitorUp,
  MonitorStop,
  Copy,
  UserPlus,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "https://flixz.onrender.com";

// WebRTC Configuration
const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

const YouTubePage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();

  const [videoUrl, setVideoUrl] = useState("");
  const [currentVideo, setCurrentVideo] = useState(null);
  const [roomId, setRoomId] = useState(searchParams.get("room") || null);

  // Video call state
  const [isInCall, setIsInCall] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [screenStream, setScreenStream] = useState(null);
  const [participants, setParticipants] = useState([]);

  // Screen sharing state (for main view)
  const [activeScreenShare, setActiveScreenShare] = useState(null); // { sid, name }

  // Refs
  const socketRef = useRef(null);
  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const peerConnectionsRef = useRef({});
  const pendingCandidatesRef = useRef({});

  // Keep localStreamRef in sync
  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  const extractVideoId = (url) => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /^([a-zA-Z0-9_-]{11})$/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    return null;
  };

  const handleLoadVideo = () => {
    const videoId = extractVideoId(videoUrl);
    if (!videoId) {
      toast.error("Invalid YouTube URL. Please enter a valid YouTube link or video ID");
      return;
    }

    setCurrentVideo(videoId);

    // Share video with room if in call
    if (roomId && socketRef.current) {
      socketRef.current.emit("youtube_video_change", {
        room_id: roomId,
        video_id: videoId,
        user_name: user?.name,
      });
    }

    toast.success("Video loaded!");
  };

  const handleShare = () => {
    if (!currentVideo) {
      toast.error("Please load a video first");
      return;
    }

    const baseUrl = window.location.origin + window.location.pathname;
    const shareUrl = roomId
      ? `${baseUrl}?room=${roomId}&video=${currentVideo}`
      : `https://youtube.com/watch?v=${currentVideo}`;

    navigator.clipboard.writeText(shareUrl);
    toast.success(roomId ? "Room link copied!" : "YouTube link copied!");
  };

  // WebRTC Functions
  const createPeerConnection = useCallback(
    async (peerId, createOffer = false) => {
      if (peerConnectionsRef.current[peerId]) {
        return peerConnectionsRef.current[peerId];
      }

      const pc = new RTCPeerConnection(RTC_CONFIG);
      peerConnectionsRef.current[peerId] = pc;

      const stream = localStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socketRef.current?.emit("webrtc_ice_candidate", {
            target: peerId,
            candidate: event.candidate,
          });
        }
      };

      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          setRemoteStreams((prev) => ({
            ...prev,
            [peerId]: event.streams[0],
          }));
        }
      };

      if (pendingCandidatesRef.current[peerId]) {
        for (const candidate of pendingCandidatesRef.current[peerId]) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
        delete pendingCandidatesRef.current[peerId];
      }

      if (createOffer) {
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        await pc.setLocalDescription(offer);
        socketRef.current?.emit("webrtc_offer", {
          target: peerId,
          offer: offer,
        });
      }

      return pc;
    },
    []
  );

  const handleOffer = useCallback(
    async (from, offer) => {
      let pc = peerConnectionsRef.current[from];
      if (!pc) {
        pc = await createPeerConnection(from, false);
      }

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socketRef.current?.emit("webrtc_answer", {
        target: from,
        answer: answer,
      });
    },
    [createPeerConnection]
  );

  // Room management
  const createRoom = () => {
    if (!user) {
      toast.error("Please login to create a room");
      navigate("/login");
      return;
    }

    const newRoomId = `youtube_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setRoomId(newRoomId);
    setSearchParams({ room: newRoomId });
    connectSocket(newRoomId);
    toast.success("Room created! Share the link with friends.");
  };

  const connectSocket = useCallback((room) => {
    socketRef.current = io(BACKEND_URL, {
      transports: ["websocket", "polling"],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      withCredentials: true,
    });

    socketRef.current.on("connect", () => {
      socketRef.current.emit("join_room", {
        room_id: room,
        user_name: user?.name || "Anonymous",
      });
    });

    socketRef.current.on("user_joined", (data) => {
      toast.success(`${data.user_name} joined the room`);
      setParticipants((prev) => [...prev, { name: data.user_name }]);
    });

    socketRef.current.on("user_left", (data) => {
      toast.info(`${data.user_name} left the room`);
      setParticipants((prev) => prev.filter((p) => p.name !== data.user_name));
    });

    socketRef.current.on("youtube_video_change", (data) => {
      if (data.user_name !== user?.name) {
        setCurrentVideo(data.video_id);
        toast.info(`${data.user_name} changed the video`);
      }
    });

    // WebRTC signaling
    socketRef.current.on("webrtc_peers", async (data) => {
      // Existing peers list received
    });

    socketRef.current.on("webrtc_peer_joined", async (data) => {
      if (localStreamRef.current) {
        await createPeerConnection(data.sid, true);
      }
    });

    socketRef.current.on("webrtc_offer", async (data) => {
      await handleOffer(data.from, data.offer);
    });

    socketRef.current.on("webrtc_answer", async (data) => {
      const pc = peerConnectionsRef.current[data.from];
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
      }
    });

    socketRef.current.on("webrtc_peer_left", (data) => {
      const pc = peerConnectionsRef.current[data.sid];
      if (pc) {
        pc.close();
        delete peerConnectionsRef.current[data.sid];
      }
      setRemoteStreams((prev) => {
        const updated = { ...prev };
        delete updated[data.sid];
        return updated;
      });
    });

    socketRef.current.on("webrtc_ice_candidate", async (data) => {
      const pc = peerConnectionsRef.current[data.from];
      if (pc && data.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      } else if (data.candidate) {
        if (!pendingCandidatesRef.current[data.from]) {
          pendingCandidatesRef.current[data.from] = [];
        }
        pendingCandidatesRef.current[data.from].push(data.candidate);
      }
    });

    // Screen sharing events
    socketRef.current.on("screen_share_started", (data) => {
      console.log("🖥️ Screen sharing started by:", data.user_name, "sid:", data.sid);

      setActiveScreenShare({
        sid: data.sid,
        name: data.user_name,
      });

      toast.info(`${data.user_name} is now sharing their screen`, { duration: 3000 });
    });

    socketRef.current.on("screen_share_stopped", (data) => {
      console.log("🖥️ Screen sharing stopped by:", data.user_name);

      setActiveScreenShare(null);
      toast.info(`${data.user_name} stopped sharing their screen`);
    });
  }, [user, createPeerConnection, handleOffer]);

  // Video call controls
  const startCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });

      localStreamRef.current = stream;
      setLocalStream(stream);
      setIsInCall(true);

      await new Promise((resolve) => setTimeout(resolve, 100));

      socketRef.current?.emit("webrtc_join", {
        room_id: roomId,
        user_id: user?.user_id,
        user_name: user?.name,
      });

      toast.success("Joined video call!");
    } catch (error) {
      console.error("Failed to start call:", error);
      toast.error("Failed to access camera/microphone");
    }
  };

  const endCall = useCallback(() => {
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
    }

    if (screenStream) {
      screenStream.getTracks().forEach((track) => track.stop());
      setScreenStream(null);
      setIsSharingScreen(false);
    }

    Object.values(peerConnectionsRef.current).forEach((pc) => pc.close());
    peerConnectionsRef.current = {};

    setRemoteStreams({});
    setIsInCall(false);

    socketRef.current?.emit("webrtc_leave", { room_id: roomId });
  }, [localStream, screenStream, roomId]);

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
      }
    }
  };

  const toggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
      }
    }
  };

  const startScreenShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: "always",
          displaySurface: "monitor"
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        }
      });

      setScreenStream(stream);
      setIsSharingScreen(true);

      // Notify all participants
      socketRef.current?.emit("screen_share_started", {
        room_id: roomId,
        user_name: user?.name,
      });

      const videoTrack = stream.getVideoTracks()[0];
      Object.values(peerConnectionsRef.current).forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender) {
          sender.replaceTrack(videoTrack);
        }
      });

      videoTrack.onended = () => {
        stopScreenShare();
      };

      toast.success("You are now sharing your screen. Others see your screen in full view.");
    } catch (error) {
      console.error("Failed to start screen share:", error);
      toast.error("Failed to start screen sharing");
    }
  };

  const stopScreenShare = () => {
    if (screenStream) {
      screenStream.getTracks().forEach((track) => track.stop());
      setScreenStream(null);
    }
    setIsSharingScreen(false);

    // Notify all participants
    socketRef.current?.emit("screen_share_stopped", {
      room_id: roomId,
      user_name: user?.name,
    });

    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      Object.values(peerConnectionsRef.current).forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender && videoTrack) {
          sender.replaceTrack(videoTrack);
        }
      });
    }

    toast.info("Screen sharing stopped");
  };

  // Initialize from URL params
  useEffect(() => {
    const room = searchParams.get("room");
    const video = searchParams.get("video");

    if (room) {
      setRoomId(room);
      connectSocket(room);
    }

    if (video) {
      setCurrentVideo(video);
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      endCall();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update local video element
  useEffect(() => {
    if (localVideoRef.current && localStream && isInCall) {
      if (localVideoRef.current.srcObject !== localStream) {
        localVideoRef.current.srcObject = localStream;
      }
    }
  }, [localStream, isInCall]);

  const remoteStreamEntries = Object.entries(remoteStreams);

  return (
    <div className="min-h-screen bg-[#050505] pb-20 md:pb-8">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-[#050505]/95 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-12 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate(-1)}
                className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2">
                <Youtube className="w-8 h-8 text-red-500" />
                <h1 className="text-xl md:text-2xl font-bold">YouTube Player</h1>
                {roomId && (
                  <span className="px-2 py-1 text-xs bg-[#7C3AED]/20 text-[#7C3AED] rounded-full">
                    Room Active
                  </span>
                )}
              </div>
            </div>
            {roomId && (
              <Button
                onClick={handleShare}
                className="btn-secondary flex items-center gap-2"
              >
                <Copy className="w-4 h-4" />
                Copy Room Link
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-12 py-6 md:py-8">
        {/* Video Input Section */}
        <div className="glass rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Watch YouTube Videos</h2>
          <p className="text-[#A1A1AA] text-sm mb-4">
            Paste a YouTube URL or video ID to watch videos with friends
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLoadVideo()}
              placeholder="https://youtube.com/watch?v=... or video ID"
              className="flex-1 bg-black/50 border-white/10"
            />
            <Button
              onClick={handleLoadVideo}
              className="btn-primary flex items-center gap-2 w-full sm:w-auto"
            >
              <Play className="w-4 h-4" />
              Load Video
            </Button>
          </div>
        </div>

        {/* Video Player */}
        {currentVideo ? (
          <div className="space-y-4">
            <div className="relative w-full rounded-xl overflow-hidden bg-black aspect-video min-h-[400px] md:min-h-[600px]">
              {/* Active Screen Share View - Takes Priority */}
              {activeScreenShare && !isSharingScreen && remoteStreams[activeScreenShare.sid] ? (
                <>
                  {/* Screen Share Banner */}
                  <div className="absolute top-4 left-4 z-20 px-4 py-2 bg-green-500/90 backdrop-blur-sm rounded-full text-white text-sm font-medium flex items-center gap-2">
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                    {activeScreenShare.name} is sharing their screen
                  </div>

                  {/* Main Screen Share Video */}
                  <video
                    autoPlay
                    playsInline
                    ref={(el) => {
                      if (el && remoteStreams[activeScreenShare.sid]) {
                        const stream = remoteStreams[activeScreenShare.sid];
                        if (el.srcObject !== stream) {
                          el.srcObject = stream;
                          el.play().catch((err) => {
                            console.log("Screen share video play error:", err.name);
                          });
                        }
                      }
                    }}
                    className="w-full h-full object-contain bg-black"
                  />

                  {/* Info overlay */}
                  <div className="absolute bottom-4 left-4 right-4 text-center text-white/80 text-sm">
                    You are viewing {activeScreenShare.name}'s screen • Video and audio are synced in real-time
                  </div>
                </>
              ) : isSharingScreen ? (
                /* When I'm sharing, show banner and regular YouTube video */
                <>
                  <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-20 px-4 py-2 bg-green-500/90 backdrop-blur-sm rounded-full text-white text-sm font-medium flex items-center gap-2">
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                    You are sharing your screen
                  </div>
                  <iframe
                    src={`https://www.youtube.com/embed/${currentVideo}?autoplay=1&rel=0`}
                    className="w-full h-full"
                    allowFullScreen
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    title="YouTube video player"
                  />
                </>
              ) : (
                /* Normal view */
                <iframe
                  src={`https://www.youtube.com/embed/${currentVideo}?autoplay=1&rel=0`}
                  className="w-full h-full"
                  allowFullScreen
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  title="YouTube video player"
                />
              )}

              {/* Local Video (PiP) - Hidden when viewing screen share */}
              {isInCall && localStream && !(activeScreenShare && !isSharingScreen) && (
                <div className="absolute bottom-4 right-4 w-48 h-36 rounded-lg overflow-hidden border-2 border-[#7C3AED] shadow-2xl bg-[#121212] z-10">
                  <video
                    ref={localVideoRef}
                    muted
                    playsInline
                    autoPlay
                    className="w-full h-full object-cover"
                    style={{ transform: "scaleX(-1)" }}
                  />
                  <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/80 rounded text-xs">
                    You {!isVideoEnabled && "📵"}
                  </div>
                  {!isVideoEnabled && (
                    <div className="absolute inset-0 bg-[#121212] flex items-center justify-center">
                      <div className="w-12 h-12 rounded-full bg-[#7C3AED] flex items-center justify-center text-xl font-bold">
                        {user?.name?.charAt(0).toUpperCase()}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Remote Videos - Hidden when viewing screen share */}
              {isInCall && remoteStreamEntries.length > 0 && !(activeScreenShare && !isSharingScreen) && (
                <div className="absolute top-4 right-4 space-y-2 z-10">
                  {remoteStreamEntries.slice(0, 3).map(([peerId, stream]) => (
                    <div
                      key={peerId}
                      className="w-48 h-36 rounded-lg overflow-hidden border-2 border-white/20 shadow-2xl bg-[#121212]"
                    >
                      <video
                        autoPlay
                        playsInline
                        ref={(el) => {
                          if (el && stream && el.srcObject !== stream) {
                            el.srcObject = stream;
                          }
                        }}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                  {remoteStreamEntries.length > 3 && (
                    <div className="w-48 h-12 rounded-lg bg-black/80 flex items-center justify-center text-sm">
                      +{remoteStreamEntries.length - 3} more
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Room & Call Controls */}
            <div className="glass rounded-xl p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-sm text-[#A1A1AA]">
                  <Users className="w-4 h-4" />
                  <span>{participants.length + 1} watching</span>
                </div>

                <div className="flex items-center gap-2">
                  {!roomId ? (
                    <Button onClick={createRoom} className="btn-primary flex items-center gap-2">
                      <UserPlus className="w-4 h-4" />
                      Create Room
                    </Button>
                  ) : isInCall ? (
                    <>
                      <button
                        onClick={toggleVideo}
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                          isVideoEnabled
                            ? "bg-white/10 hover:bg-white/20"
                            : "bg-red-500/20 text-red-500"
                        }`}
                      >
                        {isVideoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                      </button>
                      <button
                        onClick={toggleAudio}
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                          isAudioEnabled
                            ? "bg-white/10 hover:bg-white/20"
                            : "bg-red-500/20 text-red-500"
                        }`}
                      >
                        {isAudioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                      </button>
                      <button
                        onClick={isSharingScreen ? stopScreenShare : startScreenShare}
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                          isSharingScreen
                            ? "bg-green-500/20 text-green-400"
                            : "bg-white/10 hover:bg-white/20"
                        }`}
                        title={isSharingScreen ? "Stop sharing" : "Share screen"}
                      >
                        {isSharingScreen ? <MonitorStop className="w-5 h-5" /> : <MonitorUp className="w-5 h-5" />}
                      </button>
                      <button
                        onClick={endCall}
                        className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center hover:bg-red-600 transition-all"
                      >
                        <PhoneOff className="w-5 h-5" />
                      </button>
                    </>
                  ) : (
                    <Button onClick={startCall} className="btn-primary flex items-center gap-2">
                      <Video className="w-4 h-4" />
                      Join Video Call
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-3">
              <Button onClick={handleShare} className="btn-secondary flex items-center gap-2">
                <Share2 className="w-4 h-4" />
                {roomId ? "Share Room" : "Share Link"}
              </Button>
              <a
                href={`https://youtube.com/watch?v=${currentVideo}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary flex items-center gap-2"
              >
                <ExternalLink className="w-4 h-4" />
                Open in YouTube
              </a>
            </div>
          </div>
        ) : (
          <div className="glass rounded-xl p-12 text-center">
            <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
              <Youtube className="w-10 h-10 text-red-500" />
            </div>
            <h3 className="text-xl font-bold mb-2">No Video Loaded</h3>
            <p className="text-[#A1A1AA] mb-6 max-w-md mx-auto">
              Enter a YouTube URL or video ID above to start watching
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <div className="glass rounded-lg p-4 max-w-xs">
                <p className="text-sm text-[#A1A1AA] mb-2">Example URL:</p>
                <code className="text-xs text-[#7C3AED] break-all">
                  https://youtube.com/watch?v=dQw4w9WgXcQ
                </code>
              </div>
              <div className="glass rounded-lg p-4 max-w-xs">
                <p className="text-sm text-[#A1A1AA] mb-2">Or just the ID:</p>
                <code className="text-xs text-[#7C3AED]">dQw4w9WgXcQ</code>
              </div>
            </div>
          </div>
        )}

        {/* Info Section */}
        <div className="mt-8 glass rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4">Features</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#7C3AED]/20 flex items-center justify-center flex-shrink-0">
                <Video className="w-5 h-5 text-[#7C3AED]" />
              </div>
              <div>
                <h4 className="font-medium mb-1">Video Calls</h4>
                <p className="text-sm text-[#A1A1AA]">
                  See and talk to friends while watching together
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#7C3AED]/20 flex items-center justify-center flex-shrink-0">
                <MonitorUp className="w-5 h-5 text-[#7C3AED]" />
              </div>
              <div>
                <h4 className="font-medium mb-1">Screen Sharing</h4>
                <p className="text-sm text-[#A1A1AA]">
                  Share your screen to watch any content together
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#7C3AED]/20 flex items-center justify-center flex-shrink-0">
                <Users className="w-5 h-5 text-[#7C3AED]" />
              </div>
              <div>
                <h4 className="font-medium mb-1">Watch Together</h4>
                <p className="text-sm text-[#A1A1AA]">
                  Create rooms and invite unlimited friends
                </p>
              </div>
            </div>
          </div>

          {!roomId && (
            <div className="mt-6 p-4 bg-[#7C3AED]/10 border border-[#7C3AED]/20 rounded-lg">
              <p className="text-sm text-[#A1A1AA]">
                💡 <span className="text-white font-medium">Tip:</span> Create a room first, then load a video and join the video call to watch together with friends. You can also screen share any other content!
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default YouTubePage;
