/** @format */

import React, { useState, useEffect, useRef, useCallback } from "react";
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

const WatchPartyPage = () => {
	const { roomId } = useParams();
	const navigate = useNavigate();
	const { user, token, getAuthHeaders } = useAuth();

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

	// Video call state
	const [isInCall, setIsInCall] = useState(false);
	const [localStream, setLocalStream] = useState(null);
	const [remoteStreams, setRemoteStreams] = useState({});
	const [isVideoEnabled, setIsVideoEnabled] = useState(true);
	const [isAudioEnabled, setIsAudioEnabled] = useState(true);
	const [isVideoFullscreen, setIsVideoFullscreen] = useState(false);

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
					"streams:",
					event.streams.length
				);
				if (event.streams && event.streams[0]) {
					setRemoteStreams((prev) => ({
						...prev,
						[peerId]: event.streams[0],
					}));
				}
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

		// Close peer connections
		Object.values(peerConnectionsRef.current).forEach((pc) => pc.close());
		peerConnectionsRef.current = {};

		// Clear remote streams
		setRemoteStreams({});
		setIsInCall(false);

		// Notify server
		socketRef.current?.emit("webrtc_leave", { room_id: roomId });
	}, [localStream, roomId]);

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

	const fetchPartyDetails = useCallback(async () => {
		setLoading(true);
		try {
			console.log("=== Starting Watch Party Load ===");
			console.log("Room ID:", roomId);
			console.log("User:", user);
			console.log("Token:", token);
			console.log("Auth Headers:", getAuthHeaders());
			console.log("Cookies:", document.cookie);

			// Verify user is authenticated
			if (!user) {
				console.error("❌ No user found, redirecting to login");
				toast.error("Please log in to join the watch party");
				navigate(
					"/login?redirect=" + encodeURIComponent(`/watch-party/${roomId}`)
				);
				return;
			}

			// Get party details
			console.log("Step 1: Fetching party details...");
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

			// Fetch movie details
			const endpoint = res.data.media_type === "movie" ? "movies" : "tv";
			console.log(
				`Step 2: Fetching ${endpoint} details for ID:`,
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

			// Join party
			console.log("Step 3: Joining party...");
			console.log("Sending auth headers:", getAuthHeaders());
			console.log("User object:", user);

			const joinRes = await axios.post(
				`${API}/watch-party/${roomId}/join`,
				{},
				{
					headers: getAuthHeaders(),
					withCredentials: true,
				}
			);
			console.log("✅ Successfully joined party:", joinRes.data);
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
	}, [roomId, user, token, getAuthHeaders, navigate]);

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
				user_name: user?.name || "Anonymous",
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
			toast.success(`${data.user_name} joined the party`);
			setParticipants((prev) => [...prev, { name: data.user_name }]);
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
			if (data.user_name && data.user_name !== user?.name) {
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
	}, [roomId, user, createPeerConnection, handleOffer, navigate]);

	useEffect(() => {
		if (roomId) {
			fetchPartyDetails();
			connectSocket();
		} else {
			fetchParties();
		}

		return () => {
			if (socketRef.current) {
				socketRef.current.disconnect();
			}
			endCall();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [roomId]);

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
				currentParty?.host_id === user?.user_id ||
				currentParty?.host_name === user?.name;

			if (isHost && socketRef.current) {
				socketRef.current.emit("position_update", {
					room_id: roomId,
					current_time: estimatedTime,
					is_playing: true,
					user_name: user?.name,
				});
			}
		}, 2000); // Broadcast every 2 seconds

		return () => clearInterval(interval);
	}, [isPlaying, currentTime, roomId, currentParty, user]);

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
					user_name: user?.name,
				});
				lastSyncTimeRef.current = now;
				playbackStartTimeRef.current = now; // Reset the start time
			}
		}
	}, [currentTime, isPlaying, roomId, user]);

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
				user_id: user?.user_id,
				user_name: user?.name,
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
		};

		document.addEventListener("fullscreenchange", handleFullscreenChange);
		return () => {
			document.removeEventListener("fullscreenchange", handleFullscreenChange);
		};
	}, []);

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
		if (!selectedMovie || !partyName.trim()) {
			toast.error("Please select a movie and enter a party name");
			return;
		}

		try {
			console.log("Creating party with:", {
				name: partyName,
				movie_id: selectedMovie.id,
				media_type: selectedMovie.media_type || "movie",
			});

			const res = await axios.post(
				`${API}/watch-party`,
				{
					name: partyName,
					movie_id: selectedMovie.id,
					media_type: selectedMovie.media_type || "movie",
				},
				{
					headers: getAuthHeaders(),
					withCredentials: true,
				}
			);

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
			user_name: user?.name,
		});
		toast.success(newState ? "▶️ Resumed playback" : "⏸️ Paused playback");
	};

	const sendMessage = (e) => {
		e.preventDefault();
		if (!newMessage.trim()) return;

		socketRef.current?.emit("chat_message", {
			room_id: roomId,
			message: newMessage,
			user_name: user?.name || "Anonymous",
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
		const text = `Join my watch party on Flixzbox! We're watching ${
			movieDetails?.title || movieDetails?.name
		}`;

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
				user_name: user?.name,
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
			user_name: user?.name,
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
			user_name: user?.name,
		});

		toast.success(`Switched to ${source.name}`);
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

									<Button
										onClick={createParty}
										disabled={!selectedMovie || !partyName.trim()}
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
								No active parties
							</h3>
							<p className="text-sm md:text-base text-[#A1A1AA]">
								Create a watch party to get started
							</p>
						</div>
					)}
				</div>
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
	const title = movieDetails?.title || movieDetails?.name;
	const remoteStreamEntries = Object.entries(remoteStreams);
	const showEmbeddedPlayer = streamingUrl && selectedSource.id !== "trailer";
	const isCreator =
		currentParty?.host_id === user?.user_id ||
		currentParty?.host_name === user?.name;

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
					<div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
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

						{/* Source Selector */}
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

						{/* Invite Dialog */}
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
											💡 <span className="text-white">Tip:</span> If your friend
											has a Flixzbox account, they'll receive a notification.
											Otherwise, use the{" "}
											<span className="text-[#7C3AED]">Copy Link</span> button
											to share directly!
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
					{/* Embedded Streaming Player (default) */}
					{showEmbeddedPlayer ? (
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

					{/* Picture-in-Picture Video Overlay (Your Video) */}
					{isInCall && (
						<div
							className={`absolute ${
								isVideoFullscreen
									? "bottom-6 right-4 w-40 h-32 sm:w-48 sm:h-36 md:w-56 md:h-40"
									: "bottom-24 md:bottom-20 right-3 md:right-4 w-32 h-24 sm:w-40 sm:h-32 md:w-48 md:h-36"
							} rounded-lg overflow-hidden border-2 border-[#7C3AED] shadow-2xl bg-[#121212]`}
							style={{ zIndex: 2147483647 }}>
							{localStream ? (
								<>
									<video
										ref={localVideoRef}
										muted
										playsInline
										controls={false}
										className="w-full h-full object-cover bg-black"
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
												{user?.name?.charAt(0).toUpperCase()}
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

					{/* Remote Participant Videos Overlay */}
					{isInCall && remoteStreamEntries.length > 0 && (
						<div
							className={`absolute ${
								isVideoFullscreen
									? "top-6 right-4"
									: "top-16 md:top-20 right-3 md:right-4"
							} space-y-2`}
							style={{ zIndex: 2147483647 }}>
							{remoteStreamEntries.slice(0, 3).map(([peerId, stream]) => (
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
													el.srcObject = stream;
													el.play().catch((err) => {
														console.log("Remote video play error:", err.name);
													});
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
							{remoteStreamEntries.length > 3 && (
								<div
									className={`${
										isVideoFullscreen
											? "w-40 h-10 sm:w-48 sm:h-12 md:w-56 md:h-12"
											: "w-32 h-10 sm:w-40 sm:h-10 md:w-48 md:h-12"
									} rounded-lg bg-black/80 flex items-center justify-center text-xs sm:text-sm`}>
									+{remoteStreamEntries.length - 3} more
								</div>
							)}
						</div>
					)}

					{/* Fullscreen toggle */}
					<button
						onClick={toggleFullscreen}
						className="absolute top-3 right-3 md:top-4 md:right-4 w-9 h-9 md:w-10 md:h-10 rounded-full bg-black/50 flex items-center justify-center hover:bg-black/70 transition-all"
						style={{ zIndex: 2147483646 }}
						title={isVideoFullscreen ? "Exit fullscreen" : "Enter fullscreen"}>
						{isVideoFullscreen ? (
							<Minimize2 className="w-4 h-4 md:w-5 md:h-5" />
						) : (
							<Maximize2 className="w-4 h-4 md:w-5 md:h-5" />
						)}
					</button>

					{/* Current source indicator - positioned to avoid blocking video controls */}
					<div
						className="absolute top-3 left-3 md:top-4 md:left-4 px-2 py-1 md:px-3 md:py-1.5 rounded-full bg-black/70 backdrop-blur-sm text-xs md:text-sm flex items-center gap-1 md:gap-2"
						style={{ zIndex: 10 }}>
						<Server className="w-3 h-3 md:w-4 md:h-4 text-[#7C3AED]" />
						<span className="hidden sm:inline">{selectedSource.name}</span>
					</div>
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
