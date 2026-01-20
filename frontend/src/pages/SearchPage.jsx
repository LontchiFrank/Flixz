import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Search, X } from "lucide-react";
import MovieCard from "../components/MovieCard";
import { useAuth } from "../context/AuthContext";
import { API } from "../App";

const SearchPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, getAuthHeaders } = useAuth();
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);

  useEffect(() => {
    const q = searchParams.get("q");
    if (q) {
      setQuery(q);
      search(q);
    }
  }, [searchParams]);

  const search = async (searchQuery, pageNum = 1) => {
    if (!searchQuery.trim()) return;

    setLoading(true);
    try {
      const res = await axios.get(
        `${API}/search/multi?query=${encodeURIComponent(searchQuery)}&page=${pageNum}`
      );
      const filtered = res.data.results?.filter(
        (r) => r.media_type === "movie" || r.media_type === "tv"
      ) || [];
      setResults(filtered);
      setTotalPages(res.data.total_pages || 0);
      setPage(pageNum);
    } catch (error) {
      console.error("Search failed:", error);
      toast.error("Search failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (query.trim()) {
      setSearchParams({ q: query });
      search(query);
    }
  };

  const clearSearch = () => {
    setQuery("");
    setResults([]);
    setSearchParams({});
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
          media_type: movie.media_type,
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

  return (
    <div className="min-h-screen bg-[#050505] pb-20 md:pb-8" data-testid="search-page">
      <div className="max-w-7xl mx-auto px-6 md:px-12 pt-8">
        {/* Search Header */}
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-6">Search</h1>

          <form onSubmit={handleSearch} className="relative max-w-2xl">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for movies, TV shows..."
              data-testid="search-input"
              className="search-input pr-24"
            />
            {query && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-16 top-1/2 -translate-y-1/2 text-[#A1A1AA] hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}
            <button
              type="submit"
              data-testid="search-submit-btn"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[#7C3AED] hover:text-[#8B5CF6] transition-colors px-3"
            >
              <Search className="w-5 h-5" />
            </button>
          </form>
        </div>

        {/* Results */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-12 h-12 border-4 border-[#7C3AED] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : results.length > 0 ? (
          <>
            <p className="text-[#A1A1AA] mb-6">
              Found {results.length} results for "{searchParams.get("q")}"
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
              {results.map((item) => (
                <MovieCard
                  key={item.id}
                  movie={item}
                  mediaType={item.media_type}
                  onAddToList={addToList}
                />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 mt-12">
                <button
                  onClick={() => search(query, page - 1)}
                  disabled={page === 1}
                  data-testid="prev-page"
                  className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="text-[#A1A1AA]">
                  Page {page} of {Math.min(totalPages, 500)}
                </span>
                <button
                  onClick={() => search(query, page + 1)}
                  disabled={page >= Math.min(totalPages, 500)}
                  data-testid="next-page"
                  className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            )}
          </>
        ) : searchParams.get("q") ? (
          <div className="text-center py-20">
            <Search className="w-16 h-16 text-[#52525B] mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">No results found</h3>
            <p className="text-[#A1A1AA]">
              Try searching for something else
            </p>
          </div>
        ) : (
          <div className="text-center py-20">
            <Search className="w-16 h-16 text-[#52525B] mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Search for content</h3>
            <p className="text-[#A1A1AA]">
              Find your favorite movies and TV shows
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchPage;
