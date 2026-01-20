import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Play,
  Plus,
  Check,
  Star,
  Clock,
  Calendar,
  Users,
  Share2,
  ChevronRight,
} from "lucide-react";
import MovieCard from "../components/MovieCard";
import { useAuth } from "../context/AuthContext";
import { API } from "../App";

const IMAGE_BASE = "https://image.tmdb.org/t/p/";

const DetailPage = ({ type }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, getAuthHeaders } = useAuth();
  const [details, setDetails] = useState(null);
  const [inMyList, setInMyList] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    fetchDetails();
    if (user) {
      checkInList();
    }
  }, [id, type, user]);

  const fetchDetails = async () => {
    setLoading(true);
    try {
      // Use plural endpoint (movies/tv)
      const endpoint = type === "movie" ? "movies" : "tv";
      const res = await axios.get(`${API}/${endpoint}/${id}`);
      setDetails(res.data);
    } catch (error) {
      console.error("Failed to fetch details:", error);
      toast.error("Failed to load details");
    } finally {
      setLoading(false);
    }
  };

  const checkInList = async () => {
    try {
      const res = await axios.get(`${API}/my-list/check/${type}/${id}`, {
        headers: getAuthHeaders(),
      });
      setInMyList(res.data.in_list);
    } catch (error) {
      console.error("Failed to check list:", error);
    }
  };

  const toggleMyList = async () => {
    if (!user) {
      toast.error("Please login to manage your list");
      navigate("/login");
      return;
    }

    try {
      if (inMyList) {
        await axios.delete(`${API}/my-list/${type}/${id}`, {
          headers: getAuthHeaders(),
        });
        setInMyList(false);
        toast.success("Removed from My List");
      } else {
        await axios.post(
          `${API}/my-list`,
          {
            media_id: parseInt(id),
            media_type: type,
            title: details.title || details.name,
            poster_path: details.poster_path,
            backdrop_path: details.backdrop_path,
            vote_average: details.vote_average,
          },
          { headers: getAuthHeaders() }
        );
        setInMyList(true);
        toast.success("Added to My List");
      }
    } catch (error) {
      toast.error("Failed to update list");
    }
  };

  const createWatchParty = async () => {
    if (!user) {
      toast.error("Please login to create a watch party");
      navigate("/login");
      return;
    }

    try {
      const res = await axios.post(
        `${API}/watch-party`,
        {
          name: `${details.title || details.name} Watch Party`,
          movie_id: parseInt(id),
          media_type: type,
        },
        { headers: getAuthHeaders() }
      );
      toast.success("Watch party created!");
      navigate(`/watch-party/${res.data.room_id}`);
    } catch (error) {
      toast.error("Failed to create watch party");
    }
  };

  const getTrailer = () => {
    const videos = details?.videos?.results || [];
    const trailer = videos.find(
      (v) => v.type === "Trailer" && v.site === "YouTube"
    );
    return trailer ? `https://www.youtube.com/embed/${trailer.key}` : null;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#7C3AED] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!details) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <p className="text-[#A1A1AA]">Content not found</p>
      </div>
    );
  }

  const title = details.title || details.name;
  const year = (details.release_date || details.first_air_date)?.split("-")[0];
  const runtime = details.runtime || details.episode_run_time?.[0];
  const genres = details.genres?.map((g) => g.name).join(", ");
  const cast = details.credits?.cast?.slice(0, 6) || [];
  const similar = details.similar?.results?.slice(0, 10) || [];
  const recommendations = details.recommendations?.results?.slice(0, 10) || [];
  const trailerUrl = getTrailer();

  return (
    <div className="min-h-screen bg-[#050505] pb-20 md:pb-8" data-testid="detail-page">
      {/* Hero */}
      <div className="relative h-[70vh] overflow-hidden">
        <img
          src={`${IMAGE_BASE}original${details.backdrop_path}`}
          alt={title}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#050505] via-transparent to-transparent" />

        {/* Content */}
        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-12">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row gap-8">
            {/* Poster */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="hidden md:block w-[200px] h-[300px] rounded-xl overflow-hidden border-2 border-white/10 flex-shrink-0 -mb-32 relative z-10"
            >
              <img
                src={`${IMAGE_BASE}w500${details.poster_path}`}
                alt={title}
                className="w-full h-full object-cover"
              />
            </motion.div>

            {/* Info */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex-1 space-y-4"
            >
              <div className="flex items-center gap-3 flex-wrap">
                <span className="age-rating">
                  {details.adult ? "18+" : "13+"}
                </span>
                <span className="text-[#A1A1AA]">{year}</span>
                {runtime && (
                  <span className="flex items-center gap-1 text-[#A1A1AA]">
                    <Clock className="w-4 h-4" />
                    {runtime} min
                  </span>
                )}
                <span className="flex items-center gap-1 text-[#F59E0B]">
                  <Star className="w-4 h-4 fill-current" />
                  {details.vote_average?.toFixed(1)}
                </span>
              </div>

              <h1 className="text-3xl md:text-5xl font-bold">{title}</h1>

              <p className="text-[#A1A1AA]">{genres}</p>

              <p className="text-[#A1A1AA] max-w-2xl line-clamp-3 md:line-clamp-none">
                {details.overview}
              </p>

              <div className="flex items-center gap-4 pt-4 flex-wrap">
                <button
                  onClick={() => navigate(`/watch/${type}/${id}`)}
                  data-testid="watch-btn"
                  className="btn-primary flex items-center gap-2"
                >
                  <Play className="w-5 h-5 fill-current" />
                  Watch Now
                </button>
                <button
                  onClick={toggleMyList}
                  data-testid="toggle-list-btn"
                  className="btn-secondary flex items-center gap-2"
                >
                  {inMyList ? (
                    <>
                      <Check className="w-5 h-5" />
                      In My List
                    </>
                  ) : (
                    <>
                      <Plus className="w-5 h-5" />
                      Add to List
                    </>
                  )}
                </button>
                <button
                  onClick={createWatchParty}
                  data-testid="create-party-btn"
                  className="btn-secondary flex items-center gap-2"
                >
                  <Users className="w-5 h-5" />
                  Watch Party
                </button>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Tabs & Content */}
      <div className="max-w-7xl mx-auto px-6 md:px-12 mt-8 md:mt-16">
        {/* Tabs */}
        <div className="flex gap-6 border-b border-white/10 mb-8">
          {["overview", "cast", "trailer"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              data-testid={`tab-${tab}`}
              className={`pb-4 px-2 capitalize transition-all ${
                activeTab === tab
                  ? "text-white border-b-2 border-[#7C3AED]"
                  : "text-[#A1A1AA] hover:text-white"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === "overview" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-8"
          >
            {/* Details Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="glass rounded-xl p-4">
                <p className="text-[#A1A1AA] text-sm mb-1">Status</p>
                <p className="font-semibold">{details.status}</p>
              </div>
              <div className="glass rounded-xl p-4">
                <p className="text-[#A1A1AA] text-sm mb-1">Release Date</p>
                <p className="font-semibold">
                  {details.release_date || details.first_air_date}
                </p>
              </div>
              <div className="glass rounded-xl p-4">
                <p className="text-[#A1A1AA] text-sm mb-1">Rating</p>
                <p className="font-semibold flex items-center gap-1">
                  <Star className="w-4 h-4 text-[#F59E0B] fill-current" />
                  {details.vote_average?.toFixed(1)} ({details.vote_count} votes)
                </p>
              </div>
              <div className="glass rounded-xl p-4">
                <p className="text-[#A1A1AA] text-sm mb-1">
                  {type === "tv" ? "Seasons" : "Budget"}
                </p>
                <p className="font-semibold">
                  {type === "tv"
                    ? details.number_of_seasons
                    : details.budget
                    ? `$${(details.budget / 1000000).toFixed(1)}M`
                    : "N/A"}
                </p>
              </div>
            </div>

            {/* Similar */}
            {similar.length > 0 && (
              <div>
                <h3 className="text-xl font-bold mb-4">Similar</h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  {similar.map((item) => (
                    <MovieCard key={item.id} movie={item} mediaType={type} />
                  ))}
                </div>
              </div>
            )}

            {/* Recommendations */}
            {recommendations.length > 0 && (
              <div>
                <h3 className="text-xl font-bold mb-4">You May Also Like</h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  {recommendations.map((item) => (
                    <MovieCard key={item.id} movie={item} mediaType={type} />
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === "cast" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6"
          >
            {cast.map((person) => (
              <div key={person.id} className="text-center">
                <div className="w-full aspect-square rounded-xl overflow-hidden mb-3 bg-[#121212]">
                  {person.profile_path ? (
                    <img
                      src={`${IMAGE_BASE}w185${person.profile_path}`}
                      alt={person.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#52525B]">
                      No Image
                    </div>
                  )}
                </div>
                <h4 className="font-semibold text-sm">{person.name}</h4>
                <p className="text-[#A1A1AA] text-xs">{person.character}</p>
              </div>
            ))}
          </motion.div>
        )}

        {activeTab === "trailer" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {trailerUrl ? (
              <div className="aspect-video rounded-xl overflow-hidden">
                <iframe
                  src={trailerUrl}
                  title="Trailer"
                  className="w-full h-full"
                  allowFullScreen
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                />
              </div>
            ) : (
              <div className="aspect-video rounded-xl bg-[#121212] flex items-center justify-center">
                <p className="text-[#A1A1AA]">No trailer available</p>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default DetailPage;
