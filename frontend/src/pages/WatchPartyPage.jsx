import React, { useState, useEffect, useRef } from "react";
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

const WatchPartyPage = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user, getAuthHeaders } = useAuth();
  const [parties, setParties] = useState([]);
  const [currentParty, setCurrentParty] = useState(null);
  const [movieDetails, setMovieDetails] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [partyName, setPartyName] = useState("");
  
  const socketRef = useRef(null);
  const chatRef = useRef(null);

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
    };
  }, [roomId]);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages]);

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

    socketRef.current.on("disconnect", () => {
      console.log("Disconnected from socket");
    });
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
      const movieRes = await axios.get(
        `${API}/${res.data.media_type}/${res.data.movie_id}`
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
    toast.success("Room link copied!");
  };

  const getTrailerUrl = () => {
    const videos = movieDetails?.videos?.results || [];
    const trailer = videos.find(
      (v) => v.type === "Trailer" && v.site === "YouTube"
    );
    return trailer?.key;
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
  const title = movieDetails?.title || movieDetails?.name;

  return (
    <div
      className="min-h-screen bg-[#050505] grid grid-cols-1 lg:grid-cols-[1fr_350px]"
      data-testid="watch-party-room"
    >
      {/* Video Section */}
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
            <button
              onClick={copyRoomLink}
              data-testid="copy-link-btn"
              className="btn-secondary flex items-center gap-2"
            >
              <Copy className="w-4 h-4" />
              Copy Link
            </button>
          </div>
        </div>

        {/* Video Player */}
        <div className="flex-1 relative bg-black">
          {trailerKey ? (
            <iframe
              src={`https://www.youtube.com/embed/${trailerKey}?autoplay=0&controls=1`}
              className="w-full h-full min-h-[400px]"
              allowFullScreen
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            />
          ) : (
            <div className="w-full h-full min-h-[400px] flex items-center justify-center">
              {movieDetails?.backdrop_path && (
                <img
                  src={`${IMAGE_BASE}original${movieDetails.backdrop_path}`}
                  alt={title}
                  className="absolute inset-0 w-full h-full object-cover opacity-50"
                />
              )}
              <div className="relative text-center">
                <button
                  onClick={togglePlayback}
                  data-testid="play-pause-btn"
                  className="w-20 h-20 rounded-full bg-[#7C3AED] flex items-center justify-center hover:bg-[#8B5CF6] transition-all neon-glow mb-4 mx-auto"
                >
                  {isPlaying ? (
                    <Pause className="w-10 h-10" />
                  ) : (
                    <Play className="w-10 h-10 ml-1" />
                  )}
                </button>
                <p className="text-[#A1A1AA]">
                  {isPlaying ? "Playing" : "Paused"} • Synced with room
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Participants Bar */}
        <div className="p-4 border-t border-white/10 flex items-center gap-4">
          <div className="flex items-center gap-2 text-[#A1A1AA]">
            <Users className="w-5 h-5" />
            <span>{participants.length} watching</span>
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
