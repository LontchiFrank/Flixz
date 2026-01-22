from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, Query, UploadFile, File, Form
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import httpx
import json
import time
import bcrypt
import jwt
import socketio
import shutil

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Create uploads directory
UPLOADS_DIR = ROOT_DIR / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Config
JWT_SECRET = os.environ.get('JWT_SECRET', 'flixz_secret_key')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24 * 7

# TMDB Config
TMDB_API_KEY = os.environ.get('TMDB_API_KEY')
TMDB_BASE_URL = "https://api.themoviedb.org/3"
IMAGE_BASE_URL = "https://image.tmdb.org/t/p/"


# Cache for TMDB requests
cache: Dict[str, Dict[str, Any]] = {}
CACHE_TTL = 60 * 60  # 1 hour

# Create the main app
app = FastAPI(title="Flixz API")

# Socket.IO for Watch Party
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "https://flixz.onrender.com",
        "https://flixz-iota.vercel.app"
    ]
)
socket_app = socketio.ASGIApp(sio, app)

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ==================== MODELS ====================

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    created_at: datetime

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class WatchPartyCreate(BaseModel):
    name: str
    movie_id: int
    media_type: str = "movie"

class WatchPartyResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    room_id: str
    name: str
    movie_id: int
    media_type: str
    host_id: str
    host_name: str
    created_at: datetime
    is_playing: bool = False
    current_time: float = 0.0
    current_source: Optional[str] = None
    participants: List[Dict[str, str]] = []

class MyListItem(BaseModel):
    media_id: int
    media_type: str
    title: str
    poster_path: Optional[str] = None
    backdrop_path: Optional[str] = None
    vote_average: Optional[float] = None

class ContinueWatchingItem(BaseModel):
    media_id: int
    media_type: str
    title: str
    poster_path: Optional[str] = None
    progress: float = 0.0
    duration: float = 0.0
    season: Optional[int] = None
    episode: Optional[int] = None

# ==================== HELPERS ====================

async def tmdb_request(endpoint: str, params: dict = None) -> Optional[dict]:
    """Make a cached request to TMDB API"""
    params = params or {}
    cache_key = f"{endpoint}_{json.dumps(params, sort_keys=True)}"

    cached = cache.get(cache_key)
    if cached and time.time() - cached["ts"] < CACHE_TTL:
        return cached["data"]

    async with httpx.AsyncClient() as client:
        try:
            url = f"{TMDB_BASE_URL}{endpoint}"
            # Check if API key is a Bearer token (starts with 'eyJ') or regular API key
            headers = {}
            if TMDB_API_KEY and TMDB_API_KEY.startswith('eyJ'):
                # Bearer token for API v4
                headers["Authorization"] = f"Bearer {TMDB_API_KEY}"
            else:
                # Regular API key for API v3
                params["api_key"] = TMDB_API_KEY

            response = await client.get(url, params=params, headers=headers, timeout=10)

            if response.status_code == 429:
                await asyncio.sleep(2)
                response = await client.get(url, params=params, headers=headers, timeout=10)

            response.raise_for_status()
            data = response.json()
            cache[cache_key] = {"data": data, "ts": time.time()}
            return data
        except Exception as e:
            logger.error(f"TMDB request failed: {e}")
            return None

def get_image_url(path: str, size: str = "w500") -> Optional[str]:
    return f"{IMAGE_BASE_URL}{size}{path}" if path else None

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def create_token(user_id: str) -> str:
    payload = {
        "user_id": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(request: Request) -> dict:
    """Get current user from JWT token"""
    auth_header = request.headers.get("Authorization")
    token = None
    
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
    
    if not token:
        token = request.cookies.get("session_token")
    
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("user_id")
        
        user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
        if not user:
            # Check if it's a Google OAuth session
            session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
            if session:
                user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
        
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        # Try Google OAuth session
        session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
        if session:
            expires_at = session.get("expires_at")
            if isinstance(expires_at, str):
                expires_at = datetime.fromisoformat(expires_at)
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if expires_at < datetime.now(timezone.utc):
                raise HTTPException(status_code=401, detail="Session expired")
            
            user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
            if user:
                return user
        
        raise HTTPException(status_code=401, detail="Invalid token")

import asyncio

# ==================== AUTH ROUTES ====================

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    hashed_password = hash_password(user_data.password)
    
    user_doc = {
        "user_id": user_id,
        "email": user_data.email,
        "name": user_data.name,
        "password": hashed_password,
        "picture": None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.users.insert_one(user_doc)
    
    token = create_token(user_id)
    user_doc.pop("password")
    user_doc["created_at"] = datetime.fromisoformat(user_doc["created_at"])
    
    return TokenResponse(access_token=token, user=UserResponse(**user_doc))

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    if not user or not user.get("password"):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if not verify_password(credentials.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_token(user["user_id"])
    user.pop("password", None)
    
    if isinstance(user["created_at"], str):
        user["created_at"] = datetime.fromisoformat(user["created_at"])
    
    return TokenResponse(access_token=token, user=UserResponse(**user))

@api_router.get("/auth/session")
async def process_google_session(request: Request, response: Response):
    """Process Google OAuth session_id and exchange for session_token"""
    session_id = request.headers.get("X-Session-ID")
    if not session_id:
        raise HTTPException(status_code=400, detail="Missing session_id")
    
    async with httpx.AsyncClient() as client:
        try:
            res = await client.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": session_id}
            )
            res.raise_for_status()
            session_data = res.json()
        except Exception as e:
            logger.error(f"Failed to fetch session data: {e}")
            raise HTTPException(status_code=401, detail="Invalid session")
    
    email = session_data.get("email")
    name = session_data.get("name")
    picture = session_data.get("picture")
    session_token = session_data.get("session_token")
    
    # Find or create user
    user = await db.users.find_one({"email": email}, {"_id": 0})
    
    if user:
        user_id = user["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": name, "picture": picture}}
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user = {
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(user)
    
    # Store session
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=7 * 24 * 60 * 60
    )
    
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if isinstance(user["created_at"], str):
        user["created_at"] = datetime.fromisoformat(user["created_at"])
    
    return UserResponse(**user)

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(user: dict = Depends(get_current_user)):
    if isinstance(user["created_at"], str):
        user["created_at"] = datetime.fromisoformat(user["created_at"])
    return UserResponse(**user)

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("session_token")
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/")
    return {"message": "Logged out"}

# ==================== TMDB ROUTES ====================

@api_router.get("/movies/trending")
async def get_trending_movies(time_window: str = "week"):
    data = await tmdb_request(f"/trending/movie/{time_window}")
    return data or {"results": []}

@api_router.get("/movies/popular")
async def get_popular_movies(page: int = 1):
    data = await tmdb_request("/movie/popular", {"page": page})
    return data or {"results": []}

@api_router.get("/movies/now-playing")
async def get_now_playing(page: int = 1):
    data = await tmdb_request("/movie/now_playing", {"page": page})
    return data or {"results": []}

@api_router.get("/movies/upcoming")
async def get_upcoming_movies(page: int = 1):
    data = await tmdb_request("/movie/upcoming", {"page": page})
    return data or {"results": []}

@api_router.get("/movies/top-rated")
async def get_top_rated_movies(page: int = 1):
    data = await tmdb_request("/movie/top_rated", {"page": page})
    return data or {"results": []}

@api_router.get("/movies/{movie_id}")
async def get_movie_details(movie_id: int):
    data = await tmdb_request(f"/movie/{movie_id}", {
        "append_to_response": "credits,videos,images,similar,recommendations"
    })
    if not data:
        raise HTTPException(status_code=404, detail="Movie not found")
    return data

@api_router.get("/tv/trending")
async def get_trending_tv(time_window: str = "week"):
    data = await tmdb_request(f"/trending/tv/{time_window}")
    return data or {"results": []}

@api_router.get("/tv/popular")
async def get_popular_tv(page: int = 1):
    data = await tmdb_request("/tv/popular", {"page": page})
    return data or {"results": []}

@api_router.get("/tv/airing-today")
async def get_airing_today(page: int = 1):
    data = await tmdb_request("/tv/airing_today", {"page": page})
    return data or {"results": []}

@api_router.get("/tv/top-rated")
async def get_top_rated_tv(page: int = 1):
    data = await tmdb_request("/tv/top_rated", {"page": page})
    return data or {"results": []}

@api_router.get("/tv/{tv_id}")
async def get_tv_details(tv_id: int):
    data = await tmdb_request(f"/tv/{tv_id}", {
        "append_to_response": "credits,videos,images,similar,content_ratings"
    })
    if not data:
        raise HTTPException(status_code=404, detail="TV show not found")
    return data

@api_router.get("/tv/{tv_id}/season/{season_num}")
async def get_tv_season(tv_id: int, season_num: int):
    data = await tmdb_request(f"/tv/{tv_id}/season/{season_num}")
    if not data:
        raise HTTPException(status_code=404, detail="Season not found")
    return data

@api_router.get("/search/multi")
async def search_multi(query: str, page: int = 1):
    data = await tmdb_request("/search/multi", {"query": query, "page": page})
    return data or {"results": []}

@api_router.get("/discover/movie")
async def discover_movies(
    page: int = 1,
    genre: Optional[str] = None,
    sort_by: str = "popularity.desc",
    year: Optional[int] = None
):
    params = {"page": page, "sort_by": sort_by}
    if genre:
        params["with_genres"] = genre
    if year:
        params["year"] = year
    data = await tmdb_request("/discover/movie", params)
    return data or {"results": []}

@api_router.get("/discover/tv")
async def discover_tv(
    page: int = 1,
    genre: Optional[str] = None,
    sort_by: str = "popularity.desc"
):
    params = {"page": page, "sort_by": sort_by}
    if genre:
        params["with_genres"] = genre
    data = await tmdb_request("/discover/tv", params)
    return data or {"results": []}

@api_router.get("/genres/movie")
async def get_movie_genres():
    data = await tmdb_request("/genre/movie/list")
    return data or {"genres": []}

@api_router.get("/genres/tv")
async def get_tv_genres():
    data = await tmdb_request("/genre/tv/list")
    return data or {"genres": []}

# Category-specific endpoints
@api_router.get("/category/documentaries")
async def get_documentaries(page: int = 1):
    data = await tmdb_request("/discover/movie", {"page": page, "with_genres": "99", "sort_by": "popularity.desc"})
    return data or {"results": []}

@api_router.get("/category/kids")
async def get_kids_content(page: int = 1):
    # Animation + Family genres
    data = await tmdb_request("/discover/movie", {"page": page, "with_genres": "16,10751", "sort_by": "popularity.desc"})
    return data or {"results": []}

@api_router.get("/category/sports")
async def get_sports_content(page: int = 1):
    data = await tmdb_request("/search/multi", {"query": "sports documentary", "page": page})
    return data or {"results": []}

# ==================== MY LIST ROUTES ====================

@api_router.get("/my-list")
async def get_my_list(user: dict = Depends(get_current_user)):
    items = await db.my_list.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(100)
    return {"items": items}

@api_router.post("/my-list")
async def add_to_my_list(item: MyListItem, user: dict = Depends(get_current_user)):
    existing = await db.my_list.find_one({
        "user_id": user["user_id"],
        "media_id": item.media_id,
        "media_type": item.media_type
    })
    
    if existing:
        raise HTTPException(status_code=400, detail="Already in list")
    
    doc = item.model_dump()
    doc["user_id"] = user["user_id"]
    doc["added_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.my_list.insert_one(doc)
    return {"message": "Added to list"}

@api_router.delete("/my-list/{media_type}/{media_id}")
async def remove_from_my_list(media_type: str, media_id: int, user: dict = Depends(get_current_user)):
    result = await db.my_list.delete_one({
        "user_id": user["user_id"],
        "media_id": media_id,
        "media_type": media_type
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not in list")
    
    return {"message": "Removed from list"}

@api_router.get("/my-list/check/{media_type}/{media_id}")
async def check_in_my_list(media_type: str, media_id: int, user: dict = Depends(get_current_user)):
    item = await db.my_list.find_one({
        "user_id": user["user_id"],
        "media_id": media_id,
        "media_type": media_type
    })
    return {"in_list": item is not None}

# ==================== CONTINUE WATCHING ====================

@api_router.get("/continue-watching")
async def get_continue_watching(user: dict = Depends(get_current_user)):
    items = await db.continue_watching.find(
        {"user_id": user["user_id"]},
        {"_id": 0}
    ).sort("updated_at", -1).to_list(20)
    return {"items": items}

@api_router.post("/continue-watching")
async def update_continue_watching(item: ContinueWatchingItem, user: dict = Depends(get_current_user)):
    doc = item.model_dump()
    doc["user_id"] = user["user_id"]
    doc["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.continue_watching.update_one(
        {"user_id": user["user_id"], "media_id": item.media_id, "media_type": item.media_type},
        {"$set": doc},
        upsert=True
    )
    return {"message": "Progress saved"}

# ==================== WATCH PARTY ROUTES ====================

@api_router.post("/watch-party", response_model=WatchPartyResponse)
async def create_watch_party(data: WatchPartyCreate, user: dict = Depends(get_current_user)):
    room_id = f"room_{uuid.uuid4().hex[:8]}"
    
    party = {
        "room_id": room_id,
        "name": data.name,
        "movie_id": data.movie_id,
        "media_type": data.media_type,
        "host_id": user["user_id"],
        "host_name": user["name"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "is_playing": False,
        "current_time": 0.0,
        "current_source": "vidsrcxyz",  # Default to first source
        "participants": [{"user_id": user["user_id"], "name": user["name"]}]
    }
    
    await db.watch_parties.insert_one(party)
    party["created_at"] = datetime.fromisoformat(party["created_at"])
    return WatchPartyResponse(**party)

@api_router.get("/watch-party/{room_id}", response_model=WatchPartyResponse)
async def get_watch_party(room_id: str):
    party = await db.watch_parties.find_one({"room_id": room_id}, {"_id": 0})
    if not party:
        raise HTTPException(status_code=404, detail="Room not found")
    
    if isinstance(party["created_at"], str):
        party["created_at"] = datetime.fromisoformat(party["created_at"])
    
    return WatchPartyResponse(**party)

@api_router.post("/watch-party/{room_id}/join")
async def join_watch_party(room_id: str, user: dict = Depends(get_current_user)):
    party = await db.watch_parties.find_one({"room_id": room_id})
    if not party:
        raise HTTPException(status_code=404, detail="Room not found")
    
    # Check if already in party
    participants = party.get("participants", [])
    if not any(p["user_id"] == user["user_id"] for p in participants):
        participants.append({"user_id": user["user_id"], "name": user["name"]})
        await db.watch_parties.update_one(
            {"room_id": room_id},
            {"$set": {"participants": participants}}
        )
    
    return {"message": "Joined party"}

@api_router.delete("/watch-party/{room_id}")
async def delete_watch_party(room_id: str, user: dict = Depends(get_current_user)):
    party = await db.watch_parties.find_one({"room_id": room_id})
    if not party:
        raise HTTPException(status_code=404, detail="Room not found")
    
    if party["host_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Only host can delete")
    
    await db.watch_parties.delete_one({"room_id": room_id})
    return {"message": "Party deleted"}

@api_router.get("/watch-party")
async def list_watch_parties(user: dict = Depends(get_current_user)):
    parties = await db.watch_parties.find({}, {"_id": 0}).sort("created_at", -1).to_list(50)
    for p in parties:
        if isinstance(p["created_at"], str):
            p["created_at"] = datetime.fromisoformat(p["created_at"])
    return {"parties": parties}

# ==================== SOCKET.IO EVENTS ====================

# Store active connections per room
room_connections: Dict[str, Dict[str, str]] = {}

@sio.event
async def connect(sid, environ):
    logger.info(f"Client connected: {sid}")

@sio.event
async def disconnect(sid):
    logger.info(f"Client disconnected: {sid}")
    # Remove from all rooms
    for room_id, connections in list(room_connections.items()):
        if sid in connections:
            user_name = connections.pop(sid)
            await sio.emit('user_left', {'user_name': user_name}, room=room_id)

@sio.event
async def join_room(sid, data):
    room_id = data.get('room_id')
    user_name = data.get('user_name', 'Anonymous')
    
    await sio.enter_room(sid, room_id)
    
    if room_id not in room_connections:
        room_connections[room_id] = {}
    room_connections[room_id][sid] = user_name
    
    await sio.emit('user_joined', {'user_name': user_name}, room=room_id)
    logger.info(f"{user_name} joined room {room_id}")

@sio.event
async def leave_room(sid, data):
    room_id = data.get('room_id')
    
    if room_id in room_connections and sid in room_connections[room_id]:
        user_name = room_connections[room_id].pop(sid)
        await sio.emit('user_left', {'user_name': user_name}, room=room_id)
    
    await sio.leave_room(sid, room_id)

@sio.event
async def sync_playback(sid, data):
    room_id = data.get('room_id')
    is_playing = data.get('is_playing')
    current_time = data.get('current_time')
    source = data.get('source')
    user_name = data.get('user_name')

    # Update database
    update_data = {"is_playing": is_playing, "current_time": current_time}
    if source:
        update_data["current_source"] = source

    await db.watch_parties.update_one(
        {"room_id": room_id},
        {"$set": update_data}
    )

    # Broadcast to room
    broadcast_data = {
        'is_playing': is_playing,
        'current_time': current_time,
        'user_name': user_name
    }
    if source:
        broadcast_data['source'] = source

    await sio.emit('playback_sync', broadcast_data, room=room_id, skip_sid=sid)

@sio.event
async def chat_message(sid, data):
    room_id = data.get('room_id')
    message = data.get('message')
    user_name = data.get('user_name', 'Anonymous')
    
    await sio.emit('new_message', {
        'user_name': user_name,
        'message': message,
        'timestamp': datetime.now(timezone.utc).isoformat()
    }, room=room_id)

@sio.event
async def delete_party(sid, data):
    """Host deletes the watch party"""
    room_id = data.get('room_id')
    user_name = data.get('user_name', 'Host')

    # Notify all participants
    await sio.emit('party_deleted', {
        'user_name': user_name,
        'room_id': room_id
    }, room=room_id)

    logger.info(f"Party {room_id} deleted by {user_name}")

# ==================== WEBRTC SIGNALING ====================

# Store peer connections per room
peer_connections: Dict[str, Dict[str, dict]] = {}

@sio.event
async def webrtc_join(sid, data):
    """User joins video call in a room"""
    room_id = data.get('room_id')
    user_id = data.get('user_id')
    user_name = data.get('user_name', 'Anonymous')
    
    if room_id not in peer_connections:
        peer_connections[room_id] = {}
    
    # Store user info
    peer_connections[room_id][sid] = {
        'user_id': user_id,
        'user_name': user_name
    }
    
    # Notify existing peers about new user
    existing_peers = [
        {'sid': peer_sid, **peer_info}
        for peer_sid, peer_info in peer_connections[room_id].items()
        if peer_sid != sid
    ]
    
    # Send existing peers to the new user
    await sio.emit('webrtc_peers', {'peers': existing_peers}, to=sid)
    
    # Notify others about new peer
    await sio.emit('webrtc_peer_joined', {
        'sid': sid,
        'user_id': user_id,
        'user_name': user_name
    }, room=room_id, skip_sid=sid)
    
    logger.info(f"WebRTC: {user_name} joined video in room {room_id}")

@sio.event
async def webrtc_leave(sid, data):
    """User leaves video call"""
    room_id = data.get('room_id')
    
    if room_id in peer_connections and sid in peer_connections[room_id]:
        user_info = peer_connections[room_id].pop(sid)
        await sio.emit('webrtc_peer_left', {'sid': sid}, room=room_id)
        logger.info(f"WebRTC: {user_info.get('user_name')} left video in room {room_id}")

@sio.event
async def webrtc_offer(sid, data):
    """Relay WebRTC offer to target peer"""
    target_sid = data.get('target')
    offer = data.get('offer')
    
    await sio.emit('webrtc_offer', {
        'from': sid,
        'offer': offer
    }, to=target_sid)

@sio.event
async def webrtc_answer(sid, data):
    """Relay WebRTC answer to target peer"""
    target_sid = data.get('target')
    answer = data.get('answer')
    
    await sio.emit('webrtc_answer', {
        'from': sid,
        'answer': answer
    }, to=target_sid)

@sio.event
async def webrtc_ice_candidate(sid, data):
    """Relay ICE candidate to target peer"""
    target_sid = data.get('target')
    candidate = data.get('candidate')
    
    await sio.emit('webrtc_ice_candidate', {
        'from': sid,
        'candidate': candidate
    }, to=target_sid)

@sio.event
async def webrtc_toggle_media(sid, data):
    """Notify others about media toggle (mute/unmute)"""
    room_id = data.get('room_id')
    media_type = data.get('type')  # 'audio' or 'video'
    enabled = data.get('enabled')
    
    await sio.emit('webrtc_media_toggle', {
        'sid': sid,
        'type': media_type,
        'enabled': enabled
    }, room=room_id, skip_sid=sid)

# ==================== USER PROFILE ====================

class UserProfileUpdate(BaseModel):
    name: Optional[str] = None
    avatar_url: Optional[str] = None

@api_router.get("/user/profile")
async def get_user_profile(user: dict = Depends(get_current_user)):
    profile = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password": 0})
    if not profile:
        raise HTTPException(status_code=404, detail="User not found")
    return profile

@api_router.put("/user/profile")
async def update_user_profile(updates: UserProfileUpdate, user: dict = Depends(get_current_user)):
    update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No updates provided")
    
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": update_data}
    )
    return {"message": "Profile updated"}

@api_router.get("/user/stats")
async def get_user_stats(user: dict = Depends(get_current_user)):
    my_list_count = await db.my_list.count_documents({"user_id": user["user_id"]})
    continue_watching_count = await db.continue_watching.count_documents({"user_id": user["user_id"]})
    watch_parties_hosted = await db.watch_parties.count_documents({"host_id": user["user_id"]})
    
    return {
        "my_list_count": my_list_count,
        "continue_watching_count": continue_watching_count,
        "watch_parties_hosted": watch_parties_hosted
    }

# ==================== NOTIFICATIONS ====================

class NotificationCreate(BaseModel):
    recipient_id: str
    type: str
    title: str
    message: str
    data: Optional[dict] = None

@api_router.get("/notifications")
async def get_notifications(user: dict = Depends(get_current_user)):
    notifications = await db.notifications.find(
        {"recipient_id": user["user_id"]},
        {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return {"notifications": notifications}

@api_router.post("/notifications/invite")
async def send_watch_party_invite(
    room_id: str,
    invitee_email: str,
    user: dict = Depends(get_current_user)
):
    # Get party details first
    party = await db.watch_parties.find_one({"room_id": room_id}, {"_id": 0})
    if not party:
        raise HTTPException(status_code=404, detail="Watch party not found")

    # Find invitee
    invitee = await db.users.find_one({"email": invitee_email}, {"_id": 0})

    if not invitee:
        # User doesn't exist - return success but indicate they need to share link
        return {
            "status": "pending",
            "message": f"User with email '{invitee_email}' is not registered yet. Please share the watch party link with them directly!",
            "user_exists": False
        }

    # Create notification for existing user
    notification = {
        "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
        "recipient_id": invitee["user_id"],
        "type": "watch_party_invite",
        "title": "Watch Party Invitation",
        "message": f"{user['name']} invited you to watch '{party['name']}'",
        "data": {
            "room_id": room_id,
            "inviter_name": user["name"],
            "party_name": party["name"]
        },
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.notifications.insert_one(notification)
    return {"message": "Invitation sent"}

@api_router.put("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, user: dict = Depends(get_current_user)):
    await db.notifications.update_one(
        {"notification_id": notification_id, "recipient_id": user["user_id"]},
        {"$set": {"read": True}}
    )
    return {"message": "Marked as read"}

@api_router.delete("/notifications/{notification_id}")
async def delete_notification(notification_id: str, user: dict = Depends(get_current_user)):
    await db.notifications.delete_one({
        "notification_id": notification_id,
        "recipient_id": user["user_id"]
    })
    return {"message": "Notification deleted"}

# ==================== CUSTOM CONTENT ====================

class CustomContentCreate(BaseModel):
    title: str
    description: Optional[str] = None
    media_type: str = "movie"  # movie or tv
    genre: Optional[str] = None
    year: Optional[int] = None
    poster_url: Optional[str] = None
    backdrop_url: Optional[str] = None

class CustomContentResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    content_id: str
    title: str
    description: Optional[str] = None
    media_type: str
    genre: Optional[str] = None
    year: Optional[int] = None
    poster_url: Optional[str] = None
    backdrop_url: Optional[str] = None
    video_url: Optional[str] = None
    uploaded_by: str
    created_at: datetime

@api_router.post("/custom-content/upload")
async def upload_custom_content(
    title: str = Form(...),
    description: str = Form(None),
    media_type: str = Form("movie"),
    genre: str = Form(None),
    year: int = Form(None),
    video: UploadFile = File(...),
    poster: UploadFile = File(None),
    user: dict = Depends(get_current_user)
):
    """Upload custom video content"""
    content_id = f"custom_{uuid.uuid4().hex[:12]}"
    
    # Validate video file
    allowed_video_types = ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo"]
    if video.content_type not in allowed_video_types:
        raise HTTPException(status_code=400, detail="Invalid video format. Allowed: MP4, WebM, MOV, AVI")
    
    # Create content directory
    content_dir = UPLOADS_DIR / content_id
    content_dir.mkdir(exist_ok=True)
    
    # Save video file
    video_filename = f"video_{uuid.uuid4().hex[:8]}{Path(video.filename).suffix}"
    video_path = content_dir / video_filename
    
    with open(video_path, "wb") as buffer:
        shutil.copyfileobj(video.file, buffer)
    
    video_url = f"/api/uploads/{content_id}/{video_filename}"
    
    # Save poster if provided
    poster_url = None
    if poster:
        poster_filename = f"poster_{uuid.uuid4().hex[:8]}{Path(poster.filename).suffix}"
        poster_path = content_dir / poster_filename
        with open(poster_path, "wb") as buffer:
            shutil.copyfileobj(poster.file, buffer)
        poster_url = f"/api/uploads/{content_id}/{poster_filename}"
    
    # Save to database
    content_doc = {
        "content_id": content_id,
        "title": title,
        "description": description,
        "media_type": media_type,
        "genre": genre,
        "year": year,
        "poster_url": poster_url,
        "backdrop_url": poster_url,  # Use poster as backdrop too
        "video_url": video_url,
        "uploaded_by": user["user_id"],
        "uploader_name": user["name"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "views": 0
    }
    
    await db.custom_content.insert_one(content_doc)
    
    return {
        "message": "Content uploaded successfully",
        "content_id": content_id,
        "video_url": video_url,
        "poster_url": poster_url
    }

@api_router.get("/custom-content")
async def list_custom_content(page: int = 1, limit: int = 20):
    """List all custom content"""
    skip = (page - 1) * limit
    
    content = await db.custom_content.find(
        {},
        {"_id": 0}
    ).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    total = await db.custom_content.count_documents({})
    
    return {
        "results": content,
        "total": total,
        "page": page,
        "total_pages": (total + limit - 1) // limit
    }

@api_router.get("/custom-content/{content_id}")
async def get_custom_content(content_id: str):
    """Get custom content details"""
    content = await db.custom_content.find_one(
        {"content_id": content_id},
        {"_id": 0}
    )
    
    if not content:
        raise HTTPException(status_code=404, detail="Content not found")
    
    # Increment views
    await db.custom_content.update_one(
        {"content_id": content_id},
        {"$inc": {"views": 1}}
    )
    
    return content

@api_router.delete("/custom-content/{content_id}")
async def delete_custom_content(content_id: str, user: dict = Depends(get_current_user)):
    """Delete custom content (only owner can delete)"""
    content = await db.custom_content.find_one({"content_id": content_id})
    
    if not content:
        raise HTTPException(status_code=404, detail="Content not found")
    
    if content["uploaded_by"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Not authorized to delete this content")
    
    # Delete files
    content_dir = UPLOADS_DIR / content_id
    if content_dir.exists():
        shutil.rmtree(content_dir)
    
    # Delete from database
    await db.custom_content.delete_one({"content_id": content_id})
    
    return {"message": "Content deleted"}

@api_router.get("/uploads/{content_id}/{filename}")
async def serve_upload(content_id: str, filename: str):
    """Serve uploaded files"""
    file_path = UPLOADS_DIR / content_id / filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    # Determine media type
    suffix = file_path.suffix.lower()
    media_types = {
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".mov": "video/quicktime",
        ".avi": "video/x-msvideo",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
    }
    
    media_type = media_types.get(suffix, "application/octet-stream")
    
    return FileResponse(file_path, media_type=media_type)

# ==================== HEALTH CHECK ====================

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "service": "Flixz API"}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "https://flixz.onrender.com",
        "https://flixz-frontend.onrender.com",
        "https://flixz-iota.vercel.app",
        # Add any other frontend URLs here
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

# Mount Socket.IO
app.mount("/socket.io", socket_app)
