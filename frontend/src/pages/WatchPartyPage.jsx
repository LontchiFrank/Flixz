/** @format */

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { io } from "socket.io-client";
import { toast } from "sonner";
import {
	Play,
	Pause,
	Users,
	Send,
	Copy,
	Share2,
	ChevronLeft,
	Plus,
	X,
	Video,
	VideoOff,
	Mic,
	MicOff,
	PhoneOff,
	Maximize2,
	Minimize2,
	Link2,
	Server,
	Monitor,
	MonitorUp,
	MonitorStop,
	Film,
	RefreshCw,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { API } from "../App";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "../components/ui/dialog";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const IMAGE_BASE = "https://image.tmdb.org/t/p/";

// Streaming sources for embedded players - ordered by reliability and minimal ads
const STREAMING_SOURCES = [
	{
		id: "vidsrcxyz",
		name: "VidSrc XYZ",
		getUrl: (type, id) => `https://vidsrc.xyz/embed/${type}/${id}`,
	},
	{
		id: "vidsrcto",
		name: "VidSrc TO",
		getUrl: (type, id) => `https://vidsrc.to/embed/${type}/${id}`,
	},
	{
		id: "vidsrcme",
		name: "VidSrc ME",
		getUrl: (type, id) => `https://vidsrc.me/embed/${type}/${id}`,
	},
	{
		id: "vidsrcpro",
		name: "VidSrc Pro",
		getUrl: (type, id) => `https://vidsrc.pro/embed/${type}/${id}`,
	},
	{
		id: "embedsu",
		name: "Embed.su",
		getUrl: (type, id) => `https://embed.su/embed/${type}/${id}`,
	},
	{
		id: "autoembed",
		name: "AutoEmbed",
		getUrl: (type, id) => `https://player.autoembed.cc/embed/${type}/${id}`,
	},
	{
		id: "vidsrcnl",
		name: "VidSrc NL",
		getUrl: (type, id) => `https://player.vidsrc.nl/embed/${type}/${id}`,
	},
	{
		id: "smashystream",
		name: "Smashy Stream",
		getUrl: (type, id) => `https://player.smashy.stream/${type}/${id}`,
	},
	{ id: "trailer", name: "Trailer Only", getUrl: () => null },
];

// WebRTC Configuration
const RTC_CONFIG = {
	iceServers: [
		{ urls: "stun:stun.l.google.com:19302" },
		{ urls: "stun:stun1.l.google.com:19302" },
	],
};

const extractYoutubeVideoId = (url) => {
	const patterns = [
		/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
		/^([a-zA-Z0-9_-]{11})$/,
	];

	for (const pattern of patterns) {
		const match = url.match(pattern);
		if (match && match[1]) {
			return match[1];
		}
	}
	return null;
};

let youtubeApiPromise = null;
const loadYoutubeIframeApi = () => {
	if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
	if (youtubeApiPromise) return youtubeApiPromise;

	youtubeApiPromise = new Promise((resolve) => {
		const previousCallback = window.onYouTubeIframeAPIReady;
		window.onYouTubeIframeAPIReady = () => {
			if (previousCallback) previousCallback();
			resolve(window.YT);
		};
		const script = document.createElement("script");
		script.src = "https://www.youtube.com/iframe_api";
		document.head.appendChild(script);
	});
	return youtubeApiPromise;
};

// Drag-to-reposition for a floating overlay (camera PiP, remote gallery)
// within a given container ref. Returns a px offset from the container's
// top-left (null = caller should use its own default CSS position) plus
// pointer handlers to spread onto the draggable element.
const useDraggableOverlay = (containerRef) => {
	const [offset, setOffset] = useState(null);
	const dragRef = useRef({ dragging: false });

	const onPointerDown = (e) => {
		const container = containerRef.current;
		const el = e.currentTarget;
		if (!container) return;

		const containerRect = container.getBoundingClientRect();
		const elRect = el.getBoundingClientRect();

		dragRef.current = {
			dragging: true,
			pointerId: e.pointerId,
			startClientX: e.clientX,
			startClientY: e.clientY,
			startLeft: elRect.left - containerRect.left,
			startTop: elRect.top - containerRect.top,
			elWidth: elRect.width,
			elHeight: elRect.height,
		};
		el.setPointerCapture(e.pointerId);
	};

	const onPointerMove = (e) => {
		const drag = dragRef.current;
		if (!drag.dragging) return;

		const container = containerRef.current;
		if (!container) return;

		const dx = e.clientX - drag.startClientX;
		const dy = e.clientY - drag.startClientY;

		const containerRect = container.getBoundingClientRect();
		const maxLeft = Math.max(0, containerRect.width - drag.elWidth);
		const maxTop = Math.max(0, containerRect.height - drag.elHeight);

		setOffset({
			x: Math.min(Math.max(0, drag.startLeft + dx), maxLeft),
			y: Math.min(Math.max(0, drag.startTop + dy), maxTop),
		});
	};

	const onPointerUp = (e) => {
		const drag = dragRef.current;
		try {
			e.currentTarget.releasePointerCapture(drag.pointerId ?? e.pointerId);
		} catch {
			// pointer capture may already be released (e.g. pointercancel)
		}
		dragRef.current = { dragging: false };
	};

	return { offset, setOffset, onPointerDown, onPointerMove, onPointerUp };
};

const WatchPartyPage = () => {
	const { roomId } = useParams();
	const navigate = useNavigate();
	const { user, getAuthHeaders } = useAuth();

	// Guest join state (for visitors without a Flixz account)
	const [guestSession, setGuestSession] = useState(() => {
		if (!roomId) return null;
		try {
			const stored = sessionStorage.getItem(`party_guest_${roomId}`);
			return stored ? JSON.parse(stored) : null;
		} catch {
			return null;
		}
	});
	const [guestNameInput, setGuestNameInput] = useState("");
	const [joiningAsGuest, setJoiningAsGuest] = useState(false);
	const [guestPromptParty, setGuestPromptParty] = useState(null);

	const identity = useMemo(() => {
		if (user) return { id: user.user_id, name: user.name, isGuest: false };
		if (guestSession)
			return { id: guestSession.user_id, name: guestSession.name, isGuest: true };
		return null;
	}, [user, guestSession]);

	// Party state
	const [parties, setParties] = useState([]);
	const [currentParty, setCurrentParty] = useState(null);
	const [movieDetails, setMovieDetails] = useState(null);
	const [messages, setMessages] = useState([]);
	const [newMessage, setNewMessage] = useState("");
	const [isPlaying, setIsPlaying] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [participants, setParticipants] = useState([]);
	const [loading, setLoading] = useState(true);

	// Create party state
	const [createDialogOpen, setCreateDialogOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [searchResults, setSearchResults] = useState([]);
	const [selectedMovie, setSelectedMovie] = useState(null);
	const [partyName, setPartyName] = useState("");
	const [createContentTab, setCreateContentTab] = useState("browse"); // "browse" | "youtube"
	const [youtubeUrlInput, setYoutubeUrlInput] = useState("");
	const [changeContentDialogOpen, setChangeContentDialogOpen] = useState(false);

	// Video call state
	const [isInCall, setIsInCall] = useState(false);
	const [localStream, setLocalStream] = useState(null);
	const [remoteStreams, setRemoteStreams] = useState({});
	const [isVideoEnabled, setIsVideoEnabled] = useState(true);
	const [isAudioEnabled, setIsAudioEnabled] = useState(true);
	const [isVideoFullscreen, setIsVideoFullscreen] = useState(false);
	const [isSharingScreen, setIsSharingScreen] = useState(false);
	const [screenStream, setScreenStream] = useState(null);
	// Screen sharing state (for main view)
	const [activeScreenShare, setActiveScreenShare] = useState(null); // { sid, name, stream }
	const [screenShareStreams, setScreenShareStreams] = useState({}); // Map of sid -> screen stream

	// Invite state
	const [inviteEmail, setInviteEmail] = useState("");
	const [inviteDialogOpen, setInviteDialogOpen] = useState(false);

	// Streaming source state
	const [selectedSource, setSelectedSource] = useState(STREAMING_SOURCES[0]);
	const [showSourcePicker, setShowSourcePicker] = useState(false);
	const [currentSourceIndex, setCurrentSourceIndex] = useState(0);

	// Mobile chat toggle
	const [isChatOpen, setIsChatOpen] = useState(false);

	// Refs
	const socketRef = useRef(null);
	const chatRef = useRef(null);
	const localVideoRef = useRef(null);
	const peerConnectionsRef = useRef({});
	const videoPlayerRef = useRef(null);
	const localStreamRef = useRef(null); // Keep stream in ref for stable access
	const pendingCandidatesRef = useRef({}); // Store ICE candidates before connection ready
	const playbackStartTimeRef = useRef(null); // Track when playback started
	const lastSyncTimeRef = useRef(0); // Track last manual sync to avoid duplicate broadcasts
	const isSyncingRef = useRef(false); // Prevent sync loops
	const youtubePlayerRef = useRef(null); // YT.Player instance for youtube-content parties
	const youtubeContainerRef = useRef(null);

	// Drag-to-reposition for the camera PiP and the remote-guest gallery, so
	// either can be moved off of whatever the underlying video player's own
	// controls happen to sit on. Both overlays sit at the same max z-index;
	// without this, if they ever geometrically overlap (e.g. a shorter
	// browser window, since the PiP anchors from the bottom and the gallery
	// from the top), the one later in the DOM silently eats every pointer
	// event in that region and the one underneath becomes unreachable.
	const pipDrag = useDraggableOverlay(videoPlayerRef);
	const galleryDrag = useDraggableOverlay(videoPlayerRef);
	// Always-current mirror of isPlaying/currentTime. The YouTube player is
	// created asynchronously (loading the IFrame API, then constructing
	// YT.Player), so a sync (initial_sync on join, playback_sync, etc.) can
	// arrive and update React state before the player exists. onReady must
	// read this ref rather than close over isPlaying/currentTime directly -
	// a closure captured when the player-creation effect ran would still be
	// holding whatever those values were at that moment, not the latest sync.
	const latestPlaybackRef = useRef({ isPlaying: false, currentTime: 0 });

	// Keep localStreamRef in sync with localStream state
	useEffect(() => {
		localStreamRef.current = localStream;
	}, [localStream]);

	useEffect(() => {
		latestPlaybackRef.current = { isPlaying, currentTime };
	}, [isPlaying, currentTime]);

	// WebRTC Functions - Fixed for two-way video
	const createPeerConnection = useCallback(
		async (peerId, createOffer = false) => {
			// Don't create duplicate connections
			if (peerConnectionsRef.current[peerId]) {
				console.log("⚠️ Peer connection already exists for:", peerId);
				return peerConnectionsRef.current[peerId];
			}

			console.log(
				"🔗 Creating peer connection for:",
				peerId,
				"createOffer:",
				createOffer
			);
			const pc = new RTCPeerConnection(RTC_CONFIG);
			peerConnectionsRef.current[peerId] = pc;

			// Add local tracks using ref for stable access
			const stream = localStreamRef.current;
			if (stream) {
				console.log("📹 Adding local tracks to peer connection");
				stream.getTracks().forEach((track) => {
					pc.addTrack(track, stream);
				});
			} else {
				console.warn(
					"⚠️ No local stream available when creating peer connection"
				);
			}

			// Handle ICE candidates
			pc.onicecandidate = (event) => {
				if (event.candidate) {
					console.log("🧊 Sending ICE candidate to:", peerId);
					socketRef.current?.emit("webrtc_ice_candidate", {
						target: peerId,
						candidate: event.candidate,
					});
				}
			};

			// Handle connection state changes
			pc.onconnectionstatechange = () => {
				console.log(`🔌 Connection state with ${peerId}:`, pc.connectionState);
				if (
					pc.connectionState === "failed" ||
					pc.connectionState === "disconnected"
				) {
					console.log("🔄 Connection failed/disconnected, cleaning up");
				}
			};

			// Handle ICE connection state
			pc.oniceconnectionstatechange = () => {
				console.log(`🧊 ICE state with ${peerId}:`, pc.iceConnectionState);
			};

			// Handle remote stream - THIS IS KEY FOR TWO-WAY VIDEO
			pc.ontrack = (event) => {
				console.log(
					"📺 Received remote track from:",
					peerId,
					"kind:",
					event.track.kind,
					"streams:",
					event.streams.length
				);

				// Get or create the remote stream for this peer
				setRemoteStreams((prev) => {
					let stream = prev[peerId];

					// If stream exists in event.streams, use it
					if (event.streams && event.streams[0]) {
						stream = event.streams[0];
					}
					// If no stream exists, create one and add the track
					else if (!stream) {
						stream = new MediaStream();
						stream.addTrack(event.track);
					}
					// If stream exists but track is not in it, add it
					else if (!stream.getTracks().find(t => t.id === event.track.id)) {
						stream.addTrack(event.track);
					}

					console.log("📺 Updated stream for", peerId, "- tracks:", stream.getTracks().length);

					return {
						...prev,
						[peerId]: stream,
					};
				});
			};

			// Process any pending ICE candidates
			if (pendingCandidatesRef.current[peerId]) {
				console.log("📥 Processing pending ICE candidates for:", peerId);
				for (const candidate of pendingCandidatesRef.current[peerId]) {
					await pc.addIceCandidate(new RTCIceCandidate(candidate));
				}
				delete pendingCandidatesRef.current[peerId];
			}

			if (createOffer) {
				try {
					console.log("📤 Creating offer for:", peerId);
					const offer = await pc.createOffer({
						offerToReceiveAudio: true,
						offerToReceiveVideo: true,
					});
					await pc.setLocalDescription(offer);
					socketRef.current?.emit("webrtc_offer", {
						target: peerId,
						offer: offer,
					});
					console.log("✅ Offer sent to:", peerId);
				} catch (err) {
					console.error("❌ Failed to create offer:", err);
				}
			}

			return pc;
		},
		[] // Remove localStream dependency - use ref instead
	);

	const handleOffer = useCallback(
		async (from, offer) => {
			console.log("📨 Processing offer from:", from);
			let pc = peerConnectionsRef.current[from];

			if (!pc) {
				pc = await createPeerConnection(from, false);
			}

			try {
				await pc.setRemoteDescription(new RTCSessionDescription(offer));
				console.log("📝 Set remote description from:", from);

				const answer = await pc.createAnswer();
				await pc.setLocalDescription(answer);

				socketRef.current?.emit("webrtc_answer", {
					target: from,
					answer: answer,
				});
				console.log("✅ Answer sent to:", from);
			} catch (err) {
				console.error("❌ Failed to handle offer:", err);
			}
		},
		[createPeerConnection]
	);

	const endCall = useCallback(() => {
		// Stop local stream
		if (localStream) {
			localStream.getTracks().forEach((track) => track.stop());
			setLocalStream(null);
		}

		// Stop screen share if active
		if (screenStream) {
			screenStream.getTracks().forEach((track) => track.stop());
			setScreenStream(null);
			setIsSharingScreen(false);
		}

		// Close peer connections
		Object.values(peerConnectionsRef.current).forEach((pc) => pc.close());
		peerConnectionsRef.current = {};

		// Clear remote streams
		setRemoteStreams({});
		setIsInCall(false);
		pipDrag.setOffset(null);
		galleryDrag.setOffset(null);

		// Notify server
		socketRef.current?.emit("webrtc_leave", { room_id: roomId });
	}, [localStream, screenStream, roomId, pipDrag, galleryDrag]);

	const fetchParties = useCallback(async () => {
		setLoading(true);
		try {
			const res = await axios.get(`${API}/watch-party`, {
				headers: getAuthHeaders(),
				withCredentials: true,
			});
			setParties(res.data.parties || []);
		} catch (error) {
			console.error("Failed to fetch parties:", error);
			toast.error("Failed to load watch parties");
		} finally {
			setLoading(false);
		}
	}, [getAuthHeaders]);

	// Public, unauthenticated preview so a visitor without an account can see
	// what party they're being asked to join before typing a name.
	const fetchPartyPreview = useCallback(async () => {
		setLoading(true);
		try {
			const res = await axios.get(`${API}/watch-party/${roomId}`);
			setGuestPromptParty(res.data);
		} catch (error) {
			console.error("Failed to load party preview:", error);
			if (error.response?.status === 404) {
				toast.error("Watch party not found. It may have been deleted.");
				navigate("/watch-party");
			}
		} finally {
			setLoading(false);
		}
	}, [roomId, navigate]);

	const joinAsGuest = async () => {
		if (!guestNameInput.trim()) {
			toast.error("Please enter your name");
			return;
		}
		setJoiningAsGuest(true);
		try {
			const res = await axios.post(`${API}/watch-party/${roomId}/guest-join`, {
				name: guestNameInput.trim(),
			});
			const session = { user_id: res.data.user_id, name: res.data.name };
			sessionStorage.setItem(`party_guest_${roomId}`, JSON.stringify(session));
			setGuestSession(session);
			setGuestPromptParty(null);
		} catch (error) {
			console.error("Guest join failed:", error);
			toast.error(error.response?.data?.detail || "Failed to join watch party");
		} finally {
			setJoiningAsGuest(false);
		}
	};

	const fetchPartyDetails = useCallback(async () => {
		setLoading(true);
		// Clear any lingering "authentication failed" toast from a previous
		// attempt so it can't sit on screen overlapping a fresh success toast.
		toast.dismiss();
		try {
			console.log("=== Starting Watch Party Load ===");
			console.log("Room ID:", roomId);
			console.log("Identity:", identity);

			if (user) {
				// Join party FIRST. This is the only step that actually requires a
				// valid (non-stale) token, and the room details fetch below is a
				// public endpoint that would succeed even with a dead session -
				// join-first means an invalid session bounces straight to login
				// instead of rendering the room and then yanking the user back.
				console.log("Step 1: Joining party...");
				const joinRes = await axios.post(
					`${API}/watch-party/${roomId}/join`,
					{},
					{
						headers: getAuthHeaders(),
						withCredentials: true,
					}
				);
				console.log("✅ Successfully joined party:", joinRes.data);
			}
			// Guests already joined via the name-prompt form (joinAsGuest), which
			// calls the unauthenticated /guest-join endpoint before guestSession
			// is set - nothing more to do here for them.

			// Get party details
			console.log("Step 2: Fetching party details...");
			const res = await axios.get(`${API}/watch-party/${roomId}`);
			console.log("✅ Party details loaded:", res.data);

			setCurrentParty(res.data);
			setParticipants(res.data.participants || []);
			setIsPlaying(res.data.is_playing);
			setCurrentTime(res.data.current_time);

			// Set current source if available
			if (res.data.current_source) {
				const sourceIndex = STREAMING_SOURCES.findIndex(
					(s) => s.id === res.data.current_source
				);
				if (sourceIndex !== -1) {
					console.log(
						"🎬 Setting initial source:",
						STREAMING_SOURCES[sourceIndex].name
					);
					setSelectedSource(STREAMING_SOURCES[sourceIndex]);
					setCurrentSourceIndex(sourceIndex);
				}
			}

			// Fetch movie details (skip for youtube parties - no TMDB record)
			if (res.data.media_type === "youtube") {
				setMovieDetails(null);
			} else {
				const endpoint = res.data.media_type === "movie" ? "movies" : "tv";
				console.log(
					`Step 3: Fetching ${endpoint} details for ID:`,
					res.data.movie_id
				);

				const movieRes = await axios.get(
					`${API}/${endpoint}/${res.data.movie_id}`
				);
				console.log(
					"✅ Movie details loaded:",
					movieRes.data.title || movieRes.data.name
				);
				setMovieDetails(movieRes.data);
			}

			toast.success("Joined watch party!");
		} catch (error) {
			console.error("❌ Failed to load watch party:", error);
			console.error("Error response:", error.response);
			console.error("Error status:", error.response?.status);
			console.error("Error data:", error.response?.data);

			if (error.response?.status === 404) {
				toast.error("Watch party not found. It may have been deleted.");
			} else if (error.response?.status === 401) {
				toast.error("Authentication failed. Please try logging in again.");
				navigate(
					"/login?redirect=" + encodeURIComponent(`/watch-party/${roomId}`)
				);
			} else if (error.response?.status === 403) {
				toast.error("You don't have permission to join this party");
			} else {
				toast.error(
					"Failed to load watch party: " +
						(error.response?.data?.detail || error.message)
				);
			}

			if (error.response?.status !== 401) {
				navigate("/watch-party");
			}
		} finally {
			setLoading(false);
		}
	}, [roomId, user, identity, getAuthHeaders, navigate]);

	const connectSocket = useCallback(() => {
		console.log("🔌 Connecting Socket.IO to:", BACKEND_URL);
		socketRef.current = io(BACKEND_URL, {
			transports: ["websocket", "polling"],
			reconnectionAttempts: 5,
			reconnectionDelay: 1000,
			withCredentials: true,
		});

		socketRef.current.on("connect", () => {
			console.log("✅ Socket connected! ID:", socketRef.current.id);
			socketRef.current.emit("join_room", {
				room_id: roomId,
				user_name: identity?.name || "Anonymous",
			});
		});

		socketRef.current.on("connect_error", (error) => {
			console.error("❌ Socket connection error:", error.message);
			toast.error("Failed to connect to watch party server");
		});

		socketRef.current.on("disconnect", (reason) => {
			console.log("🔌 Socket disconnected:", reason);
			if (reason === "io server disconnect") {
				socketRef.current.connect();
			}
		});

		socketRef.current.on("user_joined", (data) => {
			// Joining a room broadcasts to the whole room including the
			// joiner's own socket - skip that self-notification, the REST
			// fetch that ran just before connectSocket already has us listed.
			if (data.user_name === identity?.name) return;

			toast.success(`${data.user_name} joined the party`);
			setParticipants((prev) =>
				prev.some((p) => p.name === data.user_name)
					? prev
					: [...prev, { name: data.user_name }]
			);
		});

		socketRef.current.on("user_left", (data) => {
			toast.info(`${data.user_name} left the party`);
			setParticipants((prev) => prev.filter((p) => p.name !== data.user_name));
		});

		// Initial sync when joining - receive current playback state
		socketRef.current.on("initial_sync", (data) => {
			console.log("🎬 Received initial sync:", data);
			isSyncingRef.current = true;

			setIsPlaying(data.is_playing);
			setCurrentTime(data.current_time);

			if (data.is_playing) {
				playbackStartTimeRef.current = Date.now();
				toast.success("Synced to current playback position");
			}

			// Sync source if provided
			if (data.source) {
				const sourceIndex = STREAMING_SOURCES.findIndex(
					(s) => s.id === data.source
				);
				if (sourceIndex !== -1) {
					setSelectedSource(STREAMING_SOURCES[sourceIndex]);
					setCurrentSourceIndex(sourceIndex);
				}
			}

			setTimeout(() => {
				isSyncingRef.current = false;
			}, 500);
		});

		socketRef.current.on("playback_sync", (data) => {
			console.log("📺 Playback sync received:", data);

			// Set syncing flag to prevent sync loops
			isSyncingRef.current = true;

			// Calculate drift using state updater to avoid stale closure
			setCurrentTime((prevTime) => {
				setIsPlaying((prevPlaying) => {
					// Calculate drift if we're playing
					if (prevPlaying && data.is_playing) {
						const drift = Math.abs(prevTime - data.current_time);
						if (drift > 3) {
							console.log(`⏰ Drift detected: ${drift.toFixed(1)}s - correcting`);
							toast.info(
								`Syncing playback (${drift.toFixed(1)}s difference)`,
								{ duration: 2000 }
							);
						}
					}
					return data.is_playing;
				});

				// Reset playback start time when receiving sync
				if (data.is_playing) {
					playbackStartTimeRef.current = Date.now();
				} else {
					playbackStartTimeRef.current = null;
				}

				return data.current_time;
			});

			// Sync source if provided
			if (data.source) {
				const sourceIndex = STREAMING_SOURCES.findIndex(
					(s) => s.id === data.source
				);
				if (sourceIndex !== -1) {
					console.log(
						"🔄 Syncing to source:",
						STREAMING_SOURCES[sourceIndex].name
					);
					setSelectedSource(STREAMING_SOURCES[sourceIndex]);
					setCurrentSourceIndex(sourceIndex);
					toast.info(
						`Source changed to ${STREAMING_SOURCES[sourceIndex].name}`
					);
				}
			}

			// Show sync notification
			if (data.user_name && data.user_name !== identity?.name) {
				const action = data.is_playing
					? "▶️ resumed playback"
					: "⏸️ paused playback";
				toast.info(`${data.user_name} ${action}`, { duration: 2000 });
			}

			// Clear syncing flag after a short delay
			setTimeout(() => {
				isSyncingRef.current = false;
			}, 500);
		});

		// Host swapped what's playing (movie/TV <-> YouTube) mid-party
		socketRef.current.on("content_changed", async (data) => {
			console.log("🔀 Content changed:", data);
			isSyncingRef.current = true;

			setCurrentParty((prev) =>
				prev
					? {
							...prev,
							media_type: data.media_type,
							movie_id: data.movie_id,
							youtube_video_id: data.youtube_video_id,
					  }
					: prev
			);
			setIsPlaying(false);
			setCurrentTime(0);
			playbackStartTimeRef.current = null;

			if (data.media_type === "youtube") {
				setMovieDetails(null);
			} else if (data.movie_id) {
				try {
					const endpoint = data.media_type === "movie" ? "movies" : "tv";
					const res = await axios.get(`${API}/${endpoint}/${data.movie_id}`);
					setMovieDetails(res.data);
				} catch (err) {
					console.error("Failed to load new content details:", err);
				}
			}

			if (data.user_name && data.user_name !== identity?.name) {
				toast.info(`${data.user_name} changed what's playing`);
			}

			setTimeout(() => {
				isSyncingRef.current = false;
			}, 500);
		});

		// Position update event - continuous sync from host
		socketRef.current.on("position_update", (data) => {
			// Store data for drift correction check in a state updater
			setCurrentTime((prevTime) => {
				// Only sync if we're playing and drift is significant
				if (data.is_playing && !isSyncingRef.current) {
					const drift = Math.abs(prevTime - data.current_time);

					// Only correct if drift is significant (>2 seconds)
					if (drift > 2) {
						console.log(`🔄 Auto-correcting drift: ${drift.toFixed(1)}s`);
						isSyncingRef.current = true;
						playbackStartTimeRef.current = Date.now();
						setTimeout(() => {
							isSyncingRef.current = false;
						}, 500);
						return data.current_time;
					}
				}
				return prevTime;
			});
		});

		socketRef.current.on("new_message", (data) => {
			setMessages((prev) => [...prev, data]);
		});

		// WebRTC signaling events
		// Handle existing peers list when joining - NEW JOINER receives this
		// The NEW JOINER should NOT create offers - they wait for existing peers to send offers
		socketRef.current.on("webrtc_peers", async (data) => {
			console.log(
				"📋 Received existing peers list:",
				data.peers.length,
				"peers"
			);
			// Don't create offers here - existing peers will send us offers via webrtc_peer_joined
			// Just log that we're expecting offers from these peers
			for (const peer of data.peers) {
				console.log(
					"⏳ Expecting offer from existing peer:",
					peer.user_name,
					peer.sid
				);
			}
		});

		// Handle new peer joining - EXISTING PEERS create offers to the NEW PEER
		socketRef.current.on("webrtc_peer_joined", async (data) => {
			console.log("👋 New peer joined:", data.user_name, "sid:", data.sid);
			toast.info(`${data.user_name} joined the video call`);

			// If we're in a call, create an offer to the new peer so they can see us
			if (localStreamRef.current) {
				console.log("📤 Creating offer for new peer:", data.user_name);
				await createPeerConnection(data.sid, true); // true = create offer
			}
		});

		socketRef.current.on("webrtc_offer", async (data) => {
			console.log("📨 Received offer from:", data.from);
			await handleOffer(data.from, data.offer);
		});

		socketRef.current.on("webrtc_answer", async (data) => {
			console.log("✅ Received answer from:", data.from);
			const pc = peerConnectionsRef.current[data.from];
			if (pc) {
				await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
			}
		});

		// Handle peer leaving
		socketRef.current.on("webrtc_peer_left", (data) => {
			console.log("👋 Peer left:", data.sid);
			// Close and remove peer connection
			const pc = peerConnectionsRef.current[data.sid];
			if (pc) {
				pc.close();
				delete peerConnectionsRef.current[data.sid];
			}
			// Remove remote stream
			setRemoteStreams((prev) => {
				const updated = { ...prev };
				delete updated[data.sid];
				return updated;
			});
		});

		socketRef.current.on("webrtc_ice_candidate", async (data) => {
			const pc = peerConnectionsRef.current[data.from];
			if (pc && data.candidate) {
				try {
					await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
					console.log("🧊 Added ICE candidate from:", data.from);
				} catch (err) {
					console.error("❌ Failed to add ICE candidate:", err);
				}
			} else if (data.candidate) {
				// Store candidate for later if peer connection doesn't exist yet
				if (!pendingCandidatesRef.current[data.from]) {
					pendingCandidatesRef.current[data.from] = [];
				}
				pendingCandidatesRef.current[data.from].push(data.candidate);
				console.log("📦 Stored pending ICE candidate from:", data.from);
			}
		});

		socketRef.current.on("webrtc_media_toggle", (data) => {
			console.log("Media toggle:", data);
		});

		// Screen sharing events
		socketRef.current.on("screen_share_started", (data) => {
			console.log("🖥️ Screen sharing started by:", data.user_name, "sid:", data.sid);

			// Get the screen share stream from remoteStreams
			setActiveScreenShare({
				sid: data.sid,
				name: data.user_name,
			});

			toast.info(`${data.user_name} is now sharing their screen`, { duration: 3000 });
		});

		socketRef.current.on("screen_share_stopped", (data) => {
			console.log("🖥️ Screen sharing stopped by:", data.user_name);

			setActiveScreenShare(null);
			toast.info(`${data.user_name} stopped sharing their screen`);
		});

		socketRef.current.on("party_deleted", (data) => {
			console.log("🗑️ Party deleted by host");
			toast.error(`Watch party ended by ${data.user_name}`);
			setTimeout(() => {
				navigate("/watch-party");
			}, 2000);
		});

		socketRef.current.on("disconnect", () => {
			console.log("Disconnected from socket");
		});
	}, [roomId, identity, createPeerConnection, handleOffer, navigate]);

	useEffect(() => {
		if (!roomId) {
			fetchParties();
			return;
		}

		if (!identity) {
			// No account and no guest session yet - show a name-entry prompt
			// instead of joining/connecting.
			fetchPartyPreview();
			return;
		}

		fetchPartyDetails();
		connectSocket();

		return () => {
			if (socketRef.current) {
				socketRef.current.disconnect();
			}
			endCall();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [roomId, identity?.id]);

	useEffect(() => {
		if (chatRef.current) {
			chatRef.current.scrollTop = chatRef.current.scrollHeight;
		}
	}, [messages]);

	// Update local video element when stream changes
	useEffect(() => {
		const videoElement = localVideoRef.current;

		if (videoElement && localStream && isInCall) {
			// Only set if it's different to avoid interrupting playback
			if (videoElement.srcObject !== localStream) {
				videoElement.srcObject = localStream;
			}
		}

		return () => {
			// Only clean up when call ends
			if (videoElement && !isInCall) {
				videoElement.srcObject = null;
			}
		};
	}, [localStream, isInCall]);

	// Continuous position tracking - broadcasts position every 2 seconds when playing
	useEffect(() => {
		if (!isPlaying || !socketRef.current || !currentParty || isSyncingRef.current) {
			playbackStartTimeRef.current = null;
			return;
		}

		// Set the start time when playback begins
		if (!playbackStartTimeRef.current) {
			playbackStartTimeRef.current = Date.now();
		}

		const interval = setInterval(() => {
			// Calculate elapsed time since playback started
			const elapsedSeconds =
				(Date.now() - playbackStartTimeRef.current) / 1000;
			const estimatedTime = currentTime + elapsedSeconds;

			// Only broadcast if we're the host (to reduce network traffic)
			// Other participants will sync to the host's broadcasts
			const isHost =
				!!identity &&
				!identity.isGuest &&
				(currentParty?.host_id === identity.id ||
					currentParty?.host_name === identity.name);

			if (isHost && socketRef.current) {
				socketRef.current.emit("position_update", {
					room_id: roomId,
					current_time: estimatedTime,
					is_playing: true,
					user_name: identity?.name,
				});
			}
		}, 2000); // Broadcast every 2 seconds

		return () => clearInterval(interval);
	}, [isPlaying, currentTime, roomId, currentParty, identity]);

	// Seek detection - detects when user seeks and broadcasts the new position
	useEffect(() => {
		// Skip if we're currently syncing from remote
		if (isSyncingRef.current) return;

		const now = Date.now();
		// Avoid duplicate broadcasts within 1 second
		if (now - lastSyncTimeRef.current < 1000) return;

		// If currentTime changed significantly and we have a start time, it might be a seek
		if (playbackStartTimeRef.current && isPlaying) {
			const elapsedSeconds =
				(now - playbackStartTimeRef.current) / 1000;
			const expectedTime = currentTime;
			const actualElapsedTime = elapsedSeconds;

			// If difference > 3 seconds, likely a seek event
			if (Math.abs(actualElapsedTime - expectedTime) > 3) {
				console.log("🔍 Seek detected, broadcasting new position");
				socketRef.current?.emit("sync_playback", {
					room_id: roomId,
					is_playing: isPlaying,
					current_time: currentTime,
					user_name: identity?.name,
				});
				lastSyncTimeRef.current = now;
				playbackStartTimeRef.current = now; // Reset the start time
			}
		}
	}, [currentTime, isPlaying, roomId, identity]);

	const startCall = async () => {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				video: {
					width: { ideal: 1280 },
					height: { ideal: 720 },
				},
				audio: true,
			});

			// IMPORTANT: Set ref immediately before state (ref is synchronous)
			localStreamRef.current = stream;
			setLocalStream(stream);
			setIsInCall(true);

			// Small delay to ensure state is propagated
			await new Promise((resolve) => setTimeout(resolve, 100));

			// Join WebRTC room
			socketRef.current?.emit("webrtc_join", {
				room_id: roomId,
				user_id: identity?.id,
				user_name: identity?.name,
			});

			toast.success("Joined video call!");
		} catch (error) {
			console.error("❌ Failed to start call:", error);

			// More detailed error messages
			if (error.name === "NotAllowedError") {
				toast.error(
					"Camera/microphone access denied. Please allow permissions in your browser."
				);
			} else if (error.name === "NotFoundError") {
				toast.error("No camera or microphone found. Please connect a device.");
			} else if (error.name === "NotReadableError") {
				toast.error("Camera or microphone is already in use by another app.");
			} else {
				toast.error("Failed to access camera/microphone: " + error.message);
			}
		}
	};

	const toggleVideo = () => {
		if (localStream) {
			const videoTrack = localStream.getVideoTracks()[0];
			if (videoTrack) {
				videoTrack.enabled = !videoTrack.enabled;
				setIsVideoEnabled(videoTrack.enabled);
				socketRef.current?.emit("webrtc_toggle_media", {
					room_id: roomId,
					type: "video",
					enabled: videoTrack.enabled,
				});
			}
		}
	};

	const toggleAudio = () => {
		if (localStream) {
			const audioTrack = localStream.getAudioTracks()[0];
			if (audioTrack) {
				audioTrack.enabled = !audioTrack.enabled;
				setIsAudioEnabled(audioTrack.enabled);
				socketRef.current?.emit("webrtc_toggle_media", {
					room_id: roomId,
					type: "audio",
					enabled: audioTrack.enabled,
				});
			}
		}
	};

	const startScreenShare = async () => {
		try {
			const stream = await navigator.mediaDevices.getDisplayMedia({
				video: {
					cursor: "always",
					displaySurface: "monitor"
				},
				audio: {
					echoCancellation: true,
					noiseSuppression: true,
					sampleRate: 44100
				}
			});

			setScreenStream(stream);
			setIsSharingScreen(true);

			// Notify all participants that I'm sharing screen
			socketRef.current?.emit("screen_share_started", {
				room_id: roomId,
				user_name: identity?.name,
			});

			// Replace video track in all peer connections
			const videoTrack = stream.getVideoTracks()[0];
			const audioTracks = stream.getAudioTracks();

			Object.values(peerConnectionsRef.current).forEach((pc) => {
				// Replace video track
				const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
				if (videoSender && videoTrack) {
					videoSender.replaceTrack(videoTrack);
				}

				// Add audio tracks from screen share (system audio)
				// Note: We add rather than replace to allow both mic and system audio
				audioTracks.forEach((audioTrack) => {
					// Check if we already have this track to avoid duplicates
					const existingSender = pc.getSenders().find(
						s => s.track === audioTrack
					);
					if (!existingSender) {
						pc.addTrack(audioTrack, stream);
					}
				});
			});

			// Handle screen share stop
			videoTrack.onended = () => {
				stopScreenShare();
			};

			toast.success("You are now sharing your screen. Others see your screen in full view.");
		} catch (error) {
			console.error("Failed to start screen share:", error);
			if (error.name === "NotAllowedError") {
				toast.error("Screen sharing permission denied");
			} else {
				toast.error("Failed to start screen sharing");
			}
		}
	};

	const stopScreenShare = () => {
		if (screenStream) {
			screenStream.getTracks().forEach(track => track.stop());
			setScreenStream(null);
		}
		setIsSharingScreen(false);

		// Notify all participants that screen sharing stopped
		socketRef.current?.emit("screen_share_stopped", {
			room_id: roomId,
			user_name: identity?.name,
		});

		// Restore camera video track and remove screen share audio tracks
		if (localStream) {
			const videoTrack = localStream.getVideoTracks()[0];

			Object.values(peerConnectionsRef.current).forEach((pc) => {
				// Restore camera video track
				const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
				if (videoSender && videoTrack) {
					videoSender.replaceTrack(videoTrack);
				}

				// Remove screen share audio tracks (keep only mic audio from localStream)
				if (screenStream) {
					const screenAudioTracks = screenStream.getAudioTracks();
					screenAudioTracks.forEach((screenAudioTrack) => {
						const sender = pc.getSenders().find(s => s.track === screenAudioTrack);
						if (sender) {
							pc.removeTrack(sender);
						}
					});
				}
			});
		}

		toast.info("Screen sharing stopped");
	};

	const toggleFullscreen = async () => {
		if (!videoPlayerRef.current) return;

		try {
			if (!document.fullscreenElement) {
				// Enter fullscreen
				await videoPlayerRef.current.requestFullscreen();
				setIsVideoFullscreen(true);
			} else {
				// Exit fullscreen
				await document.exitFullscreen();
				setIsVideoFullscreen(false);
			}
		} catch (error) {
			console.error("Fullscreen error:", error);
			toast.error("Failed to toggle fullscreen");
		}
	};

	// Listen for fullscreen changes
	useEffect(() => {
		const handleFullscreenChange = () => {
			setIsVideoFullscreen(!!document.fullscreenElement);
			// The video container's size changes drastically on fullscreen
			// enter/exit - a dragged pixel position from one no longer means
			// anything in the other, so fall back to the safe default corner.
			pipDrag.setOffset(null);
			galleryDrag.setOffset(null);
		};

		document.addEventListener("fullscreenchange", handleFullscreenChange);
		return () => {
			document.removeEventListener("fullscreenchange", handleFullscreenChange);
		};
		// pipDrag.setOffset/galleryDrag.setOffset are stable useState setters
		// (same guarantee as any other setState function) even though the
		// wrapping pipDrag/galleryDrag object is a new reference each render
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Set up the YouTube IFrame Player for youtube-content parties. Unlike the
	// vidsrc-style embeds (opaque third-party iframes with no control API),
	// YouTube's own player exposes real JS control, so this is the one content
	// type that gets true enforced sync rather than an advisory toast.
	useEffect(() => {
		if (currentParty?.media_type !== "youtube" || !currentParty?.youtube_video_id) {
			return;
		}

		let cancelled = false;

		loadYoutubeIframeApi().then((YT) => {
			if (cancelled || !youtubeContainerRef.current) return;

			// Always (re)create against the current container node - React may
			// have remounted it (e.g. toggling screen share), which would orphan
			// any previous YT.Player instance still bound to the old node.
			if (youtubePlayerRef.current?.destroy) {
				youtubePlayerRef.current.destroy();
				youtubePlayerRef.current = null;
			}

			youtubePlayerRef.current = new YT.Player(youtubeContainerRef.current, {
				// Without explicit width/height, the API defaults to its native
				// 640x360 iframe box instead of filling the responsive container -
				// on a narrower viewport that overflows the layout and throws off
				// everything positioned relative to the video area on top of it.
				width: "100%",
				height: "100%",
				videoId: currentParty.youtube_video_id,
				playerVars: { autoplay: 0, controls: 1, rel: 0 },
				events: {
					onReady: (event) => {
						// The width/height passed to YT.Player() above become HTML
						// attributes, which a flex layout can still let the iframe's
						// own content size push through to (a flex item's default
						// min-width:auto refuses to shrink below content size) -
						// pulling the iframe out of flow with position:absolute is
						// what actually guarantees it can never widen its container.
						const iframeEl = event.target.getIframe?.();
						if (iframeEl) {
							iframeEl.style.position = "absolute";
							iframeEl.style.inset = "0";
							iframeEl.style.width = "100%";
							iframeEl.style.height = "100%";
						}

						// Read the ref, not the closured currentTime/isPlaying - a
						// sync can have arrived and updated state after this
						// effect started (the player takes a moment to load) but
						// before onReady actually fires, and closing over the
						// effect's own render would miss it.
						const { isPlaying: latestIsPlaying, currentTime: latestTime } =
							latestPlaybackRef.current;
						if (latestTime) event.target.seekTo(latestTime, true);
						if (latestIsPlaying) event.target.playVideo();
					},
					onStateChange: (event) => {
						// Ignore state changes we caused ourselves via a remote sync
						if (isSyncingRef.current) return;

						if (event.data === window.YT.PlayerState.PLAYING) {
							const time = event.target.getCurrentTime();
							lastSyncTimeRef.current = Date.now();
							playbackStartTimeRef.current = Date.now();
							setIsPlaying(true);
							setCurrentTime(time);
							socketRef.current?.emit("sync_playback", {
								room_id: roomId,
								is_playing: true,
								current_time: time,
								user_name: identity?.name,
							});
						} else if (event.data === window.YT.PlayerState.PAUSED) {
							const time = event.target.getCurrentTime();
							lastSyncTimeRef.current = Date.now();
							playbackStartTimeRef.current = null;
							setIsPlaying(false);
							setCurrentTime(time);
							socketRef.current?.emit("sync_playback", {
								room_id: roomId,
								is_playing: false,
								current_time: time,
								user_name: identity?.name,
							});
						}
					},
				},
			});
		});

		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [currentParty?.media_type, currentParty?.youtube_video_id, isSharingScreen]);

	// Drive the YouTube player from isPlaying, regardless of what triggered the
	// change (manual header button, or a playback_sync/initial_sync from a peer)
	useEffect(() => {
		if (currentParty?.media_type !== "youtube") return;
		const player = youtubePlayerRef.current;
		if (!player || typeof player.playVideo !== "function") return;
		if (isPlaying) {
			player.playVideo();
		} else {
			player.pauseVideo();
		}
	}, [isPlaying, currentParty?.media_type]);

	// Correct drift by seeking the YouTube player when a remote sync moved
	// currentTime meaningfully out from under the local player's position.
	useEffect(() => {
		if (currentParty?.media_type !== "youtube" || !isSyncingRef.current) return;
		const player = youtubePlayerRef.current;
		if (!player || typeof player.seekTo !== "function") return;
		const playerTime = player.getCurrentTime?.() ?? 0;
		if (Math.abs(playerTime - currentTime) > 1.5) {
			player.seekTo(currentTime, true);
		}
	}, [currentTime, currentParty?.media_type]);

	// Tear down the YouTube player when leaving a youtube party / unmounting
	useEffect(() => {
		return () => {
			if (youtubePlayerRef.current?.destroy) {
				youtubePlayerRef.current.destroy();
			}
			youtubePlayerRef.current = null;
		};
	}, [roomId]);

	const searchMovies = async () => {
		if (!searchQuery.trim()) return;
		try {
			const res = await axios.get(
				`${API}/search/multi?query=${encodeURIComponent(searchQuery)}`
			);
			setSearchResults(
				res.data.results?.filter(
					(r) => r.media_type === "movie" || r.media_type === "tv"
				) || []
			);
		} catch (error) {
			console.error("Search failed:", error);
		}
	};

	const createParty = async () => {
		const isYoutube = createContentTab === "youtube";

		if (!partyName.trim()) {
			toast.error("Please enter a party name");
			return;
		}
		if (isYoutube && !youtubeUrlInput.trim()) {
			toast.error("Please paste a YouTube link or video ID");
			return;
		}
		if (!isYoutube && !selectedMovie) {
			toast.error("Please select a movie or show");
			return;
		}

		let payload;
		if (isYoutube) {
			const videoId = extractYoutubeVideoId(youtubeUrlInput.trim());
			if (!videoId) {
				toast.error("Invalid YouTube URL. Paste a link or an 11-character video ID");
				return;
			}
			payload = {
				name: partyName,
				media_type: "youtube",
				youtube_video_id: videoId,
			};
		} else {
			payload = {
				name: partyName,
				movie_id: selectedMovie.id,
				media_type: selectedMovie.media_type || "movie",
			};
		}

		try {
			console.log("Creating party with:", payload);

			const res = await axios.post(`${API}/watch-party`, payload, {
				headers: getAuthHeaders(),
				withCredentials: true,
			});

			console.log("Party created:", res.data);
			toast.success("Watch party created!");
			setCreateDialogOpen(false);
			navigate(`/watch-party/${res.data.room_id}`);
		} catch (error) {
			console.error("Failed to create party:", error);
			console.error("Error response:", error.response?.data);
			console.error("Error status:", error.response?.status);
			const errorMsg =
				error.response?.data?.detail ||
				error.message ||
				"Failed to create watch party";
			toast.error(errorMsg);
		}
	};

	const togglePlayback = () => {
		const newState = !isPlaying;
		setIsPlaying(newState);

		// Reset or set playback start time
		if (newState) {
			playbackStartTimeRef.current = Date.now();
		} else {
			playbackStartTimeRef.current = null;
		}

		lastSyncTimeRef.current = Date.now();
		socketRef.current?.emit("sync_playback", {
			room_id: roomId,
			is_playing: newState,
			current_time: currentTime,
			user_name: identity?.name,
		});
		toast.success(newState ? "▶️ Resumed playback" : "⏸️ Paused playback");
	};

	const sendMessage = (e) => {
		e.preventDefault();
		if (!newMessage.trim()) return;

		socketRef.current?.emit("chat_message", {
			room_id: roomId,
			message: newMessage,
			user_name: identity?.name || "Anonymous",
		});
		setNewMessage("");
	};

	const copyRoomLink = () => {
		const link = `${window.location.origin}/watch-party/${roomId}`;
		navigator.clipboard.writeText(link);
		toast.success("Room link copied! Share with friends 🎉");
	};

	const shareToSocial = (platform) => {
		const link = `${window.location.origin}/watch-party/${roomId}`;
		const whatWereWatching =
			movieDetails?.title ||
			movieDetails?.name ||
			(currentParty?.media_type === "youtube" ? "a YouTube video" : "something");
		const text = `Join my watch party on Flixzbox! We're watching ${whatWereWatching}`;

		const urls = {
			whatsapp: `https://wa.me/?text=${encodeURIComponent(text + " " + link)}`,
			twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(
				text
			)}&url=${encodeURIComponent(link)}`,
			telegram: `https://t.me/share/url?url=${encodeURIComponent(
				link
			)}&text=${encodeURIComponent(text)}`,
		};

		window.open(urls[platform], "_blank");
	};

	const sendInvite = async () => {
		if (!inviteEmail.trim()) {
			toast.error("Please enter an email");
			return;
		}

		try {
			const response = await axios.post(
				`${API}/notifications/invite?room_id=${roomId}&invitee_email=${encodeURIComponent(
					inviteEmail
				)}`,
				{},
				{
					headers: getAuthHeaders(),
					withCredentials: true,
				}
			);

			// Handle different response types
			if (response.data.status === "pending" || !response.data.user_exists) {
				// User doesn't exist - show info message
				toast.info(
					response.data.message ||
						"User not registered. Share the link with them!"
				);
			} else {
				// User exists - notification sent
				toast.success("Invitation sent!");
			}

			setInviteEmail("");
			setInviteDialogOpen(false);
		} catch (error) {
			console.error("Invite error:", error);
			toast.error(error.response?.data?.detail || "Failed to send invitation");
		}
	};

	const deleteParty = async () => {
		if (
			!window.confirm(
				"Are you sure you want to end this watch party? All participants will be disconnected."
			)
		) {
			return;
		}

		try {
			await axios.delete(`${API}/watch-party/${roomId}`, {
				headers: getAuthHeaders(),
				withCredentials: true,
			});

			// Notify all participants via socket
			socketRef.current?.emit("delete_party", {
				room_id: roomId,
				user_name: identity?.name,
			});

			toast.success("Watch party ended");
			navigate("/watch-party");
		} catch (error) {
			console.error("Delete party error:", error);
			toast.error(
				error.response?.data?.detail || "Failed to delete watch party"
			);
		}
	};

	const getTrailerUrl = () => {
		const videos = movieDetails?.videos?.results || [];
		const trailer = videos.find(
			(v) => v.type === "Trailer" && v.site === "YouTube"
		);
		return trailer?.key;
	};

	const getStreamingUrl = () => {
		if (currentParty?.media_type === "youtube") {
			return null; // YouTube parties render via the IFrame Player API, not this embed
		}
		if (selectedSource.id === "trailer") {
			return null; // Will show trailer
		}

		const mediaType = currentParty?.media_type || "movie";
		const movieId = currentParty?.movie_id;

		if (!movieId) return null;

		return selectedSource.getUrl(mediaType, movieId);
	};

	const tryNextSource = () => {
		const nextIndex = (currentSourceIndex + 1) % (STREAMING_SOURCES.length - 1); // Skip "Trailer Only"
		setCurrentSourceIndex(nextIndex);
		setSelectedSource(STREAMING_SOURCES[nextIndex]);

		// Sync source change with other participants
		socketRef.current?.emit("sync_playback", {
			room_id: roomId,
			is_playing: isPlaying,
			current_time: currentTime,
			source: STREAMING_SOURCES[nextIndex].id,
			user_name: identity?.name,
		});

		toast.success(`Switched to ${STREAMING_SOURCES[nextIndex].name}`);
	};

	const changeSource = (source, index) => {
		setSelectedSource(source);
		setCurrentSourceIndex(
			index !== undefined
				? index
				: STREAMING_SOURCES.findIndex((s) => s.id === source.id)
		);
		setShowSourcePicker(false);

		// Sync source change with other participants
		socketRef.current?.emit("sync_playback", {
			room_id: roomId,
			is_playing: isPlaying,
			current_time: currentTime,
			source: source.id,
			user_name: identity?.name,
		});

		toast.success(`Switched to ${source.name}`);
	};

	const submitContentChange = () => {
		const isYoutube = createContentTab === "youtube";

		if (isYoutube) {
			const videoId = extractYoutubeVideoId(youtubeUrlInput.trim());
			if (!videoId) {
				toast.error("Invalid YouTube URL. Paste a link or an 11-character video ID");
				return;
			}
			socketRef.current?.emit("content_change", {
				room_id: roomId,
				media_type: "youtube",
				movie_id: null,
				youtube_video_id: videoId,
				user_name: identity?.name,
			});
		} else {
			if (!selectedMovie) {
				toast.error("Please select a movie or show");
				return;
			}
			socketRef.current?.emit("content_change", {
				room_id: roomId,
				media_type: selectedMovie.media_type || "movie",
				movie_id: selectedMovie.id,
				youtube_video_id: null,
				user_name: identity?.name,
			});
		}

		setChangeContentDialogOpen(false);
		setYoutubeUrlInput("");
		setSelectedMovie(null);
		setSearchResults([]);
		setSearchQuery("");
	};

	// List view
	if (!roomId) {
		return (
			<div
				className="min-h-screen bg-[#050505] pb-20 md:pb-8"
				data-testid="watch-party-list">
				<div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-12 pt-6 md:pt-8">
					<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 md:mb-8">
						<div>
							<h1 className="text-2xl md:text-3xl lg:text-4xl font-bold">
								Watch Party
							</h1>
							<p className="text-sm md:text-base text-[#A1A1AA] mt-1 md:mt-2">
								Watch movies together with friends
							</p>
						</div>

						<Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
							<DialogTrigger asChild>
								<Button
									data-testid="create-party-btn"
									className="btn-primary flex items-center gap-2 w-full sm:w-auto">
									<Plus className="w-4 h-4 md:w-5 md:h-5" />
									Create Party
								</Button>
							</DialogTrigger>
							<DialogContent className="bg-[#0A0A0A] border-white/10 max-w-lg mx-4">
								<DialogHeader>
									<DialogTitle className="text-lg md:text-xl">
										Create Watch Party
									</DialogTitle>
								</DialogHeader>
								<div className="space-y-4 mt-4">
									<Input
										placeholder="Party name..."
										value={partyName}
										onChange={(e) => setPartyName(e.target.value)}
										data-testid="party-name-input"
										className="bg-black/50 border-white/10 text-sm md:text-base"
									/>

									<div className="flex gap-2 p-1 bg-white/5 rounded-lg">
										<button
											type="button"
											onClick={() => setCreateContentTab("browse")}
											data-testid="tab-movies-tv"
											className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
												createContentTab === "browse"
													? "bg-[#7C3AED] text-white"
													: "text-[#A1A1AA] hover:text-white"
											}`}>
											Movies & TV
										</button>
										<button
											type="button"
											onClick={() => setCreateContentTab("youtube")}
											data-testid="tab-youtube"
											className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
												createContentTab === "youtube"
													? "bg-[#7C3AED] text-white"
													: "text-[#A1A1AA] hover:text-white"
											}`}>
											YouTube
										</button>
									</div>

									{createContentTab === "youtube" ? (
										<Input
											placeholder="Paste a YouTube link or video ID..."
											value={youtubeUrlInput}
											onChange={(e) => setYoutubeUrlInput(e.target.value)}
											onKeyDown={(e) => e.key === "Enter" && createParty()}
											data-testid="youtube-url-input"
											className="bg-black/50 border-white/10 text-sm md:text-base"
										/>
									) : (
										<>
											<div className="flex flex-col sm:flex-row gap-2">
												<Input
													placeholder="Search for a movie or show..."
													value={searchQuery}
													onChange={(e) => setSearchQuery(e.target.value)}
													onKeyDown={(e) => e.key === "Enter" && searchMovies()}
													data-testid="movie-search-input"
													className="bg-black/50 border-white/10 text-sm md:text-base"
												/>
												<Button
													onClick={searchMovies}
													variant="secondary"
													className="sm:flex-shrink-0">
													Search
												</Button>
											</div>

											{searchResults.length > 0 && (
												<div className="max-h-60 overflow-y-auto space-y-2">
													{searchResults.slice(0, 5).map((item) => (
														<div
															key={item.id}
															onClick={() => setSelectedMovie(item)}
															data-testid={`search-result-${item.id}`}
															className={`flex items-center gap-2 md:gap-3 p-2 rounded-lg cursor-pointer transition-all ${
																selectedMovie?.id === item.id
																	? "bg-[#7C3AED]/20 border border-[#7C3AED]"
																	: "bg-white/5 hover:bg-white/10"
															}`}>
															{item.poster_path && (
																<img
																	src={`${IMAGE_BASE}w92${item.poster_path}`}
																	alt={item.title || item.name}
																	className="w-10 h-14 md:w-12 md:h-16 object-cover rounded flex-shrink-0"
																/>
															)}
															<div className="flex-1 min-w-0">
																<p className="font-medium text-sm md:text-base truncate">
																	{item.title || item.name}
																</p>
																<p className="text-xs md:text-sm text-[#A1A1AA]">
																	{
																		(
																			item.release_date || item.first_air_date
																		)?.split("-")[0]
																	}{" "}
																	• {item.media_type === "tv" ? "TV Show" : "Movie"}
																</p>
															</div>
														</div>
													))}
												</div>
											)}
										</>
									)}

									<Button
										onClick={createParty}
										disabled={
											!partyName.trim() ||
											(createContentTab === "youtube"
												? !youtubeUrlInput.trim()
												: !selectedMovie)
										}
										data-testid="confirm-create-party"
										className="w-full btn-primary">
										Create Party
									</Button>
								</div>
							</DialogContent>
						</Dialog>
					</div>

					{loading ? (
						<div className="flex justify-center py-12 md:py-20">
							<div className="w-10 h-10 md:w-12 md:h-12 border-4 border-[#7C3AED] border-t-transparent rounded-full animate-spin" />
						</div>
					) : parties.length > 0 ? (
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
							{parties.map((party) => (
								<div
									key={party.room_id}
									onClick={() => navigate(`/watch-party/${party.room_id}`)}
									data-testid={`party-card-${party.room_id}`}
									className="glass rounded-xl p-4 md:p-6 cursor-pointer hover:bg-white/5 transition-all group active:scale-95">
									<div className="flex items-start justify-between mb-3 md:mb-4">
										<div className="flex-1 min-w-0 pr-2">
											<h3 className="font-semibold text-base md:text-lg group-hover:text-[#7C3AED] transition-colors truncate">
												{party.name}
											</h3>
											<p className="text-xs md:text-sm text-[#A1A1AA] truncate">
												Hosted by {party.host_name}
											</p>
										</div>
										<div className="flex items-center gap-1 text-[#A1A1AA] flex-shrink-0">
											<Users className="w-3 h-3 md:w-4 md:h-4" />
											<span className="text-xs md:text-sm">
												{party.participants?.length || 1}
											</span>
										</div>
									</div>
									<div className="flex items-center gap-2">
										<span
											className={`w-2 h-2 rounded-full ${
												party.is_playing ? "bg-[#10B981]" : "bg-[#F59E0B]"
											}`}
										/>
										<span className="text-xs md:text-sm text-[#A1A1AA]">
											{party.is_playing ? "Playing" : "Paused"}
										</span>
									</div>
								</div>
							))}
						</div>
					) : (
						<div className="text-center py-12 md:py-20 px-4">
							<Users className="w-12 h-12 md:w-16 md:h-16 text-[#52525B] mx-auto mb-4" />
							<h3 className="text-lg md:text-xl font-semibold mb-2">
								No watch parties yet
							</h3>
							<p className="text-sm md:text-base text-[#A1A1AA] mb-4">
								You haven't created or joined any watch parties yet
							</p>
							<p className="text-xs md:text-sm text-[#52525B]">
								Create a party or ask a friend to send you an invite link
							</p>
						</div>
					)}
				</div>
			</div>
		);
	}

	// Guest name prompt - shown to anyone without an account or existing guest
	// session before they can join the room, no login required.
	if (roomId && !identity) {
		return (
			<div className="min-h-screen bg-[#050505] flex items-center justify-center px-4">
				{loading ? (
					<div className="w-12 h-12 border-4 border-[#7C3AED] border-t-transparent rounded-full animate-spin" />
				) : (
					<div className="glass rounded-xl p-6 md:p-8 max-w-sm w-full text-center">
						<Users className="w-10 h-10 text-[#7C3AED] mx-auto mb-4" />
						<h2 className="text-xl font-bold mb-1">
							{guestPromptParty
								? `Join "${guestPromptParty.name}"`
								: "Join this watch party"}
						</h2>
						{guestPromptParty?.host_name && (
							<p className="text-sm text-[#A1A1AA] mb-4">
								Hosted by {guestPromptParty.host_name}
							</p>
						)}
						<Input
							autoFocus
							placeholder="Your name..."
							value={guestNameInput}
							onChange={(e) => setGuestNameInput(e.target.value)}
							onKeyDown={(e) => e.key === "Enter" && joinAsGuest()}
							data-testid="guest-name-input"
							className="bg-black/50 border-white/10 text-center mb-3"
						/>
						<Button
							onClick={joinAsGuest}
							disabled={joiningAsGuest || !guestNameInput.trim()}
							data-testid="guest-join-btn"
							className="w-full btn-primary">
							{joiningAsGuest ? "Joining..." : "Join Party"}
						</Button>
						<p className="text-xs text-[#52525B] mt-4">
							No account needed. Already have one?{" "}
							<button
								onClick={() =>
									navigate(
										"/login?redirect=" +
											encodeURIComponent(`/watch-party/${roomId}`)
									)
								}
								className="text-[#7C3AED] hover:underline">
								Log in
							</button>
						</p>
					</div>
				)}
			</div>
		);
	}

	// Room view
	if (loading) {
		return (
			<div className="min-h-screen bg-[#050505] flex items-center justify-center">
				<div className="w-12 h-12 border-4 border-[#7C3AED] border-t-transparent rounded-full animate-spin" />
			</div>
		);
	}

	const trailerKey = getTrailerUrl();
	const streamingUrl = getStreamingUrl();
	const title =
		movieDetails?.title ||
		movieDetails?.name ||
		(currentParty?.media_type === "youtube" ? "YouTube video" : undefined);
	const remoteStreamEntries = Object.entries(remoteStreams);

	// Filter out the screen sharer from small video panels when viewing their screen
	const filteredRemoteStreams = activeScreenShare && !isSharingScreen
		? remoteStreamEntries.filter(([peerId]) => peerId !== activeScreenShare.sid)
		: remoteStreamEntries;

	const showEmbeddedPlayer = streamingUrl && selectedSource.id !== "trailer";
	const isCreator =
		!!identity &&
		!identity.isGuest &&
		(currentParty?.host_id === identity.id ||
			currentParty?.host_name === identity.name);

	return (
		<div
			className="w-full bg-[#050505] pb-16 md:pb-0 flex"
			data-testid="watch-party-room">
			{/* Main Section */}
			<div className="relative flex flex-col min-h-screen w-full">
				{/* Header */}
				<div className="p-3 md:p-4 flex items-center justify-between border-b border-white/10">
					<div className="flex items-center gap-2 md:gap-4 flex-1 min-w-0">
						<button
							onClick={() => navigate("/watch-party")}
							data-testid="back-to-list"
							className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all flex-shrink-0">
							<ChevronLeft className="w-4 h-4 md:w-5 md:h-5" />
						</button>
						<div className="min-w-0 flex-1">
							<h2 className="font-semibold text-sm md:text-base truncate">
								{currentParty?.name}
							</h2>
							<p className="text-xs md:text-sm text-[#A1A1AA] truncate">
								{title}
							</p>
						</div>
					</div>
					<div className="flex items-center gap-1 md:gap-2 min-w-0 overflow-x-auto">
						{/* Mobile Chat Toggle */}
						<button
							onClick={() => setIsChatOpen(!isChatOpen)}
							className="lg:hidden w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 transition-all flex items-center justify-center relative"
							title="Toggle chat">
							<Send className="w-4 h-4" />
							{messages.length > 0 && (
								<span className="absolute -top-1 -right-1 w-3 h-3 bg-[#7C3AED] rounded-full" />
							)}
						</button>

						{/* Play/Pause Sync */}
						<button
							onClick={togglePlayback}
							data-testid="toggle-playback-btn"
							title={isPlaying ? "Pause for everyone" : "Play for everyone"}
							className="flex items-center gap-1 md:gap-2 px-2 md:px-3 py-2 rounded-full bg-white/10 hover:bg-white/20 transition-all text-sm">
							{isPlaying ? (
								<Pause className="w-4 h-4" />
							) : (
								<Play className="w-4 h-4" />
							)}
							<span className="hidden md:inline">{isPlaying ? "Pause" : "Play"}</span>
						</button>

						{/* Source Selector - movie/TV only, YouTube parties don't use embed sources */}
						{currentParty?.media_type !== "youtube" && (
							<>
								<button
									onClick={tryNextSource}
									data-testid="try-next-source-btn"
									className="hidden sm:flex items-center gap-2 px-2 md:px-3 py-2 rounded-full bg-[#7C3AED]/20 text-[#7C3AED] hover:bg-[#7C3AED]/30 transition-all text-sm">
									<RefreshCw className="w-4 h-4" />
									<span className="hidden md:inline">Try Next</span>
								</button>
								<div className="relative">
									<button
										onClick={() => setShowSourcePicker(!showSourcePicker)}
										data-testid="source-picker-btn"
										className="flex items-center gap-1 md:gap-2 px-2 md:px-3 py-2 rounded-full bg-white/10 hover:bg-white/20 transition-all text-sm">
										<Server className="w-4 h-4" />
										<span className="hidden md:inline">{selectedSource.name}</span>
									</button>

									{/* Source Picker Dropdown */}
									{showSourcePicker && (
										<div className="absolute right-0 top-full mt-2 bg-[#0A0A0A] border border-white/10 rounded-xl p-2 z-50 min-w-[200px] max-w-[280px] shadow-xl">
											<p className="text-xs text-[#A1A1AA] px-3 py-2">
												Select Streaming Source
											</p>
											<div className="max-h-[320px] overflow-y-auto">
												{STREAMING_SOURCES.map((source, index) => (
													<button
														key={source.id}
														onClick={() => changeSource(source, index)}
														data-testid={`source-${source.id}`}
														className={`w-full text-left px-3 md:px-4 py-2 rounded-lg transition-all flex items-center gap-2 text-sm ${
															selectedSource.id === source.id
																? "bg-[#7C3AED] text-white"
																: "hover:bg-white/5"
														}`}>
														{source.id === "trailer" ? (
															<Film className="w-4 h-4 flex-shrink-0" />
														) : (
															<Monitor className="w-4 h-4 flex-shrink-0" />
														)}
														<span className="flex-1 truncate">{source.name}</span>
														{index < 3 && source.id !== "trailer" && (
															<span className="text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded flex-shrink-0">
																Popular
															</span>
														)}
													</button>
												))}
											</div>
										</div>
									)}
								</div>
							</>
						)}

						{/* Change Content (Host Only) */}
						{isCreator && (
							<Dialog
								open={changeContentDialogOpen}
								onOpenChange={setChangeContentDialogOpen}>
								<DialogTrigger asChild>
									<button
										data-testid="change-content-btn"
										className="flex items-center gap-1 md:gap-2 px-2 md:px-3 py-2 rounded-full bg-white/10 hover:bg-white/20 transition-all text-sm">
										<RefreshCw className="w-4 h-4" />
										<span className="hidden md:inline">Change</span>
									</button>
								</DialogTrigger>
								<DialogContent className="bg-[#0A0A0A] border-white/10 max-w-lg mx-4">
									<DialogHeader>
										<DialogTitle className="text-lg md:text-xl">
											Change What's Playing
										</DialogTitle>
									</DialogHeader>
									<div className="space-y-4 mt-4">
										<div className="flex gap-2 p-1 bg-white/5 rounded-lg">
											<button
												type="button"
												onClick={() => setCreateContentTab("browse")}
												className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
													createContentTab === "browse"
														? "bg-[#7C3AED] text-white"
														: "text-[#A1A1AA] hover:text-white"
												}`}>
												Movies & TV
											</button>
											<button
												type="button"
												onClick={() => setCreateContentTab("youtube")}
												className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
													createContentTab === "youtube"
														? "bg-[#7C3AED] text-white"
														: "text-[#A1A1AA] hover:text-white"
												}`}>
												YouTube
											</button>
										</div>

										{createContentTab === "youtube" ? (
											<Input
												placeholder="Paste a YouTube link or video ID..."
												value={youtubeUrlInput}
												onChange={(e) => setYoutubeUrlInput(e.target.value)}
												onKeyDown={(e) => e.key === "Enter" && submitContentChange()}
												className="bg-black/50 border-white/10 text-sm md:text-base"
											/>
										) : (
											<>
												<div className="flex flex-col sm:flex-row gap-2">
													<Input
														placeholder="Search for a movie or show..."
														value={searchQuery}
														onChange={(e) => setSearchQuery(e.target.value)}
														onKeyDown={(e) => e.key === "Enter" && searchMovies()}
														className="bg-black/50 border-white/10 text-sm md:text-base"
													/>
													<Button
														onClick={searchMovies}
														variant="secondary"
														className="sm:flex-shrink-0">
														Search
													</Button>
												</div>

												{searchResults.length > 0 && (
													<div className="max-h-60 overflow-y-auto space-y-2">
														{searchResults.slice(0, 5).map((item) => (
															<div
																key={item.id}
																onClick={() => setSelectedMovie(item)}
																className={`flex items-center gap-2 md:gap-3 p-2 rounded-lg cursor-pointer transition-all ${
																	selectedMovie?.id === item.id
																		? "bg-[#7C3AED]/20 border border-[#7C3AED]"
																		: "bg-white/5 hover:bg-white/10"
																}`}>
																{item.poster_path && (
																	<img
																		src={`${IMAGE_BASE}w92${item.poster_path}`}
																		alt={item.title || item.name}
																		className="w-10 h-14 md:w-12 md:h-16 object-cover rounded flex-shrink-0"
																	/>
																)}
																<div className="flex-1 min-w-0">
																	<p className="font-medium text-sm md:text-base truncate">
																		{item.title || item.name}
																	</p>
																	<p className="text-xs md:text-sm text-[#A1A1AA]">
																		{
																			(
																				item.release_date || item.first_air_date
																			)?.split("-")[0]
																		}{" "}
																		• {item.media_type === "tv" ? "TV Show" : "Movie"}
																	</p>
																</div>
															</div>
														))}
													</div>
												)}
											</>
										)}

										<Button
											onClick={submitContentChange}
											className="w-full btn-primary">
											Switch
										</Button>
									</div>
								</DialogContent>
							</Dialog>
						)}

						<button
							onClick={copyRoomLink}
							data-testid="copy-link-btn"
							className="btn-secondary flex items-center gap-1 md:gap-2 px-2 md:px-3 py-2 text-sm">
							<Link2 className="w-4 h-4" />
							<span className="hidden lg:inline">Copy Link</span>
						</button>

						{/* Share dropdown */}
						<div className="relative group hidden sm:block">
							<button className="btn-secondary flex items-center gap-1 md:gap-2 px-2 md:px-3 py-2 text-sm">
								<Share2 className="w-4 h-4" />
								<span className="hidden lg:inline">Share</span>
							</button>
							<div className="absolute right-0 top-full mt-2 bg-[#0A0A0A] border border-white/10 rounded-lg p-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 min-w-[150px]">
								<button
									onClick={() => shareToSocial("whatsapp")}
									className="w-full text-left px-3 py-2 rounded hover:bg-white/5 text-sm">
									WhatsApp
								</button>
								<button
									onClick={() => shareToSocial("twitter")}
									className="w-full text-left px-3 py-2 rounded hover:bg-white/5 text-sm">
									Twitter
								</button>
								<button
									onClick={() => shareToSocial("telegram")}
									className="w-full text-left px-3 py-2 rounded hover:bg-white/5 text-sm">
									Telegram
								</button>
							</div>
						</div>

						{/* Invite Dialog - email invites require a Flixz account, guests
						    can still use Copy Link / Share above */}
						{!identity?.isGuest && (
							<Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
								<DialogTrigger asChild>
									<button className="btn-primary flex items-center gap-1 md:gap-2 px-2 md:px-3 py-2 text-sm">
										<Plus className="w-3 h-3 md:w-4 md:h-4" />
										<span className="hidden sm:inline">Invite</span>
									</button>
								</DialogTrigger>
								<DialogContent className="bg-[#0A0A0A] border-white/10 mx-4 max-w-md">
									<DialogHeader>
										<DialogTitle className="text-lg md:text-xl">
											Invite Friends
										</DialogTitle>
									</DialogHeader>
									<div className="space-y-4 mt-4">
										<div className="bg-[#7C3AED]/10 border border-[#7C3AED]/20 rounded-lg p-3">
											<p className="text-xs md:text-sm text-[#A1A1AA]">
												💡 <span className="text-white">Tip:</span> Anyone with
												the <span className="text-[#7C3AED]">Copy Link</span> can
												join instantly, account or not. If your friend has a
												Flixzbox account, they'll also get a notification below.
											</p>
										</div>
										<Input
											placeholder="Enter friend's email..."
											value={inviteEmail}
											onChange={(e) => setInviteEmail(e.target.value)}
											onKeyDown={(e) => e.key === "Enter" && sendInvite()}
											data-testid="invite-email-input"
											className="bg-black/50 border-white/10 text-sm md:text-base"
										/>
										<Button
											onClick={sendInvite}
											className="w-full btn-primary text-sm md:text-base">
											Send Invitation
										</Button>
									</div>
								</DialogContent>
							</Dialog>
						)}

						{/* Delete Party Button (Creator Only) */}
						{isCreator && (
							<button
								onClick={deleteParty}
								data-testid="delete-party-btn"
								className="btn-secondary flex items-center gap-1 md:gap-2 px-2 md:px-3 py-2 text-sm bg-red-500/10 hover:bg-red-500/20 text-red-500 border-red-500/20"
								title="End watch party">
								<X className="w-3 h-3 md:w-4 md:h-4" />
								<span className="hidden sm:inline">End Party</span>
							</button>
						)}
					</div>
				</div>

				{/* Video Player Section */}
				<div ref={videoPlayerRef} className="flex-1 relative bg-black">
					{/* Active Screen Share View - Takes Priority */}
					{activeScreenShare && !isSharingScreen && remoteStreams[activeScreenShare.sid] ? (
						<div className="relative w-full h-full min-h-[250px] md:min-h-[600px] bg-black flex items-center justify-center">
							{/* Screen Share Banner */}
							<div className="absolute top-4 left-4 z-20 px-4 py-2 bg-green-500/90 backdrop-blur-sm rounded-full text-white text-sm font-medium flex items-center gap-2">
								<div className="w-2 h-2 bg-white rounded-full animate-pulse" />
								{activeScreenShare.name} is sharing their screen
							</div>

							{/* Main Screen Share Video */}
							<video
								autoPlay
								playsInline
								muted={false}
								ref={(el) => {
									if (el && remoteStreams[activeScreenShare.sid]) {
										const stream = remoteStreams[activeScreenShare.sid];
										if (el.srcObject !== stream) {
											console.log("🖥️ Setting screen share stream to main video element");
											el.srcObject = stream;
											el.muted = false; // Ensure audio is enabled
											el.play().catch((err) => {
												console.log("Screen share video play error:", err.name);
											});
										}
									}
								}}
								className="w-full h-full object-contain"
								style={{ maxHeight: "100vh" }}
							/>

							{/* Info overlay */}
							<div className="absolute bottom-4 left-4 right-4 text-center text-white/80 text-sm">
								You are viewing {activeScreenShare.name}'s screen • Video and audio are synced in real-time
							</div>
						</div>
					) : isSharingScreen ? (
						/* When I'm sharing, show the regular video player for me */
						<div className="relative w-full h-full">
							{/* My Screen Sharing Banner */}
							<div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-20 px-4 py-2 bg-green-500/90 backdrop-blur-sm rounded-full text-white text-sm font-medium flex items-center gap-2">
								<div className="w-2 h-2 bg-white rounded-full animate-pulse" />
								You are sharing your screen
							</div>

							{/* Regular video player */}
							{currentParty?.media_type === "youtube" ? (
								<div
									ref={youtubeContainerRef}
									className="w-full h-full min-h-[250px] md:min-h-[400px] overflow-hidden relative"
								/>
							) : showEmbeddedPlayer ? (
								<iframe
									src={streamingUrl}
									className="w-full h-full min-h-[250px] md:min-h-[400px]"
									allowFullScreen
									allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
								/>
							) : trailerKey && selectedSource.id === "trailer" ? (
								<iframe
									src={`https://www.youtube.com/embed/${trailerKey}?autoplay=0&controls=1`}
									className="w-full h-full min-h-[250px] md:min-h-[800px]"
									allowFullScreen
									allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
								/>
							) : (
								<div className="w-full h-full min-h-[250px] md:min-h-[400px] flex items-center justify-center">
									{movieDetails?.backdrop_path && (
										<img
											src={`${IMAGE_BASE}original${movieDetails.backdrop_path}`}
											alt={title}
											className="absolute inset-0 w-full h-full object-cover opacity-30"
										/>
									)}
									<div className="relative text-center p-4 md:p-6">
										<div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-[#7C3AED]/20 flex items-center justify-center mb-3 md:mb-4 mx-auto">
											<Film className="w-8 h-8 md:w-10 md:h-10 text-[#7C3AED]" />
										</div>
										<h3 className="text-lg md:text-xl font-bold mb-2">
											Select a Streaming Source
										</h3>
										<p className="text-sm md:text-base text-[#A1A1AA] mb-4 max-w-md mx-auto px-2">
											Click the source picker above to choose a streaming source, or
											click "Try Next" to automatically cycle through sources.
										</p>
										<button
											onClick={tryNextSource}
											className="btn-primary flex items-center gap-2 mx-auto text-sm md:text-base">
											<RefreshCw className="w-4 h-4 md:w-5 md:h-5" />
											Try First Source
										</button>
									</div>
								</div>
							)}
						</div>
					) : (
						/* Normal view - no screen sharing active */
						<>
							{/* Embedded Streaming Player (default) */}
							{currentParty?.media_type === "youtube" ? (
								<div
									ref={youtubeContainerRef}
									className="w-full h-full min-h-[250px] md:min-h-[400px] overflow-hidden relative"
								/>
							) : showEmbeddedPlayer ? (
								<iframe
									src={streamingUrl}
									className="w-full h-full min-h-[250px] md:min-h-[400px]"
									allowFullScreen
									allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
								/>
							) : trailerKey && selectedSource.id === "trailer" ? (
						// YouTube Trailer (fallback)
						<iframe
							src={`https://www.youtube.com/embed/${trailerKey}?autoplay=0&controls=1`}
							className="w-full h-full min-h-[250px] md:min-h-[800px]"
							allowFullScreen
							allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
						/>
					) : (
								// Backdrop with instructions
								<div className="w-full h-full min-h-[250px] md:min-h-[400px] flex items-center justify-center">
									{movieDetails?.backdrop_path && (
										<img
											src={`${IMAGE_BASE}original${movieDetails.backdrop_path}`}
											alt={title}
											className="absolute inset-0 w-full h-full object-cover opacity-30"
										/>
									)}
									<div className="relative text-center p-4 md:p-6">
										<div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-[#7C3AED]/20 flex items-center justify-center mb-3 md:mb-4 mx-auto">
											<Film className="w-8 h-8 md:w-10 md:h-10 text-[#7C3AED]" />
										</div>
										<h3 className="text-lg md:text-xl font-bold mb-2">
											Select a Streaming Source
										</h3>
										<p className="text-sm md:text-base text-[#A1A1AA] mb-4 max-w-md mx-auto px-2">
											Click the source picker above to choose a streaming source, or
											click "Try Next" to automatically cycle through sources.
										</p>
										<button
											onClick={tryNextSource}
											className="btn-primary flex items-center gap-2 mx-auto text-sm md:text-base">
											<RefreshCw className="w-4 h-4 md:w-5 md:h-5" />
											Try First Source
										</button>
									</div>
								</div>
							)}
						</>
					)}

					{/* Picture-in-Picture Video Overlay (Your Video) - Hidden during screen share viewing */}
					{isInCall && !(activeScreenShare && !isSharingScreen) && (
						<div
							onPointerDown={pipDrag.onPointerDown}
							onPointerMove={pipDrag.onPointerMove}
							onPointerUp={pipDrag.onPointerUp}
							onPointerCancel={pipDrag.onPointerUp}
							title="Drag to move"
							className={`absolute select-none ${
								isVideoFullscreen
									? "w-40 h-32 sm:w-48 sm:h-36 md:w-56 md:h-40"
									: "w-32 h-24 sm:w-40 sm:h-32 md:w-48 md:h-36"
							} ${
								pipDrag.offset
									? ""
									: isVideoFullscreen
									? "bottom-6 right-4"
									: "bottom-24 md:bottom-20 right-3 md:right-4"
							} rounded-lg overflow-hidden border-2 border-[#7C3AED] shadow-2xl bg-[#121212] cursor-grab active:cursor-grabbing`}
							style={{
								zIndex: 2147483647,
								touchAction: "none",
								...(pipDrag.offset
									? { top: pipDrag.offset.y, left: pipDrag.offset.x }
									: {}),
							}}>
							{localStream ? (
								<>
									<video
										ref={localVideoRef}
										muted
										playsInline
										controls={false}
										draggable={false}
										className="w-full h-full object-cover bg-black pointer-events-none"
										style={{ transform: "scaleX(-1)" }}
										onLoadedMetadata={(e) => {
											const videoEl = e.target;
											setTimeout(() => {
												videoEl.play().catch((err) => {
													if (err.name !== "AbortError") {
														console.error("Video play failed:", err.name);
													}
												});
											}, 150);
										}}
									/>
									<div className="absolute bottom-2 left-2 px-2 py-1 bg-black/80 rounded text-xs font-medium">
										You {!isVideoEnabled && "📵"}
									</div>
									{!isVideoEnabled && (
										<div className="absolute inset-0 bg-[#121212] flex items-center justify-center">
											<div className="w-12 h-12 rounded-full bg-[#7C3AED] flex items-center justify-center text-xl font-bold">
												{identity?.name?.charAt(0).toUpperCase()}
											</div>
										</div>
									)}
								</>
							) : (
								<div className="w-full h-full flex items-center justify-center text-xs text-[#A1A1AA]">
									Loading camera...
								</div>
							)}
						</div>
					)}

					{/* Remote Participant Videos Overlay - full gallery of everyone in the call, no cap */}
					{isInCall && filteredRemoteStreams.length > 0 && (
						<div
							className={`absolute flex flex-col gap-1 ${
								galleryDrag.offset
									? ""
									: activeScreenShare && !isSharingScreen
									? "bottom-24 md:bottom-20 left-3 md:left-4" // Move to bottom-left when viewing screen share
									: isVideoFullscreen
									? "top-6 right-4"
									: "top-16 md:top-20 right-3 md:right-4"
							}`}
							style={{
								zIndex: 2147483647,
								...(galleryDrag.offset
									? { top: galleryDrag.offset.y, left: galleryDrag.offset.x }
									: {}),
							}}>
							{/* Drag handle - a thin grip bar, separate from the scrollable
							    tiles below so dragging the gallery doesn't fight with
							    scrolling through it when there are many participants */}
							<div
								onPointerDown={galleryDrag.onPointerDown}
								onPointerMove={galleryDrag.onPointerMove}
								onPointerUp={galleryDrag.onPointerUp}
								onPointerCancel={galleryDrag.onPointerUp}
								title="Drag to move"
								className="self-end flex items-center justify-center gap-0.5 px-3 py-1 rounded-full bg-black/70 select-none cursor-grab active:cursor-grabbing"
								style={{ touchAction: "none" }}>
								<span className="w-1 h-1 rounded-full bg-white/60" />
								<span className="w-1 h-1 rounded-full bg-white/60" />
								<span className="w-1 h-1 rounded-full bg-white/60" />
							</div>
							<div
								className={`flex flex-wrap gap-2 justify-end overflow-y-auto ${
									activeScreenShare && !isSharingScreen
										? "max-w-[70vw] max-h-[30vh]"
										: isVideoFullscreen
										? "max-w-[50vw] max-h-[70vh]"
										: "max-w-[60vw] max-h-[60vh]"
								}`}>
							{filteredRemoteStreams.map(([peerId, stream]) => (
								<div
									key={peerId}
									className={`${
										isVideoFullscreen
											? "w-40 h-32 sm:w-48 sm:h-36 md:w-56 md:h-40"
											: "w-32 h-24 sm:w-40 sm:h-32 md:w-48 md:h-36"
									} rounded-lg overflow-hidden border-2 border-white/20 shadow-2xl bg-[#121212]`}>
									<video
										autoPlay
										playsInline
										muted={false}
										ref={(el) => {
											if (el && stream) {
												// Only set if different to avoid re-renders
												if (el.srcObject !== stream) {
													console.log("🎥 Setting remote stream for peer", peerId);
													el.srcObject = stream;

													// Force play when metadata is loaded
													el.onloadedmetadata = () => {
														el.play().catch((err) => {
															console.error("Remote video play failed:", err.name, "- trying muted");
															// Fallback: try muted if unmuted fails
															el.muted = true;
															el.play().catch((e) => {
																console.error("Remote video play failed even muted:", e.name);
															});
														});
													};
												}
											}
										}}
										className="w-full h-full object-cover"
									/>
									<div className="absolute top-2 left-2 px-2 py-1 bg-black/80 rounded text-xs font-medium">
										Participant
									</div>
								</div>
							))}
							</div>
						</div>
					)}

					{/* Fullscreen toggle - rendered after (and at the same max z-index as)
					    the camera overlays above, so DOM order lets it always win and
					    stay clickable even if a camera tile is dragged over this corner */}
					<button
						onClick={toggleFullscreen}
						className="absolute top-3 right-3 md:top-4 md:right-4 w-9 h-9 md:w-10 md:h-10 rounded-full bg-black/50 flex items-center justify-center hover:bg-black/70 transition-all"
						style={{ zIndex: 2147483647 }}
						title={isVideoFullscreen ? "Exit fullscreen" : "Enter fullscreen"}>
						{isVideoFullscreen ? (
							<Minimize2 className="w-4 h-4 md:w-5 md:h-5" />
						) : (
							<Maximize2 className="w-4 h-4 md:w-5 md:h-5" />
						)}
					</button>

					{/* Current source indicator - positioned to avoid blocking video controls */}
					{currentParty?.media_type !== "youtube" && (
						<div
							className="absolute top-3 left-3 md:top-4 md:left-4 px-2 py-1 md:px-3 md:py-1.5 rounded-full bg-black/70 backdrop-blur-sm text-xs md:text-sm flex items-center gap-1 md:gap-2"
							style={{ zIndex: 10 }}>
							<Server className="w-3 h-3 md:w-4 md:h-4 text-[#7C3AED]" />
							<span className="hidden sm:inline">{selectedSource.name}</span>
						</div>
					)}
				</div>

				{/* Video Call Controls Section */}
				<div className="border-t border-white/10">
					{/* Call Controls */}
					<div className="p-3 md:p-4 flex items-center justify-between gap-2 md:gap-4">
						<div className="flex items-center gap-1 md:gap-2 text-[#A1A1AA] text-sm md:text-base">
							<Users className="w-4 h-4 md:w-5 md:h-5" />
							<span className="hidden sm:inline">
								{participants.length} watching
							</span>
							<span className="sm:hidden">{participants.length}</span>
						</div>

						<div className="flex items-center gap-2">
							{isInCall ? (
								<>
									<button
										type="button"
										onClick={toggleVideo}
										data-testid="toggle-video-btn"
										className={`w-11 h-11 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-all ${
											isVideoEnabled
												? "bg-white/10 hover:bg-white/20"
												: "bg-red-500/20 text-red-500"
										}`}>
										{isVideoEnabled ? (
											<Video className="w-4 h-4 md:w-5 md:h-5" />
										) : (
											<VideoOff className="w-4 h-4 md:w-5 md:h-5" />
										)}
									</button>
									<button
										type="button"
										onClick={toggleAudio}
										data-testid="toggle-audio-btn"
										className={`w-11 h-11 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-all ${
											isAudioEnabled
												? "bg-white/10 hover:bg-white/20"
												: "bg-red-500/20 text-red-500"
										}`}>
										{isAudioEnabled ? (
											<Mic className="w-4 h-4 md:w-5 md:h-5" />
										) : (
											<MicOff className="w-4 h-4 md:w-5 md:h-5" />
										)}
									</button>
									<button
										type="button"
										onClick={isSharingScreen ? stopScreenShare : startScreenShare}
										data-testid="screen-share-btn"
										className={`w-11 h-11 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-all ${
											isSharingScreen
												? "bg-green-500/20 text-green-400"
												: "bg-white/10 hover:bg-white/20"
										}`}
										title={isSharingScreen ? "Stop sharing screen" : "Share screen"}>
										{isSharingScreen ? (
											<MonitorStop className="w-4 h-4 md:w-5 md:h-5" />
										) : (
											<MonitorUp className="w-4 h-4 md:w-5 md:h-5" />
										)}
									</button>
									<button
										type="button"
										onClick={endCall}
										data-testid="end-call-btn"
										className="w-11 h-11 md:w-12 md:h-12 rounded-full bg-red-500 flex items-center justify-center hover:bg-red-600 transition-all">
										<PhoneOff className="w-4 h-4 md:w-5 md:h-5" />
									</button>
								</>
							) : (
								<button
									type="button"
									onClick={startCall}
									data-testid="start-call-btn"
									className="btn-primary flex items-center gap-2 px-3 py-2 md:px-4 md:py-2 text-sm">
									<Video className="w-4 h-4 md:w-5 md:h-5" />
									<span className="hidden sm:inline">Join Video Call</span>
									<span className="sm:hidden">Join</span>
								</button>
							)}
						</div>

						<div className="hidden sm:flex -space-x-2">
							{participants.slice(0, 5).map((p, i) => (
								<div
									key={i}
									className="w-8 h-8 rounded-full bg-[#7C3AED] flex items-center justify-center text-sm font-semibold border-2 border-[#050505]">
									{p.name?.charAt(0).toUpperCase()}
								</div>
							))}
							{participants.length > 5 && (
								<div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs border-2 border-[#050505]">
									+{participants.length - 5}
								</div>
							)}
						</div>
					</div>
				</div>
			</div>

			{/* Chat Section - Desktop Sidebar / Mobile Overlay */}
			<div
				className={`
          fixed lg:static inset-0 lg:border-l lg:border-white/10 flex flex-col
          bg-[#050505] lg:bg-transparent z-[60] transition-transform duration-300
          ${isChatOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"}
          lg:w-[380px]
        `}>
				{/* Chat Header */}
				<div className="p-4 border-b border-white/10 flex items-center justify-between">
					<h3 className="font-semibold">Chat</h3>
					<button
						onClick={() => setIsChatOpen(false)}
						className="lg:hidden w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 transition-all flex items-center justify-center">
						<X className="w-4 h-4" />
					</button>
				</div>

				{/* Messages */}
				<div ref={chatRef} className="flex-1 overflow-y-auto p-4 space-y-4">
					{messages.length === 0 ? (
						<div className="text-center text-[#A1A1AA] py-8">
							<p>No messages yet</p>
							<p className="text-sm">Start the conversation!</p>
						</div>
					) : (
						messages.map((msg, i) => (
							<div key={i} className="chat-message">
								<div className="flex items-start gap-2">
									<div className="w-8 h-8 rounded-full bg-[#7C3AED] flex items-center justify-center text-sm font-semibold flex-shrink-0">
										{msg.user_name?.charAt(0).toUpperCase()}
									</div>
									<div className="flex-1 min-w-0">
										<div className="flex items-center gap-2">
											<span className="font-medium text-sm truncate">
												{msg.user_name}
											</span>
											<span className="text-xs text-[#52525B] flex-shrink-0">
												{new Date(msg.timestamp).toLocaleTimeString([], {
													hour: "2-digit",
													minute: "2-digit",
												})}
											</span>
										</div>
										<p className="text-sm text-[#A1A1AA] mt-1 break-words">
											{msg.message}
										</p>
									</div>
								</div>
							</div>
						))
					)}
				</div>

				{/* Message Input */}
				<form
					onSubmit={sendMessage}
					className="p-4 border-t border-white/10 flex gap-2">
					<Input
						value={newMessage}
						onChange={(e) => setNewMessage(e.target.value)}
						placeholder="Type a message..."
						data-testid="chat-input"
						className="bg-black/50 border-white/10"
					/>
					<Button
						type="submit"
						data-testid="send-message-btn"
						className="bg-[#7C3AED] hover:bg-[#8B5CF6] flex-shrink-0">
						<Send className="w-4 h-4" />
					</Button>
				</form>
			</div>

			{/* Mobile Chat Overlay Backdrop */}
			{isChatOpen && (
				<div
					className="fixed inset-0 bg-black/50 z-[59] lg:hidden"
					onClick={() => setIsChatOpen(false)}
				/>
			)}
		</div>
	);
};

export default WatchPartyPage;
