# Flixz - Netflix-Style Movie Streaming Platform

## Latest Update: Full Movie Streaming Enhanced (2026-01-20)

### Streaming Sources (10 Total)
| Source | Status | Notes |
|--------|--------|-------|
| VidSrc ICU | ⭐ Popular | Most reliable |
| VidSrc NL | ⭐ Popular | Good backup |
| VidSrc CC | ⭐ Popular | Fast loading |
| SuperEmbed | Active | Multiple servers |
| Embed.su | Active | Good quality |
| Smashy | Active | Alternative |
| MoviesAPI | Active | Decent coverage |
| VidSrc Pro | Active | Original VidSrc |
| 2Embed | Active | Wide catalog |
| Trailer Only | Fallback | YouTube trailers |

### New Features
- **"Try Next" Button** - Quickly cycle through sources if one doesn't work
- **Popular Badges** - Top 3 most reliable sources marked
- **TV Show Support** - Season/Episode selector for TV series
- **Custom Content Upload** - Upload your own movies (500MB max)

### How Streaming Works
1. Click any movie → Watch Now
2. Default source (VidSrc ICU) loads automatically
3. If source shows black screen or "unavailable":
   - Click "Try Next" to automatically switch
   - Or click source picker to manually select
4. Some sources may require ad-blocker disabled

### Core Features ✅
- TMDB API Integration (movies, TV shows, search)
- Full Movie Streaming (10 embedded sources)
- Custom Content Upload
- Watch Party with WebRTC Video Calling
- JWT + Google OAuth Authentication
- My List, Continue Watching

### Tech Stack
- **Frontend:** React 19, Tailwind CSS, Framer Motion
- **Backend:** FastAPI, MongoDB
- **Streaming:** Embedded sources (VidSrc, Embed.su, etc.)
- **Real-time:** Socket.IO, WebRTC

### Next Action Items
1. Add subtitle/caption support
2. Implement auto-quality selection
3. Add parental controls for Kids category
4. Download for offline viewing
