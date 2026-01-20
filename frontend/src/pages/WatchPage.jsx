import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Settings,
  ChevronLeft,
  SkipBack,
  SkipForward,
  Monitor,
  Film,
  Tv,
  Server,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { API } from "../App";

const IMAGE_BASE = "https://image.tmdb.org/t/p/";

// Streaming sources for embedded players - ordered by reliability
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

const WatchPage = () => {
  const { type, id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, getAuthHeaders } = useAuth();
  
  // Check if this is custom content
  const isCustomContent = searchParams.get("custom") === "true";
  const customVideoUrl = searchParams.get("videoUrl");
  
  const [details, setDetails] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [loading, setLoading] = useState(true);
  const [selectedSource, setSelectedSource] = useState(STREAMING_SOURCES[0]);
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [season, setSeason] = useState(1);
  const [episode, setEpisode] = useState(1);
  
  const videoRef = useRef(null);
  const controlsTimeout = useRef(null);
  const iframeRef = useRef(null);

  useEffect(() => {
    if (isCustomContent) {
      // For custom content, fetch from our backend
      fetchCustomContent();
    } else {
      fetchDetails();
    }
  }, [id, type, isCustomContent]);

  useEffect(() => {
    // Save progress periodically
    const interval = setInterval(() => {
      if (user && currentTime > 0 && duration > 0) {
        saveProgress();
      }
    }, 30000); // Save every 30 seconds

    return () => clearInterval(interval);
  }, [user, currentTime, duration]);

  const fetchCustomContent = async () => {
    try {
      const res = await axios.get(`${API}/custom-content/${id}`);
      setDetails(res.data);
    } catch (error) {
      console.error("Failed to fetch custom content:", error);
      toast.error("Failed to load content");
    } finally {
      setLoading(false);
    }
  };

  const fetchDetails = async () => {
    try {
      const endpoint = type === "movie" ? "movies" : "tv";
      const res = await axios.get(`${API}/${endpoint}/${id}`);
      setDetails(res.data);
      
      // Set initial season/episode for TV shows
      if (type === "tv" && res.data.seasons?.length > 0) {
        const firstSeason = res.data.seasons.find(s => s.season_number > 0);
        if (firstSeason) {
          setSeason(firstSeason.season_number);
        }
      }
    } catch (error) {
      console.error("Failed to fetch details:", error);
      toast.error("Failed to load content");
    } finally {
      setLoading(false);
    }
  };

  const saveProgress = async () => {
    if (!user) return;

    try {
      await axios.post(
        `${API}/continue-watching`,
        {
          media_id: parseInt(id),
          media_type: type,
          title: details?.title || details?.name,
          poster_path: details?.poster_path,
          progress: currentTime,
          duration: duration,
          season: type === "tv" ? season : null,
          episode: type === "tv" ? episode : null,
        },
        { headers: getAuthHeaders() }
      );
    } catch (error) {
      console.error("Failed to save progress:", error);
    }
  };

  const getStreamingUrl = () => {
    if (isCustomContent && customVideoUrl) {
      return customVideoUrl;
    }
    
    if (selectedSource.id === "trailer") {
      return null; // Will show trailer
    }
    
    if (type === "tv") {
      // For TV shows, include season and episode
      const baseUrl = selectedSource.getUrl(type, id);
      if (selectedSource.id === "vidsrc") {
        return `https://vidsrc.xyz/embed/tv/${id}/${season}/${episode}`;
      } else if (selectedSource.id === "vidsrc2") {
        return `https://vidsrc.to/embed/tv/${id}/${season}/${episode}`;
      } else if (selectedSource.id === "autoembed") {
        return `https://autoembed.co/tv/tmdb/${id}-${season}-${episode}`;
      }
      return baseUrl;
    }
    
    return selectedSource.getUrl(type, id);
  };

  const getTrailerUrl = () => {
    const videos = details?.videos?.results || [];
    const trailer = videos.find(
      (v) => v.type === "Trailer" && v.site === "YouTube"
    );
    return trailer?.key;
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
      setDuration(videoRef.current.duration);
    }
  };

  const handleSeek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    if (videoRef.current) {
      videoRef.current.currentTime = percent * duration;
    }
  };

  const skip = (seconds) => {
    if (videoRef.current) {
      videoRef.current.currentTime += seconds;
    }
  };

  const toggleFullscreen = () => {
    const container = document.getElementById("video-container");
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      container?.requestFullscreen();
    }
  };

  const handleMouseMove = () => {
    setShowControls(true);
    clearTimeout(controlsTimeout.current);
    controlsTimeout.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3000);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const changeSource = (source) => {
    setSelectedSource(source);
    setShowSourcePicker(false);
    toast.success(`Switched to ${source.name}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#7C3AED] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const title = details?.title || details?.name;
  const trailerKey = getTrailerUrl();
  const streamingUrl = getStreamingUrl();
  const showEmbeddedPlayer = streamingUrl && selectedSource.id !== "trailer";

  return (
    <div className="min-h-screen bg-black" data-testid="watch-page">
      {/* Video Container */}
      <div
        id="video-container"
        className="relative w-full h-screen"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => isPlaying && setShowControls(false)}
      >
        {/* Embedded Streaming Player */}
        {showEmbeddedPlayer ? (
          <iframe
            ref={iframeRef}
            src={streamingUrl}
            className="w-full h-full"
            allowFullScreen
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            referrerPolicy="origin"
            sandbox="allow-forms allow-pointer-lock allow-same-origin allow-scripts allow-top-navigation"
          />
        ) : isCustomContent && customVideoUrl ? (
          // Custom video player for uploaded content
          <video
            ref={videoRef}
            src={customVideoUrl}
            className="w-full h-full object-contain bg-black"
            onTimeUpdate={handleTimeUpdate}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            controls
          />
        ) : trailerKey ? (
          // YouTube Trailer
          <iframe
            src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&controls=1&modestbranding=1&rel=0`}
            className="w-full h-full"
            allowFullScreen
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          />
        ) : (
          // Fallback with backdrop
          <div className="relative w-full h-full">
            <img
              src={`${IMAGE_BASE}original${details?.backdrop_path}`}
              alt={title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <div className="text-center">
                <div className="w-20 h-20 rounded-full bg-[#7C3AED]/20 flex items-center justify-center mb-4 mx-auto">
                  <Play className="w-10 h-10 text-[#7C3AED]" />
                </div>
                <h2 className="text-2xl font-bold mb-2">{title}</h2>
                <p className="text-[#A1A1AA] mb-4">
                  Select a streaming source to watch
                </p>
                <button
                  onClick={() => setShowSourcePicker(true)}
                  className="btn-primary"
                >
                  Choose Source
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Controls Overlay */}
        <div
          className={`absolute inset-0 transition-opacity duration-300 pointer-events-none ${
            showControls ? "opacity-100" : "opacity-0"
          }`}
        >
          {/* Top Bar */}
          <div className="absolute top-0 left-0 right-0 p-6 bg-gradient-to-b from-black/80 to-transparent pointer-events-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => navigate(-1)}
                  data-testid="back-btn"
                  className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center hover:bg-white/20 transition-all"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div>
                  <h1 className="text-xl font-bold">{title}</h1>
                  <p className="text-sm text-[#A1A1AA]">
                    {details?.release_date?.split("-")[0] ||
                      details?.first_air_date?.split("-")[0]}
                    {type === "tv" && ` • S${season} E${episode}`}
                  </p>
                </div>
              </div>

              {/* Source Selector */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowSourcePicker(!showSourcePicker)}
                  data-testid="source-picker-btn"
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-md hover:bg-white/20 transition-all"
                >
                  <Server className="w-4 h-4" />
                  <span className="text-sm">{selectedSource.name}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Source Picker Dropdown */}
          {showSourcePicker && (
            <div className="absolute top-20 right-6 bg-[#0A0A0A] border border-white/10 rounded-xl p-2 z-50 pointer-events-auto">
              <p className="text-xs text-[#A1A1AA] px-3 py-2">Select Source</p>
              {STREAMING_SOURCES.map((source) => (
                <button
                  key={source.id}
                  onClick={() => changeSource(source)}
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
                </button>
              ))}
            </div>
          )}

          {/* TV Show Episode Selector */}
          {type === "tv" && details?.seasons && showControls && (
            <div className="absolute top-20 left-6 bg-[#0A0A0A]/90 backdrop-blur-md border border-white/10 rounded-xl p-4 z-40 pointer-events-auto max-h-[300px] overflow-y-auto">
              <p className="text-sm font-semibold mb-3">Episodes</p>
              <div className="flex gap-2 mb-3">
                <select
                  value={season}
                  onChange={(e) => setSeason(parseInt(e.target.value))}
                  className="bg-white/10 border border-white/10 rounded-lg px-3 py-2 text-sm"
                >
                  {details.seasons
                    .filter((s) => s.season_number > 0)
                    .map((s) => (
                      <option key={s.season_number} value={s.season_number}>
                        Season {s.season_number}
                      </option>
                    ))}
                </select>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {[...Array(20)].map((_, i) => (
                  <button
                    key={i + 1}
                    onClick={() => setEpisode(i + 1)}
                    className={`w-10 h-10 rounded-lg text-sm font-medium transition-all ${
                      episode === i + 1
                        ? "bg-[#7C3AED] text-white"
                        : "bg-white/10 hover:bg-white/20"
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Bottom Controls - Only show for custom video */}
          {isCustomContent && customVideoUrl && (
            <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent pointer-events-auto">
              {/* Progress Bar */}
              <div
                className="relative h-1 bg-white/20 rounded-full mb-4 cursor-pointer group"
                onClick={handleSeek}
              >
                <div
                  className="absolute h-full bg-[#7C3AED] rounded-full"
                  style={{ width: `${(currentTime / duration) * 100}%` }}
                />
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ left: `${(currentTime / duration) * 100}%` }}
                />
              </div>

              {/* Controls Row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <button
                    onClick={togglePlay}
                    data-testid="play-pause-btn"
                    className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all"
                  >
                    {isPlaying ? (
                      <Pause className="w-5 h-5" />
                    ) : (
                      <Play className="w-5 h-5 ml-0.5" />
                    )}
                  </button>
                  <button
                    onClick={() => skip(-10)}
                    data-testid="skip-back-btn"
                    className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all"
                  >
                    <SkipBack className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => skip(10)}
                    data-testid="skip-forward-btn"
                    className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all"
                  >
                    <SkipForward className="w-5 h-5" />
                  </button>
                  <button
                    onClick={toggleMute}
                    data-testid="mute-btn"
                    className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all"
                  >
                    {isMuted ? (
                      <VolumeX className="w-5 h-5" />
                    ) : (
                      <Volume2 className="w-5 h-5" />
                    )}
                  </button>
                  <span className="text-sm text-[#A1A1AA] mono">
                    {formatTime(currentTime)} / {formatTime(duration || 0)}
                  </span>
                </div>

                <div className="flex items-center gap-4">
                  <button
                    onClick={toggleFullscreen}
                    data-testid="fullscreen-btn"
                    className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all"
                  >
                    <Maximize className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WatchPage;
