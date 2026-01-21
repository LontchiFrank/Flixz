import React, { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Film, Tv, Baby, FileText, Dumbbell, Radio } from "lucide-react";
import MovieCard from "../components/MovieCard";
import { useAuth } from "../context/AuthContext";
import { API } from "../App";

const categories = [
  { id: "movies", label: "Movies", icon: Film, endpoint: "/movies/popular" },
  { id: "tv", label: "TV Shows", icon: Tv, endpoint: "/tv/popular" },
  { id: "series", label: "Series", icon: Tv, endpoint: "/tv/top-rated" },
  { id: "documentaries", label: "Documentaries", icon: FileText, endpoint: "/category/documentaries" },
  { id: "kids", label: "Kids", icon: Baby, endpoint: "/category/kids" },
  { id: "sports", label: "Sports", icon: Dumbbell, endpoint: "/category/sports" },
  { id: "live", label: "Live TV", icon: Radio, endpoint: "/tv/airing-today" },
];

const BrowsePage = () => {
  const { category } = useParams();
  const navigate = useNavigate();
  const { user, getAuthHeaders } = useAuth();
  const [activeCategory, setActiveCategory] = useState(category || "movies");
  const [content, setContent] = useState([]);
  const [genres, setGenres] = useState([]);
  const [selectedGenre, setSelectedGenre] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (category) {
      setActiveCategory(category);
    }
  }, [category]);

  const fetchGenres = useCallback(async () => {
    try {
      const type = activeCategory === "tv" || activeCategory === "series" ? "tv" : "movie";
      const res = await axios.get(`${API}/genres/${type}`);
      setGenres(res.data.genres || []);
    } catch (error) {
      console.error("Failed to fetch genres:", error);
    }
  }, [activeCategory]);

  const fetchContent = useCallback(async () => {
    setLoading(true);
    try {
      const cat = categories.find((c) => c.id === activeCategory);
      let endpoint = cat?.endpoint || "/movies/popular";

      if (selectedGenre) {
        const type = activeCategory === "tv" || activeCategory === "series" ? "tv" : "movie";
        endpoint = `/discover/${type}?genre=${selectedGenre}&page=${page}`;
      } else {
        endpoint = `${endpoint}?page=${page}`;
      }

      const res = await axios.get(`${API}${endpoint}`);
      setContent(res.data.results || []);
    } catch (error) {
      console.error("Failed to fetch content:", error);
      toast.error("Failed to load content");
    } finally {
      setLoading(false);
    }
  }, [activeCategory, selectedGenre, page]);

  useEffect(() => {
    fetchContent();
    fetchGenres();
  }, [fetchContent, fetchGenres]);

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
          media_type: movie.media_type || (activeCategory === "tv" || activeCategory === "series" ? "tv" : "movie"),
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

  const handleCategoryChange = (catId) => {
    setActiveCategory(catId);
    setSelectedGenre(null);
    setPage(1);
    navigate(`/browse/${catId}`);
  };

  return (
    <div className="min-h-screen bg-[#050505] pb-20 md:pb-8" data-testid="browse-page">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-gradient-to-b from-[#050505] via-[#050505]/95 to-transparent pb-8 pt-6">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <h1 className="text-3xl md:text-4xl font-bold mb-6">Browse</h1>

          {/* Category Pills */}
          <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-4">
            {categories.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => handleCategoryChange(id)}
                data-testid={`category-${id}`}
                className={`category-pill flex items-center gap-2 ${
                  activeCategory === id ? "active" : ""
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>

          {/* Genre Filter */}
          {genres.length > 0 && (
            <div className="flex gap-2 overflow-x-auto hide-scrollbar mt-4">
              <button
                onClick={() => setSelectedGenre(null)}
                data-testid="genre-all"
                className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                  !selectedGenre
                    ? "bg-[#7C3AED] text-white"
                    : "bg-white/5 text-[#A1A1AA] hover:text-white"
                }`}
              >
                All
              </button>
              {genres.slice(0, 10).map((genre) => (
                <button
                  key={genre.id}
                  onClick={() => setSelectedGenre(genre.id)}
                  data-testid={`genre-${genre.id}`}
                  className={`px-3 py-1.5 rounded-full text-sm transition-all whitespace-nowrap ${
                    selectedGenre === genre.id
                      ? "bg-[#7C3AED] text-white"
                      : "bg-white/5 text-[#A1A1AA] hover:text-white"
                  }`}
                >
                  {genre.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Content Grid */}
      <div className="max-w-7xl mx-auto px-6 md:px-12">
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {[...Array(20)].map((_, i) => (
              <div key={i} className="skeleton rounded-xl aspect-[2/3]" />
            ))}
          </div>
        ) : content.length > 0 ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
              {content.map((item) => (
                <MovieCard
                  key={item.id}
                  movie={item}
                  mediaType={item.media_type || (activeCategory === "tv" || activeCategory === "series" ? "tv" : "movie")}
                  onAddToList={addToList}
                />
              ))}
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-center gap-4 mt-12">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                data-testid="prev-page"
                className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-[#A1A1AA]">Page {page}</span>
              <button
                onClick={() => setPage((p) => p + 1)}
                data-testid="next-page"
                className="btn-secondary"
              >
                Next
              </button>
            </div>
          </>
        ) : (
          <div className="text-center py-20">
            <p className="text-[#A1A1AA] text-lg">No content found</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default BrowsePage;
