/** @format */

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { io } from "socket.io-client";
import { toast } from "sonner";
import {
	Users,
	Share2,
	ChevronLeft,
	Plus,
	X,
	Link2,
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
import WatchPartyRoom from "../components/watch-party/WatchPartyRoom";
import WatchPartyCountdownOverlay from "../components/watch-party/WatchPartyCountdownOverlay";
import { useWatchPartySync } from "../lib/watchParty/useWatchPartySync";
import { TmdbWatchPartyPlayer } from "../lib/watchParty/TmdbWatchPartyPlayer";
import { CustomWatchPartyPlayer } from "../lib/watchParty/CustomWatchPartyPlayer";
import { YouTubeWatchPartyPlayer } from "../lib/watchParty/YouTubeWatchPartyPlayer";

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

const WatchPartyPage = () => {
	const { roomId } = useParams();
	const navigate = useNavigate();
	const { user, token, getAuthHeaders } = useAuth();

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
	// Self-hosted upload details (custom_content doc), mirrors movieDetails
	// for the TMDB case - fetched once we know currentParty.custom_content_id.
	const [customContentDetails, setCustomContentDetails] = useState(null);
	const [messages, setMessages] = useState([]);
	const [newMessage, setNewMessage] = useState("");
	const [participants, setParticipants] = useState([]);
	const [loading, setLoading] = useState(true);

	// isHost has to be computed this early (not just before the final return,
	// where the old isCreator lived) because useWatchPartySync below is a
	// hook - it must be called unconditionally on every render, in the same
	// position, so it can't wait for a later conditional-return guard. It's
	// safe to compute before currentParty/identity are loaded: both sides
	// are optional-chained, so it's simply false until they resolve.
	const isHost =
		!!identity &&
		!identity.isGuest &&
		(currentParty?.host_id === identity.id || currentParty?.host_name === identity.name);

	// Create party state
	const [createDialogOpen, setCreateDialogOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [searchResults, setSearchResults] = useState([]);
	const [selectedMovie, setSelectedMovie] = useState(null);
	const [partyName, setPartyName] = useState("");
	const [createContentTab, setCreateContentTab] = useState("browse"); // "browse" | "youtube" | "custom"
	const [youtubeUrlInput, setYoutubeUrlInput] = useState("");
	const [changeContentDialogOpen, setChangeContentDialogOpen] = useState(false);
	const [customContentList, setCustomContentList] = useState([]);
	const [selectedCustomContent, setSelectedCustomContent] = useState(null);
	// Whether the CURRENT media has ever actually started playing - false
	// right after creation or any host_change_media, driving whether the
	// waiting/countdown overlay shows. Only meaningful for hard-sync media
	// (youtube/custom); TMDB parties never show that overlay at all.
	const [hasEverPlayed, setHasEverPlayed] = useState(false);

	// Video call state
	const [isInCall, setIsInCall] = useState(false);
	const [localStream, setLocalStream] = useState(null);
	const [remoteStreams, setRemoteStreams] = useState({});
	const [isVideoEnabled, setIsVideoEnabled] = useState(true);
	const [isAudioEnabled, setIsAudioEnabled] = useState(true);
	const [isSharingScreen, setIsSharingScreen] = useState(false);
	const [screenStream, setScreenStream] = useState(null);
	// Peer display names and mic/cam status, keyed by socket sid - both are
	// already broadcast by the backend (webrtc_peers/webrtc_peer_joined carry
	// user_name, webrtc_media_toggle carries type/enabled) but were previously
	// only used for a toast / logged and discarded. Real tiles need them.
	const [peerNames, setPeerNames] = useState({});
	const [peerMediaState, setPeerMediaState] = useState({});
	// YouTube-only: true while the player reports BUFFERING, for the loading
	// spinner. Movie/TV embeds have no such signal (see WatchPartyPlayer).
	const [isBuffering, setIsBuffering] = useState(false);
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

	// Reactive mirror of socketRef - the latter stays a plain ref (stable
	// access from the many existing WebRTC/chat callbacks, unchanged), but
	// useWatchPartySync needs an actual state value so its effect re-runs
	// once the socket genuinely exists (assigning to a ref's .current
	// doesn't trigger a re-render by itself).
	const [socket, setSocket] = useState(null);
	const watchParty = useWatchPartySync({ socket, roomId, isHost });

	// Refs
	const socketRef = useRef(null);
	const chatRef = useRef(null);
	const localVideoRef = useRef(null);
	const peerConnectionsRef = useRef({});
	// Fullscreen target (previously this player-section ref) now lives inside
	// WatchPartyRoom, which owns a container wrapping cameras+controls+chat too.
	const localStreamRef = useRef(null); // Keep stream in ref for stable access
	const pendingCandidatesRef = useRef({}); // Store ICE candidates before connection ready
	const youtubePlayerRef = useRef(null); // YT.Player instance for youtube-content parties
	const youtubeContainerRef = useRef(null);
	const customVideoRef = useRef(null); // <video> element for self-hosted uploads
	const tmdbAdapterRef = useRef(null); // TmdbWatchPartyPlayer instance for movie/TV parties

	// Floating-layout camera dragging is now owned per-tile inside
	// FloatingParticipantLayer (see components/watch-party/), each with its
	// own useDraggableOverlay instance - no drag state lives here anymore.
	// playbackStartTimeRef/lastSyncTimeRef/isSyncingRef/latestPlaybackRef are
	// gone too - WatchPartySyncEngine (lib/watchParty/) now owns all of
	// that: the stale-closure race they guarded against is instead solved
	// by only ever handing the engine an adapter once it reports ready (see
	// WatchPartySyncEngine.setAdapter), and the sync-echo-loop guard is the
	// engine's own internal _applying flag.

	// Keep localStreamRef in sync with localStream state
	useEffect(() => {
		localStreamRef.current = localStream;
	}, [localStream]);

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
		// Floating camera tiles unmount with isInCall, which drops their drag
		// offsets for free - no manual reset needed here anymore.

		// Notify server
		socketRef.current?.emit("webrtc_leave", { room_id: roomId });
	}, [localStream, screenStream, roomId]);

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
			// Actual isPlaying/currentTime come from the sync_state the server
			// sends as a targeted message once join_room completes (handled by
			// useWatchPartySync) - that path also does the elapsed-time
			// compensation this REST snapshot doesn't. Just seed whether
			// playback has ever started, for the countdown/waiting overlay.
			setHasEverPlayed(res.data.is_playing || res.data.current_time > 0.5);

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

			// Fetch content details (skip for youtube - no TMDB/custom record)
			if (res.data.media_type === "movie" || res.data.media_type === "tv") {
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
			} else if (res.data.media_type === "custom" && res.data.custom_content_id) {
				const customRes = await axios.get(
					`${API}/custom-content/${res.data.custom_content_id}`
				);
				setCustomContentDetails(customRes.data);
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
			// Lets the server verify our real identity at connect time (see
			// resolve_verified_user_id in server.py) instead of trusting the
			// user_id field join_room sends - that field alone is forgeable,
			// since host_id is public (returned to every joiner), so this is
			// what host-only enforcement actually rests on. OAuth sessions
			// have no bearer token here; the session cookie travels on the
			// handshake itself via withCredentials and is verified the same way.
			auth: token && token !== "oauth_cookie" ? { token } : {},
		});
		setSocket(socketRef.current);

		socketRef.current.on("connect", () => {
			console.log("✅ Socket connected! ID:", socketRef.current.id);
			socketRef.current.emit("join_room", {
				room_id: roomId,
				user_name: identity?.name || "Anonymous",
				// Bound server-side at join time and checked against the room's
				// host_id for every host_* command - this is what real
				// enforcement rests on, not anything the UI merely hides.
				user_id: identity?.id,
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

		// Playback sync itself (sync_state/countdown_started/participant_ready/
		// host_command_rejected) is handled entirely inside useWatchPartySync,
		// subscribed to the `socket` state set above. This listener only
		// covers the page-level side effects of a media change that aren't
		// the engine's concern: updating currentParty, fetching the new
		// content's details, and resetting the ready/countdown flow.
		socketRef.current.on("media_changed", async (data) => {
			console.log("🔀 Media changed:", data);

			setCurrentParty((prev) =>
				prev
					? {
							...prev,
							media_type: data.media_type,
							movie_id: data.movie_id,
							youtube_video_id: data.youtube_video_id,
							custom_content_id: data.custom_content_id,
					  }
					: prev
			);
			setHasEverPlayed(false);
			setMovieDetails(null);
			setCustomContentDetails(null);

			if (data.media_type === "movie" || data.media_type === "tv") {
				try {
					const endpoint = data.media_type === "movie" ? "movies" : "tv";
					const res = await axios.get(`${API}/${endpoint}/${data.movie_id}`);
					setMovieDetails(res.data);
				} catch (err) {
					console.error("Failed to load new content details:", err);
				}
			} else if (data.media_type === "custom" && data.custom_content_id) {
				try {
					const res = await axios.get(`${API}/custom-content/${data.custom_content_id}`);
					setCustomContentDetails(res.data);
				} catch (err) {
					console.error("Failed to load new custom content details:", err);
				}
			}

			if (data.user_name && data.user_name !== identity?.name) {
				toast.info(`${data.user_name} changed what's playing`);
			}
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
			setPeerNames((prev) => {
				const next = { ...prev };
				for (const peer of data.peers) next[peer.sid] = peer.user_name;
				return next;
			});
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
			setPeerNames((prev) => ({ ...prev, [data.sid]: data.user_name }));

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
			setPeerNames((prev) => {
				const updated = { ...prev };
				delete updated[data.sid];
				return updated;
			});
			setPeerMediaState((prev) => {
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
			setPeerMediaState((prev) => ({
				...prev,
				[data.sid]: { ...prev[data.sid], [data.type]: data.enabled },
			}));
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
	}, [roomId, identity, token, createPeerConnection, handleOffer, navigate]);

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

	// Periodic host heartbeat: keeps the server's authoritative current_time
	// fresh (both for other clients' drift correction and for a late
	// joiner's elapsed-time-compensated starting position) - replaces the
	// old continuous-position-tracking + seek-detection effects, which did
	// the same job by hand for the single YouTube-only path. Seeks from the
	// host's own custom-control-bar interactions go through hostSeek()
	// directly (immediate), this is just the steady drip in between.
	useEffect(() => {
		if (!isHost || !watchParty.isPlaying) return;
		// watchParty.engine is a stable ref-held instance (unlike the
		// watchParty object itself, which is a fresh literal every render) -
		// depend on that, not the whole hook result, so this interval isn't
		// torn down and recreated on every re-render.
		const engine = watchParty.engine;
		const interval = setInterval(() => engine.hostHeartbeat(), 2000);
		return () => clearInterval(interval);
	}, [isHost, watchParty.isPlaying, watchParty.engine]);

	// Latch hasEverPlayed the moment real playback actually starts (the GO
	// moment, or a late joiner's first sync_state already mid-playback) -
	// without this, countdownPhase falls back to "waiting" again as soon as
	// countdownSeconds resets to null after the brief "GO!" flash, re-showing
	// the waiting/countdown overlay (and its pointer-blocking backdrop) over
	// an already-playing video forever.
	useEffect(() => {
		if (watchParty.isPlaying) setHasEverPlayed(true);
	}, [watchParty.isPlaying]);

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

	// Fullscreen is now owned by WatchPartyRoom (components/watch-party/),
	// which requests fullscreen on a container wrapping the player+cameras+
	// controls+chat together, per the redesign's explicit requirement that
	// camera overlays and controls stay visible while fullscreen - the old
	// player-section-only fullscreen target here is gone.

	// Set up the YouTube IFrame Player for youtube-content parties. Unlike the
	// vidsrc-style embeds (opaque third-party iframes with no control API),
	// YouTube's own player exposes real JS control, so this is one of the two
	// content types (the other being self-hosted uploads) that gets true
	// hard sync through WatchPartySyncEngine rather than an advisory toast.
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
				// controls:0 - all playback control goes through WatchPartyPlayer's
				// own branded control bar (host-gated there), not YouTube's native
				// chrome, so a participant has nothing to directly interact with
				// in the first place (a UX nicety; the real enforcement is the
				// server rejecting any host_* command not from the actual host).
				playerVars: { autoplay: 0, controls: 0, rel: 0 },
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

						// Only hand the adapter to the engine once the player is
						// genuinely ready - the engine re-applies whatever the
						// latest known sync state was the moment it receives an
						// adapter, so there's no race to separately guard against
						// here (see WatchPartySyncEngine.setAdapter).
						watchParty.setAdapter(new YouTubeWatchPartyPlayer(youtubePlayerRef));
						watchParty.reportReady();
					},
					onStateChange: (event) => {
						// Buffering reflects reality regardless of who triggered the
						// state change.
						setIsBuffering(event.data === window.YT.PlayerState.BUFFERING);

						if (event.data === window.YT.PlayerState.PLAYING) {
							watchParty.notifyLocalStateChange({
								isPlaying: true,
								currentTime: event.target.getCurrentTime(),
							});
						} else if (event.data === window.YT.PlayerState.PAUSED) {
							watchParty.notifyLocalStateChange({
								isPlaying: false,
								currentTime: event.target.getCurrentTime(),
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

	// Tear down the YouTube player when leaving a youtube party / unmounting
	useEffect(() => {
		return () => {
			if (youtubePlayerRef.current?.destroy) {
				youtubePlayerRef.current.destroy();
			}
			youtubePlayerRef.current = null;
		};
	}, [roomId]);

	// Movie/TV (vidsrc-style embed) adapter: no real DOM dependency to wait
	// on - there's no control API for this content type at all, hard or
	// otherwise, so the adapter is just a local estimate-tracker (see
	// TmdbWatchPartyPlayer). No countdown/ready-check applies to this media
	// type; mark it ready immediately so nothing waits on a signal that will
	// never come.
	useEffect(() => {
		if (currentParty?.media_type !== "movie" && currentParty?.media_type !== "tv") return;
		const adapter = new TmdbWatchPartyPlayer();
		adapter.markReady();
		tmdbAdapterRef.current = adapter;
		watchParty.setAdapter(adapter);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [currentParty?.media_type, currentParty?.movie_id]);

	// Self-hosted upload adapter: wraps the <video> element rendered by
	// WatchPartyPlayer for media_type "custom". True hard sync, same tier as
	// YouTube - only hand it to the engine once the element can actually
	// report a position (loadedmetadata), mirroring the YouTube onReady gate.
	useEffect(() => {
		if (currentParty?.media_type !== "custom" || !customContentDetails) return;
		const el = customVideoRef.current;
		if (!el) return;

		const onLoadedMetadata = () => {
			watchParty.setAdapter(new CustomWatchPartyPlayer(customVideoRef));
			watchParty.reportReady();
		};
		if (el.readyState >= 1) {
			onLoadedMetadata();
		} else {
			el.addEventListener("loadedmetadata", onLoadedMetadata);
		}

		const onPlay = () =>
			watchParty.notifyLocalStateChange({ isPlaying: true, currentTime: el.currentTime });
		const onPause = () =>
			watchParty.notifyLocalStateChange({ isPlaying: false, currentTime: el.currentTime });
		el.addEventListener("play", onPlay);
		el.addEventListener("pause", onPause);

		return () => {
			el.removeEventListener("loadedmetadata", onLoadedMetadata);
			el.removeEventListener("play", onPlay);
			el.removeEventListener("pause", onPause);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [currentParty?.media_type, customContentDetails]);

	// Toast when playback state changes due to someone ELSE's action (skips
	// the very first sync received on join, which already gets its own
	// "Joined watch party!" toast and shouldn't also announce itself as a
	// "someone resumed playback" notice).
	const hasShownFirstSyncRef = useRef(false);
	useEffect(() => {
		if (!hasShownFirstSyncRef.current) {
			hasShownFirstSyncRef.current = true;
			return;
		}
		if (watchParty.lastSyncUserName && watchParty.lastSyncUserName !== identity?.name) {
			const action = watchParty.isPlaying ? "▶️ resumed playback" : "⏸️ paused playback";
			toast.info(`${watchParty.lastSyncUserName} ${action}`, { duration: 2000 });
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [watchParty.isPlaying, watchParty.lastSyncUserName]);

	// Surface server-side rejections (e.g. a stale UI state briefly let a
	// non-host attempt a host action) - this is the real enforcement path,
	// the UI gating elsewhere is just the normal-case nicety.
	useEffect(() => {
		if (watchParty.rejectedReason) toast.error(watchParty.rejectedReason);
	}, [watchParty.rejectedReason]);

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

	// GET /custom-content is already public/unauthenticated (an existing
	// endpoint, unchanged) - lists everyone's uploads, same as CustomContentPage.
	const fetchCustomContent = async () => {
		try {
			const res = await axios.get(`${API}/custom-content`);
			setCustomContentList(res.data?.results || []);
		} catch (error) {
			console.error("Failed to load custom content:", error);
		}
	};

	const createParty = async () => {
		if (!partyName.trim()) {
			toast.error("Please enter a party name");
			return;
		}

		let payload;
		if (createContentTab === "youtube") {
			if (!youtubeUrlInput.trim()) {
				toast.error("Please paste a YouTube link or video ID");
				return;
			}
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
		} else if (createContentTab === "custom") {
			if (!selectedCustomContent) {
				toast.error("Please select something from your uploads");
				return;
			}
			payload = {
				name: partyName,
				media_type: "custom",
				custom_content_id: selectedCustomContent.content_id,
			};
		} else {
			if (!selectedMovie) {
				toast.error("Please select a movie or show");
				return;
			}
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

	// Host-only (the UI only exposes this button to the host; the server
	// independently rejects it from anyone else regardless). Drives the
	// active adapter directly and broadcasts via WatchPartySyncEngine.
	const togglePlayback = () => {
		if (watchParty.isPlaying) {
			watchParty.hostPause();
			toast.success("⏸️ Paused playback");
		} else {
			watchParty.hostPlay();
			toast.success("▶️ Resumed playback");
		}
	};

	// Custom progress-bar seek (hard-sync adapters only - YouTube/custom
	// upload). The control itself already called adapter.seekTo() for
	// instant local feedback before this fires; hostSeek() broadcasts it.
	const handleHostSeek = (time) => {
		watchParty.hostSeek(time);
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

	// Which vidsrc mirror to use doesn't change WHAT'S playing, just HOW it's
	// streamed - unlike actual playback control, this is personal/local per
	// participant now (useful precisely when the shared mirror is unreliable
	// for just one person), not broadcast or host-gated.
	const tryNextSource = () => {
		const nextIndex = (currentSourceIndex + 1) % (STREAMING_SOURCES.length - 1); // Skip "Trailer Only"
		setCurrentSourceIndex(nextIndex);
		setSelectedSource(STREAMING_SOURCES[nextIndex]);
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
		toast.success(`Switched to ${source.name}`);
	};

	const submitContentChange = () => {
		if (createContentTab === "youtube") {
			const videoId = extractYoutubeVideoId(youtubeUrlInput.trim());
			if (!videoId) {
				toast.error("Invalid YouTube URL. Paste a link or an 11-character video ID");
				return;
			}
			watchParty.hostChangeMedia({ media_type: "youtube", youtube_video_id: videoId });
		} else if (createContentTab === "custom") {
			if (!selectedCustomContent) {
				toast.error("Please select something from your uploads");
				return;
			}
			watchParty.hostChangeMedia({
				media_type: "custom",
				custom_content_id: selectedCustomContent.content_id,
			});
		} else {
			if (!selectedMovie) {
				toast.error("Please select a movie or show");
				return;
			}
			watchParty.hostChangeMedia({
				media_type: selectedMovie.media_type || "movie",
				movie_id: selectedMovie.id,
			});
		}

		setChangeContentDialogOpen(false);
		setYoutubeUrlInput("");
		setSelectedMovie(null);
		setSelectedCustomContent(null);
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
										<button
											type="button"
											onClick={() => {
												setCreateContentTab("custom");
												if (customContentList.length === 0) fetchCustomContent();
											}}
											data-testid="tab-custom"
											className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
												createContentTab === "custom"
													? "bg-[#7C3AED] text-white"
													: "text-[#A1A1AA] hover:text-white"
											}`}>
											My Uploads
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
									) : createContentTab === "custom" ? (
										<div className="max-h-60 overflow-y-auto space-y-2">
											{customContentList.length === 0 ? (
												<p className="text-sm text-[#A1A1AA] text-center py-4">
													No uploads yet - add one from "My Uploads" first.
												</p>
											) : (
												customContentList.map((item) => (
													<div
														key={item.content_id}
														onClick={() => setSelectedCustomContent(item)}
														data-testid={`custom-result-${item.content_id}`}
														className={`flex items-center gap-2 md:gap-3 p-2 rounded-lg cursor-pointer transition-all ${
															selectedCustomContent?.content_id === item.content_id
																? "bg-[#7C3AED]/20 border border-[#7C3AED]"
																: "bg-white/5 hover:bg-white/10"
														}`}>
														{item.poster_url && (
															<img
																src={item.poster_url}
																alt={item.title}
																className="w-10 h-14 md:w-12 md:h-16 object-cover rounded flex-shrink-0"
															/>
														)}
														<p className="font-medium text-sm md:text-base truncate">
															{item.title}
														</p>
													</div>
												))
											)}
										</div>
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
												: createContentTab === "custom"
												? !selectedCustomContent
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
		customContentDetails?.title ||
		(currentParty?.media_type === "youtube" ? "YouTube video" : undefined);
	const remoteStreamEntries = Object.entries(remoteStreams);

	// Filter out the screen sharer from small video panels when viewing their screen
	const filteredRemoteStreams = activeScreenShare && !isSharingScreen
		? remoteStreamEntries.filter(([peerId]) => peerId !== activeScreenShare.sid)
		: remoteStreamEntries;

	const showEmbeddedPlayer = streamingUrl && selectedSource.id !== "trailer";
	const remoteScreenShareStream = activeScreenShare
		? remoteStreams[activeScreenShare.sid]
		: null;

	// Room-level actions (content switching, invite, share, delete) - these
	// stay exactly as they were, just handed to WatchPartyRoom as a slot
	// instead of being inlined into a hand-rolled header. Playback-specific
	// controls (play/pause, source picker) moved into WatchPartyPlayer's own
	// overlaid control bar, matching the redesign's two-layer structure.
	const headerActions = (
		<>
			{isHost && (
				<Dialog open={changeContentDialogOpen} onOpenChange={setChangeContentDialogOpen}>
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
							<DialogTitle className="text-lg md:text-xl">Change What's Playing</DialogTitle>
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
								<button
									type="button"
									onClick={() => {
										setCreateContentTab("custom");
										if (customContentList.length === 0) fetchCustomContent();
									}}
									className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
										createContentTab === "custom"
											? "bg-[#7C3AED] text-white"
											: "text-[#A1A1AA] hover:text-white"
									}`}>
									My Uploads
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
							) : createContentTab === "custom" ? (
								<div className="max-h-60 overflow-y-auto space-y-2">
									{customContentList.length === 0 ? (
										<p className="text-sm text-[#A1A1AA] text-center py-4">
											No uploads yet - add one from "My Uploads" first.
										</p>
									) : (
										customContentList.map((item) => (
											<div
												key={item.content_id}
												onClick={() => setSelectedCustomContent(item)}
												className={`flex items-center gap-2 md:gap-3 p-2 rounded-lg cursor-pointer transition-all ${
													selectedCustomContent?.content_id === item.content_id
														? "bg-[#7C3AED]/20 border border-[#7C3AED]"
														: "bg-white/5 hover:bg-white/10"
												}`}>
												{item.poster_url && (
													<img
														src={item.poster_url}
														alt={item.title}
														className="w-10 h-14 md:w-12 md:h-16 object-cover rounded flex-shrink-0"
													/>
												)}
												<p className="font-medium text-sm md:text-base truncate">{item.title}</p>
											</div>
										))
									)}
								</div>
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
										<Button onClick={searchMovies} variant="secondary" className="sm:flex-shrink-0">
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
															{(item.release_date || item.first_air_date)?.split("-")[0]}{" "}
															• {item.media_type === "tv" ? "TV Show" : "Movie"}
														</p>
													</div>
												</div>
											))}
										</div>
									)}
								</>
							)}

							<Button onClick={submitContentChange} className="w-full btn-primary">
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
							<DialogTitle className="text-lg md:text-xl">Invite Friends</DialogTitle>
						</DialogHeader>
						<div className="space-y-4 mt-4">
							<div className="bg-[#7C3AED]/10 border border-[#7C3AED]/20 rounded-lg p-3">
								<p className="text-xs md:text-sm text-[#A1A1AA]">
									💡 <span className="text-white">Tip:</span> Anyone with the{" "}
									<span className="text-[#7C3AED]">Copy Link</span> can join instantly, account or
									not. If your friend has a Flixzbox account, they'll also get a notification
									below.
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
							<Button onClick={sendInvite} className="w-full btn-primary text-sm md:text-base">
								Send Invitation
							</Button>
						</div>
					</DialogContent>
				</Dialog>
			)}

			{isHost && (
				<button
					onClick={deleteParty}
					data-testid="delete-party-btn"
					className="btn-secondary flex items-center gap-1 md:gap-2 px-2 md:px-3 py-2 text-sm bg-red-500/10 hover:bg-red-500/20 text-red-500 border-red-500/20"
					title="End watch party">
					<X className="w-3 h-3 md:w-4 md:h-4" />
					<span className="hidden sm:inline">End Party</span>
				</button>
			)}
		</>
	);

	const isHardSyncMedia = currentParty?.media_type === "youtube" || currentParty?.media_type === "custom";
	// Pre-start overlay (waiting-for-host / countdown) only applies to
	// hard-sync media that hasn't started yet - TMDB has no real readiness
	// signal and no way to guarantee a synchronized start, so it skips
	// straight to advisory playback same as always.
	const countdownPhase = !isHardSyncMedia
		? null
		: hasEverPlayed
		? null
		: watchParty.countdownSeconds !== null
		? "countdown"
		: "waiting";

	return (
		<>
			<WatchPartyRoom
				partyName={currentParty?.name}
				onBack={() => navigate("/watch-party")}
				headerActions={headerActions}
				isCreator={isHost}
				mediaType={currentParty?.media_type}
				title={title}
				backdropPath={
					movieDetails?.backdrop_path
						? `${IMAGE_BASE}original${movieDetails.backdrop_path}`
						: customContentDetails?.backdrop_url || null
				}
				isHost={isHost}
				isPlaying={watchParty.isPlaying}
				currentTime={watchParty.currentTime}
				isBuffering={isBuffering}
				onTogglePlayback={togglePlayback}
				youtubeContainerRef={youtubeContainerRef}
				youtubePlayerRef={youtubePlayerRef}
				customVideoRef={customVideoRef}
				customVideoUrl={customContentDetails?.video_url ? `${BACKEND_URL}${customContentDetails.video_url}` : null}
				onHostSeek={handleHostSeek}
				showEmbeddedPlayer={showEmbeddedPlayer}
				streamingUrl={streamingUrl}
				selectedSource={selectedSource}
				showSourcePicker={showSourcePicker}
				setShowSourcePicker={setShowSourcePicker}
				streamingSources={STREAMING_SOURCES}
				changeSource={changeSource}
				tryNextSource={tryNextSource}
				trailerKey={trailerKey}
				activeScreenShare={activeScreenShare}
				isSharingScreen={isSharingScreen}
				remoteScreenShareStream={remoteScreenShareStream}
				countdownOverlay={
					<WatchPartyCountdownOverlay
						phase={countdownPhase}
						countdownSeconds={watchParty.countdownSeconds}
						readyStatus={watchParty.readyStatus}
						hostName={currentParty?.host_name}
						isHost={isHost}
						onStartWatchParty={watchParty.startWatchParty}
					/>
				}
				isInCall={isInCall}
				onStartCall={startCall}
				onEndCall={endCall}
				localStream={localStream}
				localVideoRef={localVideoRef}
				isVideoEnabled={isVideoEnabled}
				onToggleVideo={toggleVideo}
				isAudioEnabled={isAudioEnabled}
				onToggleAudio={toggleAudio}
				onStartScreenShare={startScreenShare}
				onStopScreenShare={stopScreenShare}
				remoteStreamEntries={filteredRemoteStreams}
				peerNames={peerNames}
				peerMediaState={peerMediaState}
				identity={identity}
				participantCount={participants.length}
				isChatOpen={isChatOpen}
				setIsChatOpen={setIsChatOpen}
				messages={messages}
				chatRef={chatRef}
				newMessage={newMessage}
				setNewMessage={setNewMessage}
				onSendMessage={sendMessage}
			/>
		</>
	);
};

export default WatchPartyPage;
