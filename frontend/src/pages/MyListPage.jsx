import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Heart, Trash2 } from "lucide-react";
import MovieCard from "../components/MovieCard";
import { useAuth } from "../context/AuthContext";
import { API } from "../App";

const MyListPage = () => {
  const navigate = useNavigate();
  const { user, getAuthHeaders } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchMyList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/my-list`, {
        headers: getAuthHeaders(),
        withCredentials: true
      });
      setItems(res.data.items || []);
    } catch (error) {
      console.error("Failed to fetch list:", error);
      toast.error("Failed to load your list");
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    fetchMyList();
  }, [fetchMyList]);

  const removeFromList = async (mediaType, mediaId) => {
    try {
      await axios.delete(`${API}/my-list/${mediaType}/${mediaId}`, {
        headers: getAuthHeaders(),
        withCredentials: true
      });
      setItems((prev) =>
        prev.filter(
          (item) => !(item.media_id === mediaId && item.media_type === mediaType)
        )
      );
      toast.success("Removed from My List");
    } catch (error) {
      toast.error("Failed to remove from list");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#7C3AED] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] pb-20 md:pb-8" data-testid="my-list-page">
      <div className="max-w-7xl mx-auto px-6 md:px-12 pt-8">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 rounded-xl bg-[#7C3AED]/20 flex items-center justify-center">
            <Heart className="w-6 h-6 text-[#7C3AED]" />
          </div>
          <div>
            <h1 className="text-3xl md:text-4xl font-bold">My List</h1>
            <p className="text-[#A1A1AA]">
              {items.length} {items.length === 1 ? "item" : "items"} saved
            </p>
          </div>
        </div>

        {items.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {items.map((item) => (
              <div key={`${item.media_type}-${item.media_id}`} className="relative group">
                <MovieCard
                  movie={{
                    id: item.media_id,
                    title: item.title,
                    name: item.title,
                    poster_path: item.poster_path,
                    backdrop_path: item.backdrop_path,
                    vote_average: item.vote_average,
                    media_type: item.media_type,
                  }}
                  mediaType={item.media_type}
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFromList(item.media_type, item.media_id);
                  }}
                  data-testid={`remove-btn-${item.media_id}`}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-red-500/80 backdrop-blur-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-20">
            <Heart className="w-16 h-16 text-[#52525B] mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Your list is empty</h3>
            <p className="text-[#A1A1AA] mb-6">
              Start adding movies and shows to your list
            </p>
            <button
              onClick={() => navigate("/browse")}
              data-testid="browse-btn"
              className="btn-primary"
            >
              Browse Content
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MyListPage;
