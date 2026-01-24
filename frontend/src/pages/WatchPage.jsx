import React, { useState, useEffect, useRef, useCallback } from "react";
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
  Download,
  X,
  Shield,
  Globe,
  Chrome,
  Info,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { API } from "../App";

const IMAGE_BASE = "https://image.tmdb.org/t/p/";

// Streaming sources for embedded players - ordered by reliability and minimal ads
const STREAMING_SOURCES = [
  { id: "vidsrcxyz", name: "VidSrc XYZ", getUrl: (type, id) => `https://vidsrc.xyz/embed/${type}/${id}` },
  { id: "vidsrcto", name: "VidSrc TO", getUrl: (type, id) => `https://vidsrc.to/embed/${type}/${id}` },
  { id: "vidsrcme", name: "VidSrc ME", getUrl: (type, id) => `https://vidsrc.me/embed/${type}/${id}` },
  { id: "vidsrcpro", name: "VidSrc Pro", getUrl: (type, id) => `https://vidsrc.pro/embed/${type}/${id}` },
  { id: "embedsu", name: "Embed.su", getUrl: (type, id) => `https://embed.su/embed/${type}/${id}` },
  { id: "autoembed", name: "AutoEmbed", getUrl: (type, id) => `https://player.autoembed.cc/embed/${type}/${id}` },
  { id: "vidsrcnl", name: "VidSrc NL", getUrl: (type, id) => `https://player.vidsrc.nl/embed/${type}/${id}` },
  { id: "smashystream", name: "Smashy Stream", getUrl: (type, id) => `https://player.smashy.stream/${type}/${id}` },
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
  const [sourceError, setSourceError] = useState(false);
  const [currentSourceIndex, setCurrentSourceIndex] = useState(0);
  const [showEpisodePicker, setShowEpisodePicker] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeError, setIframeError] = useState(false);

  const videoRef = useRef(null);
  const controlsTimeout = useRef(null);
  const iframeRef = useRef(null);
  const loadTimeoutRef = useRef(null);

  const fetchCustomContent = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/custom-content/${id}`);
      setDetails(res.data);
    } catch (error) {
      console.error("Failed to fetch custom content:", error);
      toast.error("Failed to load content");
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchDetails = useCallback(async () => {
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
  }, [type, id]);

  const saveProgress = useCallback(async () => {
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
        { headers: getAuthHeaders(), withCredentials: true }
      );
    } catch (error) {
      console.error("Failed to save progress:", error);
    }
  }, [user, id, type, details, currentTime, duration, season, episode, getAuthHeaders]);

  useEffect(() => {
    if (isCustomContent) {
      // For custom content, fetch from our backend
      fetchCustomContent();
    } else {
      fetchDetails();
    }
  }, [id, type, isCustomContent, fetchCustomContent, fetchDetails]);

  // Reset error state when source changes
  useEffect(() => {
    setSourceError(false);
    setIframeLoaded(false);
    setIframeError(false);

    // Clear any existing timeout
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
    }

    // Set a timeout to detect if iframe doesn't load within 10 seconds
    loadTimeoutRef.current = setTimeout(() => {
      if (!iframeLoaded) {
        console.warn("⚠️ Iframe failed to load within 10 seconds");
        setIframeError(true);
        toast.error("This source is taking too long to load. Try another source.", {
          duration: 5000,
        });
      }
    }, 10000);

    return () => {
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
      }
    };
  }, [selectedSource, season, episode]);

  useEffect(() => {
    // Save progress periodically
    const interval = setInterval(() => {
      if (user && currentTime > 0 && duration > 0) {
        saveProgress();
      }
    }, 30000); // Save every 30 seconds

    return () => clearInterval(interval);
  }, [user, currentTime, duration, saveProgress]);

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
      // Hide episode and source pickers when entering fullscreen
      if (document.fullscreenElement) {
        setShowEpisodePicker(false);
        setShowSourcePicker(false);
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const getStreamingUrl = () => {
    if (isCustomContent && customVideoUrl) {
      return customVideoUrl;
    }
    
    if (selectedSource.id === "trailer") {
      return null; // Will show trailer
    }
    
    if (type === "tv") {
      // For TV shows, include season and episode based on source
      switch (selectedSource.id) {
        case "vidsrcxyz":
          return `https://vidsrc.xyz/embed/tv/${id}/${season}/${episode}`;
        case "vidsrcto":
          return `https://vidsrc.to/embed/tv/${id}/${season}/${episode}`;
        case "vidsrcme":
          return `https://vidsrc.me/embed/tv/${id}/${season}/${episode}`;
        case "vidsrcpro":
          return `https://vidsrc.pro/embed/tv/${id}/${season}/${episode}`;
        case "embedsu":
          return `https://embed.su/embed/tv/${id}/${season}/${episode}`;
        case "autoembed":
          return `https://player.autoembed.cc/embed/tv/${id}/${season}/${episode}`;
        case "vidsrcnl":
          return `https://player.vidsrc.nl/embed/tv/${id}/${season}/${episode}`;
        case "smashystream":
          return `https://player.smashy.stream/tv/${id}?s=${season}&e=${episode}`;
        default:
          return selectedSource.getUrl(type, id);
      }
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

  const tryNextSource = () => {
    const nextIndex = (currentSourceIndex + 1) % (STREAMING_SOURCES.length - 1); // Skip "Trailer Only"
    setCurrentSourceIndex(nextIndex);
    setSelectedSource(STREAMING_SOURCES[nextIndex]);
    setSourceError(false);
    toast.info(`Trying ${STREAMING_SOURCES[nextIndex].name}...`);
  };

  const changeSource = (source, index) => {
    setSelectedSource(source);
    setCurrentSourceIndex(index !== undefined ? index : STREAMING_SOURCES.findIndex(s => s.id === source.id));
    setShowSourcePicker(false);
    toast.success(`Switched to ${source.name}`);
  };

  const downloadVideo = async () => {
    if (!isCustomContent || !customVideoUrl) {
      toast.error("Downloads are only available for custom uploaded content");
      return;
    }

    try {
      toast.info("Starting download...");
      const response = await fetch(customVideoUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title || 'video'}.mp4`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Download started!");
    } catch (error) {
      console.error("Download failed:", error);
      toast.error("Failed to download video");
    }
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
          <>
            <iframe
              ref={iframeRef}
              src={streamingUrl}
              className="w-full h-full"
              allowFullScreen
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              onLoad={() => {
                console.log("✅ Iframe loaded successfully");
                setIframeLoaded(true);
                setIframeError(false);
                if (loadTimeoutRef.current) {
                  clearTimeout(loadTimeoutRef.current);
                }
              }}
              onError={() => {
                console.error("❌ Iframe failed to load");
                setIframeError(true);
                setIframeLoaded(false);
              }}
            />

            {/* Loading indicator */}
            {!iframeLoaded && !iframeError && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
                <div className="text-center">
                  <div className="w-12 h-12 border-4 border-[#7C3AED] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-white text-sm">Loading {selectedSource.name}...</p>
                  <p className="text-white/60 text-xs mt-2">If this takes too long, try another source</p>
                </div>
              </div>
            )}

            {/* Error overlay with troubleshooting button */}
            {iframeError && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-10">
                <div className="text-center px-6 max-w-md">
                  <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                    <AlertCircle className="w-8 h-8 text-red-500" />
                  </div>
                  <h3 className="text-xl font-bold mb-2">Source Failed to Load</h3>
                  <p className="text-[#A1A1AA] mb-6">
                    {selectedSource.name} is not working. This might be due to geo-restrictions, ad blockers, or browser settings.
                  </p>

                  {/* Primary Actions */}
                  <div className="flex flex-col gap-3 mb-4">
                    <button
                      onClick={tryNextSource}
                      className="btn-primary flex items-center justify-center gap-2"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Try Next Source
                    </button>
                    <button
                      onClick={() => setShowTroubleshooting(true)}
                      className="btn-secondary"
                    >
                      Troubleshooting Guide
                    </button>
                  </div>

                  {/* Alternative Viewing Options */}
                  <div className="pt-4 border-t border-white/10">
                    <p className="text-xs text-[#A1A1AA] mb-3">Alternative Options:</p>
                    <div className="flex flex-col gap-2">
                      {/* Watch Trailer */}
                      {trailerKey && (
                        <button
                          onClick={() => {
                            changeSource(STREAMING_SOURCES.find(s => s.id === 'trailer'));
                            setIframeError(false);
                          }}
                          className="text-sm px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-all flex items-center justify-center gap-2"
                        >
                          <Film className="w-4 h-4" />
                          Watch Trailer Instead
                        </button>
                      )}

                      {/* View on TMDB */}
                      <a
                        href={`https://www.themoviedb.org/${type}/${id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-all flex items-center justify-center gap-2"
                      >
                        <Info className="w-4 h-4" />
                        View on TMDB
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Troubleshooting Modal */}
            {showTroubleshooting && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/95 z-20 p-4 overflow-y-auto">
                <div className="max-w-3xl w-full bg-[#0A0A0A] border border-white/10 rounded-xl p-6 my-8">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#7C3AED]/20 flex items-center justify-center">
                        <Info className="w-5 h-5 text-[#7C3AED]" />
                      </div>
                      <h2 className="text-2xl font-bold">Troubleshooting Guide</h2>
                    </div>
                    <button
                      onClick={() => setShowTroubleshooting(false)}
                      className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Diagnostic Info */}
                  <div className="mb-6 p-4 bg-white/5 rounded-lg border border-white/10">
                    <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                      <Chrome className="w-4 h-4" />
                      Current Status
                    </h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-[#A1A1AA]">Source:</span>
                        <span className="ml-2 font-medium">{selectedSource.name}</span>
                      </div>
                      <div>
                        <span className="text-[#A1A1AA]">Browser:</span>
                        <span className="ml-2 font-medium">{navigator.userAgent.includes('Chrome') ? 'Chrome' : navigator.userAgent.includes('Firefox') ? 'Firefox' : navigator.userAgent.includes('Safari') ? 'Safari' : 'Unknown'}</span>
                      </div>
                      <div>
                        <span className="text-[#A1A1AA]">Content:</span>
                        <span className="ml-2 font-medium">{type === 'tv' ? `TV Show (S${season}E${episode})` : 'Movie'}</span>
                      </div>
                      <div>
                        <span className="text-[#A1A1AA]">Status:</span>
                        <span className="ml-2 font-medium text-red-400">Failed to Load</span>
                      </div>
                    </div>
                  </div>

                  {/* Common Issues */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold mb-4">Common Issues & Solutions</h3>

                    {/* Issue 1: Geo-blocking */}
                    <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Globe className="w-4 h-4 text-red-400" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold mb-2">Geographic Restrictions</h4>
                          <p className="text-sm text-[#A1A1AA] mb-3">
                            Many streaming sources block access from certain countries (especially the US due to copyright laws).
                          </p>
                          <div className="space-y-2 text-sm">
                            <p className="font-medium text-[#7C3AED]">Solutions:</p>
                            <ul className="list-disc list-inside space-y-1 text-[#A1A1AA] ml-4">
                              <li>Try all available sources - some work in different regions</li>
                              <li>Use a VPN to connect from a different country (Europe or Asia often works better)</li>
                              <li>Try using your mobile data instead of WiFi (different IP)</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Issue 2: Ad Blockers */}
                    <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Shield className="w-4 h-4 text-yellow-400" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold mb-2">Ad Blockers & Browser Extensions</h4>
                          <p className="text-sm text-[#A1A1AA] mb-3">
                            Ad blockers and privacy extensions can prevent streaming sources from loading.
                          </p>
                          <div className="space-y-2 text-sm">
                            <p className="font-medium text-[#7C3AED]">Solutions:</p>
                            <ul className="list-disc list-inside space-y-1 text-[#A1A1AA] ml-4">
                              <li>Temporarily disable uBlock Origin, AdBlock Plus, or similar extensions</li>
                              <li>Whitelist this site in your ad blocker settings</li>
                              <li>Try in an Incognito/Private browsing window (extensions are usually disabled)</li>
                              <li>Disable "Enhanced Tracking Prevention" in Firefox or "Shields" in Brave</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Issue 3: Browser Settings */}
                    <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Chrome className="w-4 h-4 text-blue-400" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold mb-2">Browser Compatibility</h4>
                          <p className="text-sm text-[#A1A1AA] mb-3">
                            Some browsers have stricter security settings that block embedded content.
                          </p>
                          <div className="space-y-2 text-sm">
                            <p className="font-medium text-[#7C3AED]">Solutions:</p>
                            <ul className="list-disc list-inside space-y-1 text-[#A1A1AA] ml-4">
                              <li>Try a different browser (Chrome and Firefox usually work best)</li>
                              <li>Ensure your browser is up to date</li>
                              <li>Clear your browser cache and cookies</li>
                              <li>Disable "Block third-party cookies" in browser settings</li>
                              <li>Check if JavaScript is enabled</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Issue 4: Network/ISP Blocking */}
                    <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Server className="w-4 h-4 text-purple-400" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold mb-2">Network & ISP Issues</h4>
                          <p className="text-sm text-[#A1A1AA] mb-3">
                            Some ISPs or networks (school, work, public WiFi) block streaming sites.
                          </p>
                          <div className="space-y-2 text-sm">
                            <p className="font-medium text-[#7C3AED]">Solutions:</p>
                            <ul className="list-disc list-inside space-y-1 text-[#A1A1AA] ml-4">
                              <li>Try switching from WiFi to mobile data (or vice versa)</li>
                              <li>Use a VPN to bypass network restrictions</li>
                              <li>Try a different network if possible</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="mt-6 p-4 bg-[#7C3AED]/10 border border-[#7C3AED]/30 rounded-lg">
                    <h3 className="text-sm font-semibold mb-3">Quick Actions</h3>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => {
                          setShowTroubleshooting(false);
                          tryNextSource();
                        }}
                        className="btn-primary text-sm px-4 py-2"
                      >
                        <RefreshCw className="w-3 h-3 mr-2" />
                        Try Next Source
                      </button>
                      <button
                        onClick={() => {
                          setShowSourcePicker(true);
                          setShowTroubleshooting(false);
                        }}
                        className="btn-secondary text-sm px-4 py-2"
                      >
                        <Server className="w-3 h-3 mr-2" />
                        Choose Different Source
                      </button>
                      <button
                        onClick={() => {
                          window.location.reload();
                        }}
                        className="btn-secondary text-sm px-4 py-2"
                      >
                        <RefreshCw className="w-3 h-3 mr-2" />
                        Reload Page
                      </button>
                    </div>
                  </div>

                  {/* Recommendation */}
                  <div className="mt-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                    <p className="text-sm text-green-400">
                      <strong>💡 Recommendation:</strong> If you're in the US and nothing works, try using a VPN connected to a European server (UK, Germany, Netherlands). VidSrc sources typically work well from Europe.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
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
                {/* Episode Picker Toggle for TV Shows */}
                {type === "tv" && details?.seasons && !isFullscreen && (
                  <button
                    onClick={() => setShowEpisodePicker(!showEpisodePicker)}
                    data-testid="toggle-episodes-btn"
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-md hover:bg-white/20 transition-all"
                  >
                    <Tv className="w-4 h-4" />
                    <span className="text-sm">Episodes</span>
                  </button>
                )}
              </div>

              {/* Source Selector & Download */}
              {!isFullscreen && (
                <div className="flex items-center gap-2">
                  {/* Download button for custom content only */}
                  {isCustomContent && customVideoUrl && (
                    <button
                      onClick={downloadVideo}
                      data-testid="download-btn"
                      className="flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-all"
                      title="Download video"
                    >
                      <Download className="w-4 h-4" />
                      <span className="text-sm hidden md:inline">Download</span>
                    </button>
                  )}
                  {!isCustomContent && (
                    <>
                      <button
                        onClick={tryNextSource}
                        data-testid="try-next-source-btn"
                        className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#7C3AED]/20 text-[#7C3AED] hover:bg-[#7C3AED]/30 transition-all"
                      >
                        <RefreshCw className="w-4 h-4" />
                        <span className="text-sm">Try Next</span>
                      </button>
                      <button
                        onClick={() => setShowSourcePicker(!showSourcePicker)}
                        data-testid="source-picker-btn"
                        className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-md hover:bg-white/20 transition-all"
                      >
                        <Server className="w-4 h-4" />
                        <span className="text-sm">{selectedSource.name}</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Source Picker Dropdown */}
          {showSourcePicker && !isFullscreen && (
            <div className="absolute top-20 right-6 bg-[#0A0A0A] border border-white/10 rounded-xl p-2 z-50 pointer-events-auto min-w-[200px]">
              <p className="text-xs text-[#A1A1AA] px-3 py-2">Select Streaming Source</p>
              <p className="text-xs text-[#52525B] px-3 pb-2">If one doesn't work, try another</p>
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

          {/* TV Show Episode Selector */}
          {type === "tv" && details?.seasons && showEpisodePicker && !isFullscreen && (
            <div className="absolute top-20 left-6 bg-[#0A0A0A]/90 backdrop-blur-md border border-white/10 rounded-xl p-4 z-40 pointer-events-auto max-h-[300px] overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold">Episodes</p>
                <button
                  onClick={() => setShowEpisodePicker(false)}
                  className="text-[#A1A1AA] hover:text-white transition-colors"
                  aria-label="Close episode picker"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>
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
                    onClick={() => {
                      setEpisode(i + 1);
                      // Close the picker after selecting an episode
                      setTimeout(() => setShowEpisodePicker(false), 300);
                    }}
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
