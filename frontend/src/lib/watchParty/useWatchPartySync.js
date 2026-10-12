/** @format */

import { useEffect, useRef, useState, useCallback } from "react";
import { WatchPartySyncEngine } from "./WatchPartySyncEngine";

const GO_DISPLAY_MS = 800;

// Thin React wiring around WatchPartySyncEngine: owns one stable engine
// instance, subscribes it to the given socket's events, and exposes the
// bits a component actually needs to render (playback state, countdown
// number, ready status) plus the host action methods. The engine itself
// stays plain JS so it isn't tangled up with React's render cycle.
export function useWatchPartySync({ socket, roomId, isHost }) {
	const engineRef = useRef(null);
	if (!engineRef.current) {
		engineRef.current = new WatchPartySyncEngine({ socket, roomId });
	}
	const engine = engineRef.current;

	const [isPlaying, setIsPlaying] = useState(false);
	// Raw synced position + the server timestamp it was valid at - an anchor
	// point for the TMDB adapter's elapsed-time ticker, NOT a per-frame
	// value (the real adapters are polled directly for smooth display; see
	// WatchPartyPlayer.jsx).
	const [currentTime, setCurrentTime] = useState(0);
	const [syncedAtServerMs, setSyncedAtServerMs] = useState(null);
	const [countdownSeconds, setCountdownSeconds] = useState(null); // null | 3|2|1|0("GO")
	const [readyStatus, setReadyStatus] = useState({ ready_count: 0, total_count: 0 });
	const [rejectedReason, setRejectedReason] = useState(null);
	const [lastSyncUserName, setLastSyncUserName] = useState(null);
	const countdownIntervalRef = useRef(null);
	const goTimeoutRef = useRef(null);

	useEffect(() => {
		engine.roomId = roomId;
	}, [engine, roomId]);

	useEffect(() => {
		engine.setIsHost(isHost);
	}, [engine, isHost]);

	useEffect(() => {
		engine.setSocket(socket);
		if (!socket) return;

		const onSyncState = (data) => {
			setIsPlaying(!!data.is_playing);
			setCurrentTime(data.current_time || 0);
			setSyncedAtServerMs((data.server_now || 0) * 1000);
			if (data.user_name) setLastSyncUserName(data.user_name);
			engine.handleSyncState(data);
		};
		const onCountdownStarted = (data) => {
			engine.handleCountdownStarted(data);
		};
		const onMediaChanged = (data) => {
			engine.handleMediaChanged(data);
		};
		const onParticipantReady = (data) => {
			setReadyStatus(data);
			engine.handleParticipantReady(data);
		};
		const onRejected = (data) => {
			setRejectedReason(data.reason);
			engine.handleHostCommandRejected(data);
		};

		socket.on("sync_state", onSyncState);
		socket.on("countdown_started", onCountdownStarted);
		socket.on("media_changed", onMediaChanged);
		socket.on("participant_ready", onParticipantReady);
		socket.on("host_command_rejected", onRejected);

		return () => {
			socket.off("sync_state", onSyncState);
			socket.off("countdown_started", onCountdownStarted);
			socket.off("media_changed", onMediaChanged);
			socket.off("participant_ready", onParticipantReady);
			socket.off("host_command_rejected", onRejected);
		};
	}, [engine, socket]);

	// Drive the visible countdown number from the engine's clock-offset-
	// corrected target timestamp, not a naive per-client setTimeout chain -
	// every participant's "3 2 1 GO" lands on the same wall-clock moment
	// regardless of their individual latency.
	useEffect(() => {
		const unsub = engine.on("countdown", ({ localStartAtMs }) => {
			if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
			if (goTimeoutRef.current) clearTimeout(goTimeoutRef.current);

			const tick = () => {
				const remaining = (localStartAtMs - Date.now()) / 1000;
				if (remaining <= 0) {
					clearInterval(countdownIntervalRef.current);
					setCountdownSeconds(0); // "GO!"
					goTimeoutRef.current = setTimeout(() => setCountdownSeconds(null), GO_DISPLAY_MS);
				} else {
					setCountdownSeconds(Math.ceil(remaining));
				}
			};
			tick();
			countdownIntervalRef.current = setInterval(tick, 100);
		});
		return () => {
			unsub();
			if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
			if (goTimeoutRef.current) clearTimeout(goTimeoutRef.current);
		};
	}, [engine]);

	useEffect(() => () => engine.destroy(), [engine]);

	const setAdapter = useCallback((adapter) => engine.setAdapter(adapter), [engine]);

	const notifyLocalStateChange = useCallback(
		(state) => engine.notifyLocalStateChange(state),
		[engine]
	);

	return {
		engine,
		isPlaying,
		currentTime,
		syncedAtServerMs,
		countdownSeconds,
		readyStatus,
		rejectedReason,
		lastSyncUserName,
		setAdapter,
		notifyLocalStateChange,
		hostPlay: () => engine.hostPlay(),
		hostPause: () => engine.hostPause(),
		hostSeek: (t) => engine.hostSeek(t),
		hostRestart: () => engine.hostRestart(),
		hostChangeMedia: (source) => engine.hostChangeMedia(source),
		startWatchParty: () => engine.startWatchParty(),
		reportReady: () => engine.reportReady(),
		hostHeartbeat: () => engine.hostHeartbeat(),
		on: (event, cb) => engine.on(event, cb),
	};
}
