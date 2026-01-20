import React, { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import MovieCard from "./MovieCard";

const MovieRow = ({ title, movies, mediaType = "movie", onAddToList }) => {
  const scrollRef = useRef(null);
  const navigate = useNavigate();

  const scroll = (direction) => {
    if (scrollRef.current) {
      const scrollAmount = direction === "left" ? -400 : 400;
      scrollRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
    }
  };

  if (!movies || movies.length === 0) return null;

  return (
    <section className="relative group" data-testid={`movie-row-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl md:text-2xl font-bold tracking-tight">{title}</h2>
        <div className="flex items-center gap-2">
          <span className="text-sm text-[#A1A1AA]">{movies.length} titles</span>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => scroll("left")}
              data-testid={`${title.toLowerCase().replace(/\s+/g, "-")}-scroll-left`}
              className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center hover:bg-white/20 transition-all"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => scroll("right")}
              data-testid={`${title.toLowerCase().replace(/\s+/g, "-")}-scroll-right`}
              className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center hover:bg-white/20 transition-all"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto hide-scrollbar pb-4 -mx-2 px-2"
      >
        {movies.map((movie) => (
          <MovieCard
            key={movie.id}
            movie={movie}
            mediaType={movie.media_type || mediaType}
            onAddToList={onAddToList}
          />
        ))}
      </div>
    </section>
  );
};

export default MovieRow;
