import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Play, Plus, Star, Info } from "lucide-react";

const IMAGE_BASE = "https://image.tmdb.org/t/p/";

const MovieCard = ({ movie, mediaType = "movie", onAddToList }) => {
  const navigate = useNavigate();
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const title = movie.title || movie.name;
  const year = (movie.release_date || movie.first_air_date)?.split("-")[0];
  const rating = movie.vote_average?.toFixed(1);

  const handleWatch = (e) => {
    e.stopPropagation();
    navigate(`/watch/${movie.media_type || mediaType}/${movie.id}`);
  };

  const handleInfo = (e) => {
    e.stopPropagation();
    navigate(`/${movie.media_type || mediaType}/${movie.id}`);
  };

  const handleAddToList = (e) => {
    e.stopPropagation();
    if (onAddToList) {
      onAddToList({ ...movie, media_type: movie.media_type || mediaType });
    }
  };

  return (
    <div
      className="movie-card flex-shrink-0 w-[160px] md:w-[180px] cursor-pointer"
      onClick={handleInfo}
      data-testid={`movie-card-${movie.id}`}
    >
      {/* Poster */}
      <div className="relative w-full h-full">
        {!imageLoaded && !imageError && (
          <div className="absolute inset-0 skeleton rounded-xl" />
        )}
        {movie.poster_path && !imageError ? (
          <img
            src={`${IMAGE_BASE}w342${movie.poster_path}`}
            alt={title}
            className={`w-full h-full object-cover transition-opacity duration-300 ${
              imageLoaded ? "opacity-100" : "opacity-0"
            }`}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-full bg-[#121212] flex items-center justify-center">
            <span className="text-[#52525B] text-sm text-center px-2">{title}</span>
          </div>
        )}

        {/* Overlay */}
        <div className="movie-card-overlay flex flex-col justify-end p-3">
          {/* Rating Badge */}
          <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/70 backdrop-blur-sm px-2 py-1 rounded">
            <Star className="w-3 h-3 text-[#F59E0B] fill-current" />
            <span className="text-xs font-semibold">{rating}</span>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={handleWatch}
              data-testid={`play-btn-${movie.id}`}
              className="w-8 h-8 rounded-full bg-[#7C3AED] flex items-center justify-center hover:bg-[#8B5CF6] transition-all"
            >
              <Play className="w-4 h-4 fill-current" />
            </button>
            <button
              onClick={handleAddToList}
              data-testid={`add-list-btn-${movie.id}`}
              className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center hover:bg-white/30 transition-all"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              onClick={handleInfo}
              data-testid={`info-btn-${movie.id}`}
              className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center hover:bg-white/30 transition-all"
            >
              <Info className="w-4 h-4" />
            </button>
          </div>

          {/* Title */}
          <h3 className="font-semibold text-sm line-clamp-1">{title}</h3>
          <p className="text-xs text-[#A1A1AA]">
            {year} • {movie.media_type === "tv" || mediaType === "tv" ? "TV" : "Movie"}
          </p>
        </div>
      </div>
    </div>
  );
};

export default MovieCard;
