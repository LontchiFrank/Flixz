import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { io } from "socket.io-client";
import { toast } from "sonner";
import {
  Play,
  Pause,
  Users,
  Send,
  Copy,
  Share2,
  ChevronLeft,
  Plus,
  X,
  Video,
  VideoOff,
  Mic,
  MicOff,
  PhoneOff,
  Maximize2,
  Minimize2,
  Link2,
  Server,
  Monitor,
  Film,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { API } from "../App";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const IMAGE_BASE = "https://image.tmdb.org/t/p/";

// Streaming sources for embedded players - same as WatchPage
const STREAMING_SOURCES = [
  { id: "vidsrcicu", name: "VidSrc ICU", getUrl: (type, id) => `https://vidsrc.icu/embed/${type}/${id}` },
  { id: "vidsrcnl", name: "VidSrc NL", getUrl: (type, id) => `https://player.vidsrc.nl/embed/${type}/${id}` },
  { id: "vidsrccc", name: "VidSrc CC", getUrl: (type, id) => `https://vidsrc.cc/v2/embed/${type}/${id}` },
  { id: "superembed", name: "SuperEmbed", getUrl: (type, id) => `https://multiembed.mov/?video_id=${id}&tmdb=1` },
  { id: "embedsu", name: "Embed.su", getUrl: (type, id) => `https://embed.su/embed/${type}/${id}` },
  { id: "smashystream", name: "Smashy", getUrl: (type, id) => `https://player.smashy.stream/${type}/${id}` },
  { id: "moviesapi", name: "MoviesAPI", getUrl: (type, id) => `https://moviesapi.club/${type}/${id}` },
  { id: "vidsrcpro", name: "VidSrc Pro", getUrl: (type, id) => `https://vidsrc.pro/embed/${type}/${id}` },
  { id: "2embed", name: "2Embed", getUrl: (type, id) => `https://www.2embed.cc/embed/${id}` },
  { id: "trailer", name: "Trailer Only", getUrl: () => null },
];

// WebRTC Configuration
const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

const WatchPartyPage = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user, getAuthHeaders } = useAuth();
  
  // Party state
  const [parties, setParties] = useState([]);
  const [currentParty, setCurrentParty] = useState(null);
  const [movieDetails, setMovieDetails] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Create party state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [partyName, setPartyName] = useState("");
  
  // Video call state
  const [isInCall, setIsInCall] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoFullscreen, setIsVideoFullscreen] = useState(false);
  
  // Invite state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  
  // Streaming source state
  const [selectedSource, setSelectedSource] = useState(STREAMING_SOURCES[0]);
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [currentSourceIndex, setCurrentSourceIndex] = useState(0);
  
  // Refs
  const socketRef = useRef(null);
  const chatRef = useRef(null);
  const localVideoRef = useRef(null);
  const peerConnectionsRef = useRef({});

  useEffect(() => {
    if (roomId) {
      fetchPartyDetails();
      connectSocket();
    } else {
      fetchParties();
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      endCall();
    };
  }, [roomId]);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages]);

  // Update local video element when stream changes
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  const connectSocket = () => {
    socketRef.current = io(BACKEND_URL, {
      transports: ["websocket", "polling"],
    });

    socketRef.current.on("connect", () => {
      console.log("Connected to socket");
      socketRef.current.emit("join_room", {
        room_id: roomId,
        user_name: user?.name || "Anonymous",
      });
    });

    socketRef.current.on("user_joined", (data) => {
      toast.success(`${data.user_name} joined the party`);
      setParticipants((prev) => [...prev, { name: data.user_name }]);
    });

    socketRef.current.on("user_left", (data) => {
      toast.info(`${data.user_name} left the party`);
      setParticipants((prev) =>
        prev.filter((p) => p.name !== data.user_name)
      );
    });

    socketRef.current.on("playback_sync", (data) => {
      setIsPlaying(data.is_playing);
      setCurrentTime(data.current_time);
    });

    socketRef.current.on("new_message", (data) => {
      setMessages((prev) => [...prev, data]);
    });

    // WebRTC signaling events
    socketRef.current.on("webrtc_peers", async (data) => {
      console.log("Existing peers:", data.peers);
      for (const peer of data.peers) {
        await createPeerConnection(peer.sid, true);
      }
    });

    socketRef.current.on("webrtc_peer_joined", async (data) => {
      console.log("New peer joined:", data);
      toast.info(`${data.user_name} joined video call`);
    });

    socketRef.current.on("webrtc_peer_left", (data) => {
      console.log("Peer left:", data.sid);
      if (peerConnectionsRef.current[data.sid]) {
        peerConnectionsRef.current[data.sid].close();
        delete peerConnectionsRef.current[data.sid];
      }
      setRemoteStreams((prev) => {
        const updated = { ...prev };
        delete updated[data.sid];
        return updated;
      });
    });

    socketRef.current.on("webrtc_offer", async (data) => {
      console.log("Received offer from:", data.from);
      await handleOffer(data.from, data.offer);
    });

    socketRef.current.on("webrtc_answer", async (data) => {
      console.log("Received answer from:", data.from);
      const pc = peerConnectionsRef.current[data.from];
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
      }
    });

    socketRef.current.on("webrtc_ice_candidate", async (data) => {
      const pc = peerConnectionsRef.current[data.from];
      if (pc && data.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    });

    socketRef.current.on("webrtc_media_toggle", (data) => {
      console.log("Media toggle:", data);
    });

    socketRef.current.on("disconnect", () => {
      console.log("Disconnected from socket");
    });
  };

  // WebRTC Functions
  const createPeerConnection = async (peerId, createOffer = false) => {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    peerConnectionsRef.current[peerId] = pc;

    // Add local tracks
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
      });
    }

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit("webrtc_ice_candidate", {
          target: peerId,
          candidate: event.candidate,
        });
      }
    };

    // Handle remote stream
    pc.ontrack = (event) => {
      console.log("Received remote track from:", peerId);
      setRemoteStreams((prev) => ({
        ...prev,
        [peerId]: event.streams[0],
      }));
    };

    if (createOffer) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socketRef.current?.emit("webrtc_offer", {
        target: peerId,
        offer: offer,
      });
    }

    return pc;
  };

  const handleOffer = async (from, offer) => {
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
  };

  const startCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      setLocalStream(stream);
      setIsInCall(true);

      // Join WebRTC room
      socketRef.current?.emit("webrtc_join", {
        room_id: roomId,
        user_id: user?.user_id,
        user_name: user?.name,
      });

      toast.success("Joined video call");
    } catch (error) {
      console.error("Failed to start call:", error);
      toast.error("Failed to access camera/microphone");
    }
  };

  const endCall = () => {
    // Stop local stream
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
    }

    // Close peer connections
    Object.values(peerConnectionsRef.current).forEach((pc) => pc.close());
    peerConnectionsRef.current = {};

    // Clear remote streams
    setRemoteStreams({});
    setIsInCall(false);

    // Notify server
    socketRef.current?.emit("webrtc_leave", { room_id: roomId });
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
        socketRef.current?.emit("webrtc_toggle_media", {
          room_id: roomId,
          type: "video",
          enabled: videoTrack.enabled,
        });
      }
    }
  };

  const toggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
        socketRef.current?.emit("webrtc_toggle_media", {
          room_id: roomId,
          type: "audio",
          enabled: audioTrack.enabled,
        });
      }
    }
  };

  const fetchParties = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/watch-party`, {
        headers: getAuthHeaders(),
      });
      setParties(res.data.parties || []);
    } catch (error) {
      console.error("Failed to fetch parties:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPartyDetails = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/watch-party/${roomId}`);
      setCurrentParty(res.data);
      setParticipants(res.data.participants || []);
      setIsPlaying(res.data.is_playing);
      setCurrentTime(res.data.current_time);

      // Fetch movie details
      const endpoint = res.data.media_type === "movie" ? "movies" : "tv";
      const movieRes = await axios.get(
        `${API}/${endpoint}/${res.data.movie_id}`
      );
      setMovieDetails(movieRes.data);

      // Join party
      await axios.post(
        `${API}/watch-party/${roomId}/join`,
        {},
        { headers: getAuthHeaders() }
      );
    } catch (error) {
      console.error("Failed to fetch party:", error);
      toast.error("Failed to load watch party");
      navigate("/watch-party");
    } finally {
      setLoading(false);
    }
  };

  const searchMovies = async () => {
    if (!searchQuery.trim()) return;
    try {
      const res = await axios.get(`${API}/search/multi?query=${encodeURIComponent(searchQuery)}`);
      setSearchResults(
        res.data.results?.filter(
          (r) => r.media_type === "movie" || r.media_type === "tv"
        ) || []
      );
    } catch (error) {
      console.error("Search failed:", error);
    }
  };

  const createParty = async () => {
    if (!selectedMovie || !partyName.trim()) {
      toast.error("Please select a movie and enter a party name");
      return;
    }

    try {
      const res = await axios.post(
        `${API}/watch-party`,
        {
          name: partyName,
          movie_id: selectedMovie.id,
          media_type: selectedMovie.media_type || "movie",
        },
        { headers: getAuthHeaders() }
      );
      toast.success("Watch party created!");
      setCreateDialogOpen(false);
      navigate(`/watch-party/${res.data.room_id}`);
    } catch (error) {
      toast.error("Failed to create watch party");
    }
  };

  const togglePlayback = () => {
    const newState = !isPlaying;
    setIsPlaying(newState);
    socketRef.current?.emit("sync_playback", {
      room_id: roomId,
      is_playing: newState,
      current_time: currentTime,
    });
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    socketRef.current?.emit("chat_message", {
      room_id: roomId,
      message: newMessage,
      user_name: user?.name || "Anonymous",
    });
    setNewMessage("");
  };

  const copyRoomLink = () => {
    const link = `${window.location.origin}/watch-party/${roomId}`;
    navigator.clipboard.writeText(link);
    toast.success("Room link copied! Share with friends 🎉");
  };

  const shareToSocial = (platform) => {
    const link = `${window.location.origin}/watch-party/${roomId}`;
    const text = `Join my watch party on Flixz! We're watching ${movieDetails?.title || movieDetails?.name}`;
    
    const urls = {
      whatsapp: `https://wa.me/?text=${encodeURIComponent(text + " " + link)}`,
      twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}`,
      telegram: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`,
    };
    
    window.open(urls[platform], "_blank");
  };

  const sendInvite = async () => {
    if (!inviteEmail.trim()) {
      toast.error("Please enter an email");
      return;
    }

    try {
      await axios.post(
        `${API}/notifications/invite?room_id=${roomId}&invitee_email=${encodeURIComponent(inviteEmail)}`,
        {},
        { headers: getAuthHeaders() }
      );
      toast.success("Invitation sent!");
      setInviteEmail("");
      setInviteDialogOpen(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to send invitation");
    }
  };

  const getTrailerUrl = () => {
    const videos = movieDetails?.videos?.results || [];
    const trailer = videos.find(
      (v) => v.type === "Trailer" && v.site === "YouTube"
    );
    return trailer?.key;
  };

  const getStreamingUrl = () => {
    if (selectedSource.id === "trailer") {
      return null; // Will show trailer
    }
    
    const mediaType = currentParty?.media_type || "movie";
    const movieId = currentParty?.movie_id;
    
    if (!movieId) return null;
    
    return selectedSource.getUrl(mediaType, movieId);
  };

  const tryNextSource = () => {
    const nextIndex = (currentSourceIndex + 1) % (STREAMING_SOURCES.length - 1); // Skip "Trailer Only"
    setCurrentSourceIndex(nextIndex);
    setSelectedSource(STREAMING_SOURCES[nextIndex]);
    
    // Sync source change with other participants
    socketRef.current?.emit("sync_playback", {
      room_id: roomId,
      is_playing: isPlaying,
      current_time: currentTime,
      source: STREAMING_SOURCES[nextIndex].id,
    });
    
    toast.info(`Trying ${STREAMING_SOURCES[nextIndex].name}...`);
  };

  const changeSource = (source, index) => {
    setSelectedSource(source);
    setCurrentSourceIndex(index !== undefined ? index : STREAMING_SOURCES.findIndex(s => s.id === source.id));
    setShowSourcePicker(false);
    
    // Sync source change with other participants
    socketRef.current?.emit("sync_playback", {
      room_id: roomId,
      is_playing: isPlaying,
      current_time: currentTime,
      source: source.id,
    });
    
    toast.success(`Switched to ${source.name}`);
  };

  // List view
  if (!roomId) {
    return (
      <div className="min-h-screen bg-[#050505] pb-20 md:pb-8" data-testid="watch-party-list">
        <div className="max-w-7xl mx-auto px-6 md:px-12 pt-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold">Watch Party</h1>
              <p className="text-[#A1A1AA] mt-2">
                Watch movies together with friends
              </p>
            </div>

            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  data-testid="create-party-btn"
                  className="btn-primary flex items-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  Create Party
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-[#0A0A0A] border-white/10 max-w-lg">
                <DialogHeader>
                  <DialogTitle>Create Watch Party</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <Input
                    placeholder="Party name..."
                    value={partyName}
                    onChange={(e) => setPartyName(e.target.value)}
                    data-testid="party-name-input"
                    className="bg-black/50 border-white/10"
                  />

                  <div className="flex gap-2">
                    <Input
                      placeholder="Search for a movie or show..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && searchMovies()}
                      data-testid="movie-search-input"
                      className="bg-black/50 border-white/10"
                    />
                    <Button onClick={searchMovies} variant="secondary">
                      Search
                    </Button>
                  </div>

                  {searchResults.length > 0 && (
                    <div className="max-h-60 overflow-y-auto space-y-2">
                      {searchResults.slice(0, 5).map((item) => (
                        <div
                          key={item.id}
                          onClick={() => setSelectedMovie(item)}
                          data-testid={`search-result-${item.id}`}
                          className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all ${
                            selectedMovie?.id === item.id
                              ? "bg-[#7C3AED]/20 border border-[#7C3AED]"
                              : "bg-white/5 hover:bg-white/10"
                          }`}
                        >
                          {item.poster_path && (
                            <img
                              src={`${IMAGE_BASE}w92${item.poster_path}`}
                              alt={item.title || item.name}
                              className="w-12 h-16 object-cover rounded"
                            />
                          )}
                          <div>
                            <p className="font-medium">
                              {item.title || item.name}
                            </p>
                            <p className="text-sm text-[#A1A1AA]">
                              {(item.release_date || item.first_air_date)?.split("-")[0]} •{" "}
                              {item.media_type === "tv" ? "TV Show" : "Movie"}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <Button
                    onClick={createParty}
                    disabled={!selectedMovie || !partyName.trim()}
                    data-testid="confirm-create-party"
                    className="w-full btn-primary"
                  >
                    Create Party
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-12 h-12 border-4 border-[#7C3AED] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : parties.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {parties.map((party) => (
                <div
                  key={party.room_id}
                  onClick={() => navigate(`/watch-party/${party.room_id}`)}
                  data-testid={`party-card-${party.room_id}`}
                  className="glass rounded-xl p-6 cursor-pointer hover:bg-white/5 transition-all group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-lg group-hover:text-[#7C3AED] transition-colors">
                        {party.name}
                      </h3>
                      <p className="text-sm text-[#A1A1AA]">
                        Hosted by {party.host_name}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 text-[#A1A1AA]">
                      <Users className="w-4 h-4" />
                      <span className="text-sm">
                        {party.participants?.length || 1}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        party.is_playing ? "bg-[#10B981]" : "bg-[#F59E0B]"
                      }`}
                    />
                    <span className="text-sm text-[#A1A1AA]">
                      {party.is_playing ? "Playing" : "Paused"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-20">
              <Users className="w-16 h-16 text-[#52525B] mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">No active parties</h3>
              <p className="text-[#A1A1AA]">
                Create a watch party to get started
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Room view
  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#7C3AED] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const trailerKey = getTrailerUrl();
  const streamingUrl = getStreamingUrl();
  const title = movieDetails?.title || movieDetails?.name;
  const remoteStreamEntries = Object.entries(remoteStreams);
  const showEmbeddedPlayer = streamingUrl && selectedSource.id !== "trailer";

  return (
    <div
      className="min-h-screen bg-[#050505] grid grid-cols-1 lg:grid-cols-[1fr_380px]"
      data-testid="watch-party-room"
    >
      {/* Main Section */}
      <div className="relative flex flex-col">
        {/* Header */}
        <div className="p-4 flex items-center justify-between border-b border-white/10">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/watch-party")}
              data-testid="back-to-list"
              className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <h2 className="font-semibold">{currentParty?.name}</h2>
              <p className="text-sm text-[#A1A1AA]">{title}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Source Selector */}
            <button
              onClick={tryNextSource}
              data-testid="try-next-source-btn"
              className="flex items-center gap-2 px-3 py-2 rounded-full bg-[#7C3AED]/20 text-[#7C3AED] hover:bg-[#7C3AED]/30 transition-all"
            >
              <RefreshCw className="w-4 h-4" />
              <span className="text-sm hidden md:inline">Try Next</span>
            </button>
            <div className="relative">
              <button
                onClick={() => setShowSourcePicker(!showSourcePicker)}
                data-testid="source-picker-btn"
                className="flex items-center gap-2 px-3 py-2 rounded-full bg-white/10 hover:bg-white/20 transition-all"
              >
                <Server className="w-4 h-4" />
                <span className="text-sm hidden md:inline">{selectedSource.name}</span>
              </button>
              
              {/* Source Picker Dropdown */}
              {showSourcePicker && (
                <div className="absolute right-0 top-full mt-2 bg-[#0A0A0A] border border-white/10 rounded-xl p-2 z-50 min-w-[200px]">
                  <p className="text-xs text-[#A1A1AA] px-3 py-2">Select Streaming Source</p>
                  {STREAMING_SOURCES.map((source, index) => (
                    <button
                      key={source.id}
                      onClick={() => changeSource(source, index)}
                      data-testid={`source-${source.id}`}
                      className={`w-full text-left px-4 py-2 rounded-lg transition-all flex items-center gap-2 ${
                        selectedSource.id === source.id
                          ? "bg-[#7C3AED] text-white"
                          : "hover:bg-white/5"
                      }`}
                    >
                      {source.id === "trailer" ? (
                        <Film className="w-4 h-4" />
                      ) : (
                        <Monitor className="w-4 h-4" />
                      )}
                      {source.name}
                      {index < 3 && source.id !== "trailer" && (
                        <span className="ml-auto text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">
                          Popular
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            <button
              onClick={copyRoomLink}
              data-testid="copy-link-btn"
              className="btn-secondary flex items-center gap-2"
            >
              <Link2 className="w-4 h-4" />
              <span className="hidden md:inline">Copy Link</span>
            </button>
            
            {/* Share dropdown */}
            <div className="relative group">
              <button className="btn-secondary flex items-center gap-2">
                <Share2 className="w-4 h-4" />
                <span className="hidden md:inline">Share</span>
              </button>
              <div className="absolute right-0 top-full mt-2 bg-[#0A0A0A] border border-white/10 rounded-lg p-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 min-w-[150px]">
                <button
                  onClick={() => shareToSocial("whatsapp")}
                  className="w-full text-left px-3 py-2 rounded hover:bg-white/5 text-sm"
                >
                  WhatsApp
                </button>
                <button
                  onClick={() => shareToSocial("twitter")}
                  className="w-full text-left px-3 py-2 rounded hover:bg-white/5 text-sm"
                >
                  Twitter
                </button>
                <button
                  onClick={() => shareToSocial("telegram")}
                  className="w-full text-left px-3 py-2 rounded hover:bg-white/5 text-sm"
                >
                  Telegram
                </button>
              </div>
            </div>

            {/* Invite Dialog */}
            <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
              <DialogTrigger asChild>
                <button className="btn-primary flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Invite
                </button>
              </DialogTrigger>
              <DialogContent className="bg-[#0A0A0A] border-white/10">
                <DialogHeader>
                  <DialogTitle>Invite Friends</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <Input
                    placeholder="Enter friend's email..."
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    data-testid="invite-email-input"
                    className="bg-black/50 border-white/10"
                  />
                  <Button onClick={sendInvite} className="w-full btn-primary">
                    Send Invitation
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Video Player Section */}
        <div className={`flex-1 relative bg-black ${isVideoFullscreen ? 'fixed inset-0 z-50' : ''}`}>
          {/* Embedded Streaming Player (default) */}
          {showEmbeddedPlayer ? (
            <iframe
              src={streamingUrl}
              className="w-full h-full min-h-[400px]"
              allowFullScreen
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              referrerPolicy="origin"
              sandbox="allow-forms allow-pointer-lock allow-same-origin allow-scripts allow-top-navigation"
            />
          ) : trailerKey && selectedSource.id === "trailer" ? (
            // YouTube Trailer (fallback)
            <iframe
              src={`https://www.youtube.com/embed/${trailerKey}?autoplay=0&controls=1`}
              className="w-full h-full min-h-[400px]"
              allowFullScreen
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            />
          ) : (
            // Backdrop with instructions
            <div className="w-full h-full min-h-[400px] flex items-center justify-center">
              {movieDetails?.backdrop_path && (
                <img
                  src={`${IMAGE_BASE}original${movieDetails.backdrop_path}`}
                  alt={title}
                  className="absolute inset-0 w-full h-full object-cover opacity-30"
                />
              )}
              <div className="relative text-center p-6">
                <div className="w-20 h-20 rounded-full bg-[#7C3AED]/20 flex items-center justify-center mb-4 mx-auto">
                  <Film className="w-10 h-10 text-[#7C3AED]" />
                </div>
                <h3 className="text-xl font-bold mb-2">Select a Streaming Source</h3>
                <p className="text-[#A1A1AA] mb-4 max-w-md">
                  Click the source picker above to choose a streaming source, or click "Try Next" to automatically cycle through sources.
                </p>
                <button
                  onClick={tryNextSource}
                  className="btn-primary flex items-center gap-2 mx-auto"
                >
                  <RefreshCw className="w-5 h-5" />
                  Try First Source
                </button>
              </div>
            </div>
          )}

          {/* Fullscreen toggle */}
          <button
            onClick={() => setIsVideoFullscreen(!isVideoFullscreen)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/50 flex items-center justify-center hover:bg-black/70 transition-all z-10"
          >
            {isVideoFullscreen ? (
              <Minimize2 className="w-5 h-5" />
            ) : (
              <Maximize2 className="w-5 h-5" />
            )}
          </button>
          
          {/* Current source indicator */}
          <div className="absolute bottom-4 left-4 px-3 py-1.5 rounded-full bg-black/70 backdrop-blur-sm text-sm flex items-center gap-2 z-10">
            <Server className="w-4 h-4 text-[#7C3AED]" />
            {selectedSource.name}
          </div>
        </div>

        {/* Video Call Section */}
        <div className="border-t border-white/10">
          {/* Video Grid */}
          {isInCall && (
            <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 bg-black/50">
              {/* Local Video */}
              <div className="relative aspect-video rounded-lg overflow-hidden bg-[#121212]">
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/70 rounded text-xs">
                  You {!isVideoEnabled && "(Video Off)"}
                </div>
                {!isVideoEnabled && (
                  <div className="absolute inset-0 bg-[#121212] flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full bg-[#7C3AED] flex items-center justify-center text-xl font-bold">
                      {user?.name?.charAt(0).toUpperCase()}
                    </div>
                  </div>
                )}
              </div>

              {/* Remote Videos */}
              {remoteStreamEntries.map(([peerId, stream]) => (
                <div
                  key={peerId}
                  className="relative aspect-video rounded-lg overflow-hidden bg-[#121212]"
                >
                  <video
                    autoPlay
                    playsInline
                    ref={(el) => {
                      if (el) el.srcObject = stream;
                    }}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/70 rounded text-xs">
                    Participant
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Call Controls */}
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[#A1A1AA]">
              <Users className="w-5 h-5" />
              <span>{participants.length} watching</span>
            </div>

            <div className="flex items-center gap-2">
              {isInCall ? (
                <>
                  <button
                    onClick={toggleVideo}
                    data-testid="toggle-video-btn"
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                      isVideoEnabled
                        ? "bg-white/10 hover:bg-white/20"
                        : "bg-red-500/20 text-red-500"
                    }`}
                  >
                    {isVideoEnabled ? (
                      <Video className="w-5 h-5" />
                    ) : (
                      <VideoOff className="w-5 h-5" />
                    )}
                  </button>
                  <button
                    onClick={toggleAudio}
                    data-testid="toggle-audio-btn"
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                      isAudioEnabled
                        ? "bg-white/10 hover:bg-white/20"
                        : "bg-red-500/20 text-red-500"
                    }`}
                  >
                    {isAudioEnabled ? (
                      <Mic className="w-5 h-5" />
                    ) : (
                      <MicOff className="w-5 h-5" />
                    )}
                  </button>
                  <button
                    onClick={endCall}
                    data-testid="end-call-btn"
                    className="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center hover:bg-red-600 transition-all"
                  >
                    <PhoneOff className="w-5 h-5" />
                  </button>
                </>
              ) : (
                <button
                  onClick={startCall}
                  data-testid="start-call-btn"
                  className="btn-primary flex items-center gap-2"
                >
                  <Video className="w-5 h-5" />
                  Join Video Call
                </button>
              )}
            </div>

            <div className="flex -space-x-2">
              {participants.slice(0, 5).map((p, i) => (
                <div
                  key={i}
                  className="w-8 h-8 rounded-full bg-[#7C3AED] flex items-center justify-center text-sm font-semibold border-2 border-[#050505]"
                >
                  {p.name?.charAt(0).toUpperCase()}
                </div>
              ))}
              {participants.length > 5 && (
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs border-2 border-[#050505]">
                  +{participants.length - 5}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Chat Section */}
      <div className="border-l border-white/10 flex flex-col h-screen lg:h-auto">
        <div className="p-4 border-b border-white/10">
          <h3 className="font-semibold">Chat</h3>
        </div>

        {/* Messages */}
        <div
          ref={chatRef}
          className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[400px] lg:max-h-none"
        >
          {messages.length === 0 ? (
            <div className="text-center text-[#A1A1AA] py-8">
              <p>No messages yet</p>
              <p className="text-sm">Start the conversation!</p>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div key={i} className="chat-message">
                <div className="flex items-start gap-2">
                  <div className="w-8 h-8 rounded-full bg-[#7C3AED] flex items-center justify-center text-sm font-semibold flex-shrink-0">
                    {msg.user_name?.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{msg.user_name}</span>
                      <span className="text-xs text-[#52525B]">
                        {new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <p className="text-sm text-[#A1A1AA] mt-1">{msg.message}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Message Input */}
        <form
          onSubmit={sendMessage}
          className="p-4 border-t border-white/10 flex gap-2"
        >
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            data-testid="chat-input"
            className="bg-black/50 border-white/10"
          />
          <Button
            type="submit"
            data-testid="send-message-btn"
            className="bg-[#7C3AED] hover:bg-[#8B5CF6]"
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
};

export default WatchPartyPage;
