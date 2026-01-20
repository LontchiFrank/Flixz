import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { API } from "../App";

const IMAGE_BASE = "https://image.tmdb.org/t/p/";

const WatchPage = () => {
  const { type, id } = useParams();
  const navigate = useNavigate();
  const { user, getAuthHeaders } = useAuth();
  const [details, setDetails] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [loading, setLoading] = useState(true);
  const videoRef = useRef(null);
  const controlsTimeout = useRef(null);

  useEffect(() => {
    fetchDetails();
  }, [id, type]);

  useEffect(() => {
    // Save progress periodically
    const interval = setInterval(() => {
      if (user && currentTime > 0 && duration > 0) {
        saveProgress();
      }
    }, 30000); // Save every 30 seconds

    return () => clearInterval(interval);
  }, [user, currentTime, duration]);

  const fetchDetails = async () => {
    try {
      // Use plural endpoint (movies/tv)
      const endpoint = type === "movie" ? "movies" : "tv";
      const res = await axios.get(`${API}/${endpoint}/${id}`);
      setDetails(res.data);
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
        },
        { headers: getAuthHeaders() }
      );
    } catch (error) {
      console.error("Failed to save progress:", error);
    }
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

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#7C3AED] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const title = details?.title || details?.name;
  const trailerKey = getTrailerUrl();

  return (
    <div className="min-h-screen bg-black" data-testid="watch-page">
      {/* Video Container */}
      <div
        id="video-container"
        className="relative w-full h-screen"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => isPlaying && setShowControls(false)}
      >
        {/* Video/Trailer */}
        {trailerKey ? (
          <iframe
            src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&controls=0&modestbranding=1&rel=0`}
            className="w-full h-full"
            allowFullScreen
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          />
        ) : (
          <div className="relative w-full h-full">
            {/* Placeholder Video with Backdrop */}
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
                <p className="text-[#A1A1AA]">
                  Full streaming coming soon. Enjoy the trailer!
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Controls Overlay */}
        <div
          className={`absolute inset-0 transition-opacity duration-300 ${
            showControls ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          {/* Top Bar */}
          <div className="absolute top-0 left-0 right-0 p-6 bg-gradient-to-b from-black/80 to-transparent">
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
                </p>
              </div>
            </div>
          </div>

          {/* Center Play Button */}
          {!trailerKey && (
            <div className="absolute inset-0 flex items-center justify-center">
              <button
                onClick={togglePlay}
                data-testid="center-play-btn"
                className="w-20 h-20 rounded-full bg-[#7C3AED] flex items-center justify-center hover:bg-[#8B5CF6] transition-all neon-glow"
              >
                {isPlaying ? (
                  <Pause className="w-10 h-10" />
                ) : (
                  <Play className="w-10 h-10 ml-1" />
                )}
              </button>
            </div>
          )}

          {/* Bottom Controls */}
          <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent">
            {/* Progress Bar */}
            {!trailerKey && (
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
            )}

            {/* Controls Row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {!trailerKey && (
                  <>
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
                  </>
                )}
              </div>

              <div className="flex items-center gap-4">
                <button
                  data-testid="settings-btn"
                  className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all"
                >
                  <Settings className="w-5 h-5" />
                </button>
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
        </div>
      </div>
    </div>
  );
};

export default WatchPage;
