import React, { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Play, Clock } from "lucide-react";

const IMAGE_BASE = "https://image.tmdb.org/t/p/";

const ContinueWatchingRow = ({ items }) => {
  const scrollRef = useRef(null);
  const navigate = useNavigate();

  const scroll = (direction) => {
    if (scrollRef.current) {
      const scrollAmount = direction === "left" ? -400 : 400;
      scrollRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
    }
  };

  const formatProgress = (progress, duration) => {
    if (!duration) return "0%";
    const percent = Math.round((progress / duration) * 100);
    return `${percent}%`;
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    return `${mins} min left`;
  };

  if (!items || items.length === 0) return null;

  return (
    <section className="relative group" data-testid="continue-watching-row">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Clock className="w-5 h-5 text-[#7C3AED]" />
          <h2 className="text-xl md:text-2xl font-bold tracking-tight">
            Continue Watching
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-[#A1A1AA]">{items.length} in progress</span>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => scroll("left")}
              data-testid="continue-watching-scroll-left"
              className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center hover:bg-white/20 transition-all"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => scroll("right")}
              data-testid="continue-watching-scroll-right"
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
        {items.map((item) => {
          const progressPercent = item.duration
            ? (item.progress / item.duration) * 100
            : 0;

          return (
            <div
              key={`${item.media_type}-${item.media_id}`}
              onClick={() => navigate(`/watch/${item.media_type}/${item.media_id}`)}
              data-testid={`continue-watching-${item.media_id}`}
              className="flex-shrink-0 w-[280px] cursor-pointer group/card"
            >
              {/* Thumbnail */}
              <div className="relative aspect-video rounded-xl overflow-hidden mb-3 bg-[#121212]">
                {item.poster_path ? (
                  <img
                    src={`${IMAGE_BASE}w500${item.poster_path}`}
                    alt={item.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[#52525B]">
                    No Image
                  </div>
                )}

                {/* Play overlay */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/card:opacity-100 transition-opacity flex items-center justify-center">
                  <div className="w-14 h-14 rounded-full bg-[#7C3AED] flex items-center justify-center">
                    <Play className="w-7 h-7 fill-current ml-1" />
                  </div>
                </div>

                {/* Progress bar */}
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                  <div
                    className="h-full bg-[#7C3AED]"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>

                {/* Time remaining badge */}
                {item.duration && item.progress && (
                  <div className="absolute top-2 right-2 px-2 py-1 rounded bg-black/70 backdrop-blur-sm text-xs">
                    {formatTime(item.duration - item.progress)}
                  </div>
                )}
              </div>

              {/* Info */}
              <div>
                <h3 className="font-semibold text-sm line-clamp-1 group-hover/card:text-[#7C3AED] transition-colors">
                  {item.title}
                </h3>
                <div className="flex items-center gap-2 text-xs text-[#A1A1AA] mt-1">
                  <span>{item.media_type === "tv" ? "TV Show" : "Movie"}</span>
                  {item.season && item.episode && (
                    <>
                      <span>•</span>
                      <span>S{item.season} E{item.episode}</span>
                    </>
                  )}
                  <span>•</span>
                  <span>{formatProgress(item.progress, item.duration)} watched</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default ContinueWatchingRow;
