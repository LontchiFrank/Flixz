# Flixz - Netflix-Style Movie Streaming Platform

## Original Problem Statement
Build a movie website like Netflix or Prime with:
- Dashboard where you can watch movies
- Categories: Movies, TV Shows, Series, Live TV, Documentaries, Kids, Sports
- Screen sharing feature - room-based watch party system to watch with friends
- Using free TMDB API for movie data
- Design inspired by user-provided Netflix screenshot

## User Personas
1. **Casual Viewer** - Browses movies/shows, uses search, manages watchlist
2. **Social Watcher** - Creates watch parties, invites friends, uses chat
3. **Binge Watcher** - Uses continue watching, favorites, TV series features

## Core Requirements (Static)
- [x] TMDB API integration for movie/TV data
- [x] Dark theme with purple accents
- [x] User authentication (JWT + Google OAuth)
- [x] Movie browsing with categories
- [x] Search functionality
- [x] My List (watchlist)
- [x] Watch Party with real-time sync

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

### Frontend (React)
- [x] HomePage with 3D carousel, hero section, movie rows
- [x] BrowsePage with category pills and genre filters
- [x] DetailPage for movies/TV shows with tabs (Overview, Cast, Trailer)
- [x] WatchPage with YouTube trailer embedding
- [x] SearchPage with results grid
- [x] LoginPage with email/password and Google OAuth
- [x] RegisterPage
- [x] MyListPage
- [x] WatchPartyPage with room creation, participant list, chat

### Design
- [x] Dark theme (#050505 background)
- [x] Purple accents (#7C3AED)
- [x] Glassmorphism cards
- [x] Neon glow effects
- [x] Outfit + DM Sans fonts
- [x] Responsive sidebar + mobile nav

## Prioritized Backlog

### P0 (Critical - Done)
- [x] TMDB API integration
- [x] User authentication
- [x] Movie browsing
- [x] Movie details

### P1 (High Priority - Done)
- [x] Watch Party rooms
- [x] My List functionality
- [x] Search
- [x] Category filtering

### P2 (Medium Priority - Future)
- [ ] Continue Watching UI on home page
- [ ] Watch history tracking
- [ ] User profile page
- [ ] Notifications for watch party invites
- [ ] Download for offline (if applicable)

### P3 (Nice to Have)
- [ ] Multiple user profiles per account
- [ ] Parental controls
- [ ] Subtitle support
- [ ] Quality settings
- [ ] Language preferences

## Tech Stack
- **Frontend:** React 19, Tailwind CSS, Framer Motion, Socket.IO Client
- **Backend:** FastAPI, Motor (MongoDB), Python-SocketIO
- **Database:** MongoDB
- **APIs:** TMDB API
- **Auth:** JWT + Emergent Google OAuth

## Next Action Items
1. Add "Continue Watching" row to homepage
2. Implement user profile page
3. Add notifications for watch party invites
4. Consider adding subtitle support
