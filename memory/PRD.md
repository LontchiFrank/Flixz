# Flixz - Netflix-Style Movie Streaming Platform

## Original Problem Statement
Build a movie website like Netflix or Prime with:
- Dashboard where you can watch movies
- Categories: Movies, TV Shows, Series, Live TV, Documentaries, Kids, Sports
- Screen sharing feature - room-based watch party system to watch with friends
- Using free TMDB API for movie data
- Design inspired by user-provided Netflix screenshot
- **Enhancement:** WebRTC video calling in Watch Party (like Google Meet)

## User Personas
1. **Casual Viewer** - Browses movies/shows, uses search, manages watchlist
2. **Social Watcher** - Creates watch parties, invites friends, uses video call + chat
3. **Binge Watcher** - Uses continue watching, favorites, TV series features

## Core Requirements (Static)
- [x] TMDB API integration for movie/TV data
- [x] Dark theme with purple accents
- [x] User authentication (JWT + Google OAuth)
- [x] Movie browsing with categories
- [x] Search functionality
- [x] My List (watchlist)
- [x] Watch Party with real-time sync
- [x] WebRTC Video Calling in Watch Party
- [x] User Profile page
- [x] Notifications system

## Implementation Status (Updated: 2026-01-20)

### Backend (FastAPI)
- [x] TMDB API integration with caching
- [x] Movie endpoints (trending, popular, now-playing, upcoming, top-rated)
- [x] TV endpoints (trending, popular, airing-today, top-rated)
- [x] Search multi endpoint
- [x] Discover with genre filtering
- [x] Category endpoints (documentaries, kids, sports)
- [x] User authentication (register, login, Google OAuth)
- [x] My List CRUD operations
- [x] Continue Watching tracking
- [x] Watch Party CRUD + Socket.IO for real-time sync
- [x] **NEW:** WebRTC signaling (offer, answer, ICE candidates)
- [x] **NEW:** User profile/stats endpoints
- [x] **NEW:** Notifications system with watch party invites

### Frontend (React)
- [x] HomePage with 3D carousel, hero section, movie rows
- [x] **NEW:** Continue Watching row (shows progress bars)
- [x] BrowsePage with category pills and genre filters
- [x] DetailPage for movies/TV shows with tabs (Overview, Cast, Trailer)
- [x] WatchPage with YouTube trailer embedding
- [x] SearchPage with results grid
- [x] LoginPage with email/password and Google OAuth
- [x] RegisterPage
- [x] MyListPage
- [x] **NEW:** ProfilePage with stats, notifications, quick actions
- [x] **ENHANCED:** WatchPartyPage with:
  - Room creation with movie search
  - YouTube trailer playback
  - Real-time chat with Socket.IO
  - **NEW:** WebRTC video calling (camera/mic toggle)
  - **NEW:** Share links (Copy Link, WhatsApp, Twitter, Telegram)
  - **NEW:** Invite friends via email notification
  - **NEW:** Video grid showing participants

### Design
- [x] Dark theme (#050505 background)
- [x] Purple accents (#7C3AED)
- [x] Glassmorphism cards
- [x] Neon glow effects
- [x] Outfit + DM Sans fonts
- [x] Responsive sidebar + mobile nav

## Tech Stack
- **Frontend:** React 19, Tailwind CSS, Framer Motion, Socket.IO Client, WebRTC
- **Backend:** FastAPI, Motor (MongoDB), Python-SocketIO
- **Database:** MongoDB
- **APIs:** TMDB API
- **Auth:** JWT + Emergent Google OAuth
- **Real-time:** Socket.IO for chat/sync, WebRTC for video calls

## Prioritized Backlog

### P0 (Critical - Done)
- [x] TMDB API integration
- [x] User authentication
- [x] Movie browsing
- [x] Movie details
- [x] Watch Party rooms
- [x] WebRTC video calling

### P1 (High Priority - Done)
- [x] My List functionality
- [x] Search
- [x] Category filtering
- [x] User profile
- [x] Notifications
- [x] Social sharing

### P2 (Medium Priority - Future)
- [ ] Full video streaming (beyond trailers)
- [ ] Watch history analytics
- [ ] Recommendation engine
- [ ] Download for offline
- [ ] Multiple user profiles per account

### P3 (Nice to Have)
- [ ] Parental controls
- [ ] Subtitle support
- [ ] Quality settings
- [ ] Language preferences
- [ ] Screen recording of watch party

## Next Action Items
1. Integrate full video streaming API (beyond YouTube trailers)
2. Add recommendation engine based on watch history
3. Implement parental controls for Kids category
4. Add subtitle/caption support
