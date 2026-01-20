import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Plus, Star, ChevronLeft, ChevronRight, Search, Info, Clock } from "lucide-react";
import { toast } from "sonner";
import MovieCard from "../components/MovieCard";
import MovieRow from "../components/MovieRow";
import ContinueWatchingRow from "../components/ContinueWatchingRow";
import { useAuth } from "../context/AuthContext";
import { API } from "../App";

const IMAGE_BASE = "https://image.tmdb.org/t/p/";

const HomePage = () => {
  const navigate = useNavigate();
  const { user, getAuthHeaders } = useAuth();
  const [trending, setTrending] = useState([]);
  const [popular, setPopular] = useState([]);
  const [nowPlaying, setNowPlaying] = useState([]);
  const [topRated, setTopRated] = useState([]);
  const [trendingTv, setTrendingTv] = useState([]);
  const [continueWatching, setContinueWatching] = useState([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const carouselInterval = useRef(null);

  useEffect(() => {
    fetchData();
    if (user) {
      fetchContinueWatching();
    }
  }, [user]);

  useEffect(() => {
    if (trending.length > 0) {
      carouselInterval.current = setInterval(() => {
        setCurrentSlide((prev) => (prev + 1) % Math.min(trending.length, 5));
      }, 6000);
    }
    return () => clearInterval(carouselInterval.current);
  }, [trending]);

  const fetchContinueWatching = async () => {
    try {
      const res = await axios.get(`${API}/continue-watching`, {
        headers: getAuthHeaders(),
      });
      setContinueWatching(res.data.items || []);
    } catch (error) {
      console.error("Failed to fetch continue watching:", error);
    }
  };

  const fetchData = async () => {
    try {
      const [trendingRes, popularRes, nowPlayingRes, topRatedRes, trendingTvRes] =
        await Promise.all([
          axios.get(`${API}/movies/trending`),
          axios.get(`${API}/movies/popular`),
          axios.get(`${API}/movies/now-playing`),
          axios.get(`${API}/movies/top-rated`),
          axios.get(`${API}/tv/trending`),
        ]);

      setTrending(trendingRes.data.results?.slice(0, 5) || []);
      setPopular(popularRes.data.results || []);
      setNowPlaying(nowPlayingRes.data.results || []);
      setTopRated(topRatedRes.data.results || []);
      setTrendingTv(trendingTvRes.data.results || []);
    } catch (error) {
      console.error("Failed to fetch data:", error);
      toast.error("Failed to load content");
    } finally {
      setLoading(false);
    }
  };

  const addToList = async (movie) => {
    if (!user) {
      toast.error("Please login to add to your list");
      navigate("/login");
      return;
    }

    try {
      await axios.post(
        `${API}/my-list`,
        {
          media_id: movie.id,
          media_type: movie.media_type || "movie",
          title: movie.title || movie.name,
          poster_path: movie.poster_path,
          backdrop_path: movie.backdrop_path,
          vote_average: movie.vote_average,
        },
        { headers: getAuthHeaders() }
      );
      toast.success("Added to My List");
    } catch (error) {
      if (error.response?.status === 400) {
        toast.info("Already in your list");
      } else {
        toast.error("Failed to add to list");
      }
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % Math.min(trending.length, 5));
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + Math.min(trending.length, 5)) % Math.min(trending.length, 5));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#7C3AED] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const featuredMovie = trending[currentSlide];

  return (
    <div className="min-h-screen bg-[#050505] pb-20 md:pb-0" data-testid="home-page">
      {/* Hero Section with 3D Carousel */}
      <section className="relative h-[80vh] overflow-hidden">
        {/* Background */}
        <AnimatePresence mode="wait">
          {featuredMovie && (
            <motion.div
              key={featuredMovie.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              className="absolute inset-0"
            >
              <img
                src={`${IMAGE_BASE}original${featuredMovie.backdrop_path}`}
                alt={featuredMovie.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/50 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#050505] via-transparent to-transparent" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Purple Haze Effect */}
        <div className="absolute inset-0 purple-haze pointer-events-none" />

        {/* Content */}
        <div className="absolute inset-0 flex items-center">
          <div className="max-w-7xl mx-auto px-6 md:px-12 w-full">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              {/* Left: Info */}
              <AnimatePresence mode="wait">
                {featuredMovie && (
                  <motion.div
                    key={featuredMovie.id}
                    initial={{ opacity: 0, x: -50 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 50 }}
                    transition={{ duration: 0.5 }}
                    className="space-y-6"
                  >
                    <div className="flex items-center gap-3">
                      <span className="age-rating">13+</span>
                      <span className="text-[#A1A1AA] text-sm">
                        {featuredMovie.release_date?.split("-")[0] || "2024"}
                      </span>
                      <span className="text-[#A1A1AA] text-sm">
                        {featuredMovie.media_type === "tv" ? "TV Series" : "Movie"}
                      </span>
                    </div>

                    <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
                      {featuredMovie.title || featuredMovie.name}
                    </h1>

                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1">
                        <Star className="w-5 h-5 text-[#F59E0B] fill-current" />
                        <span className="font-semibold">
                          {featuredMovie.vote_average?.toFixed(1)}
                        </span>
                      </div>
                      <span className="text-[#A1A1AA]">
                        {featuredMovie.genre_ids?.slice(0, 3).join(" • ") ||
                          "Action • Adventure • Drama"}
                      </span>
                    </div>

                    <p className="text-[#A1A1AA] text-lg max-w-xl line-clamp-3">
                      {featuredMovie.overview}
                    </p>

                    <div className="flex items-center gap-4 pt-4">
                      <button
                        onClick={() =>
                          navigate(
                            `/watch/${featuredMovie.media_type || "movie"}/${featuredMovie.id}`
                          )
                        }
                        data-testid="hero-watch-btn"
                        className="btn-primary flex items-center gap-2"
                      >
                        <Play className="w-5 h-5 fill-current" />
                        Watch Now
                      </button>
                      <button
                        onClick={() => addToList(featuredMovie)}
                        data-testid="hero-add-list-btn"
                        className="btn-secondary flex items-center gap-2"
                      >
                        <Plus className="w-5 h-5" />
                        Add List
                      </button>
                      <button
                        onClick={() =>
                          navigate(
                            `/${featuredMovie.media_type || "movie"}/${featuredMovie.id}`
                          )
                        }
                        data-testid="hero-info-btn"
                        className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center hover:bg-white/20 transition-all"
                      >
                        <Info className="w-5 h-5" />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Right: 3D Carousel */}
              <div className="hidden lg:block relative h-[500px] perspective-1000">
                <div className="absolute inset-0 flex items-center justify-center">
                  {trending.slice(0, 5).map((movie, index) => {
                    const offset = index - currentSlide;
                    const isActive = index === currentSlide;

                    return (
                      <motion.div
                        key={movie.id}
                        className="absolute cursor-pointer"
                        animate={{
                          x: offset * 180,
                          z: isActive ? 100 : -Math.abs(offset) * 100,
                          rotateY: offset * -15,
                          scale: isActive ? 1 : 0.8,
                          opacity: Math.abs(offset) > 2 ? 0 : 1 - Math.abs(offset) * 0.2,
                        }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                        onClick={() => setCurrentSlide(index)}
                        style={{ transformStyle: "preserve-3d" }}
                      >
                        <div
                          className={`w-[200px] h-[300px] rounded-xl overflow-hidden border-2 transition-all duration-300 ${
                            isActive
                              ? "border-[#7C3AED] neon-glow"
                              : "border-white/10"
                          }`}
                        >
                          <img
                            src={`${IMAGE_BASE}w500${movie.poster_path}`}
                            alt={movie.title || movie.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                {/* Carousel Controls */}
                <button
                  onClick={prevSlide}
                  data-testid="carousel-prev"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center hover:bg-black/70 transition-all z-10"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={nextSlide}
                  data-testid="carousel-next"
                  className="absolute right-0 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center hover:bg-black/70 transition-all z-10"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Carousel Dots */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2">
          {trending.slice(0, 5).map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentSlide(index)}
              className={`w-2 h-2 rounded-full transition-all ${
                index === currentSlide
                  ? "w-8 bg-[#7C3AED]"
                  : "bg-white/30 hover:bg-white/50"
              }`}
            />
          ))}
        </div>
      </section>

      {/* Search Bar */}
      <section className="max-w-7xl mx-auto px-6 md:px-12 -mt-8 relative z-10">
        <div className="flex items-center justify-between gap-6 flex-wrap">
          <form onSubmit={handleSearch} className="flex-1 max-w-xl">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name or genres..."
                data-testid="search-input"
                className="search-input pr-12"
              />
              <button
                type="submit"
                data-testid="search-btn"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[#7C3AED] hover:text-[#8B5CF6] transition-colors px-3"
              >
                <Search className="w-5 h-5" />
              </button>
            </div>
          </form>

          <p className="text-[#52525B] text-sm hidden md:block">
            Hindi, English, Thriller, Crime, Horror, Romance, Comedies
          </p>
        </div>
      </section>

      {/* Movie Rows */}
      <div className="max-w-7xl mx-auto px-6 md:px-12 mt-16 space-y-12">
        {/* Continue Watching - only show if user is logged in and has items */}
        {user && continueWatching.length > 0 && (
          <ContinueWatchingRow items={continueWatching} />
        )}
        
        <MovieRow
          title="Trending Now"
          movies={trending}
          onAddToList={addToList}
        />
        <MovieRow
          title="Popular Movies"
          movies={popular}
          onAddToList={addToList}
        />
        <MovieRow
          title="Now Playing"
          movies={nowPlaying}
          onAddToList={addToList}
        />
        <MovieRow
          title="Top Rated"
          movies={topRated}
          onAddToList={addToList}
        />
        <MovieRow
          title="Trending TV Shows"
          movies={trendingTv}
          mediaType="tv"
          onAddToList={addToList}
        />
      </div>
    </div>
  );
};

export default HomePage;
