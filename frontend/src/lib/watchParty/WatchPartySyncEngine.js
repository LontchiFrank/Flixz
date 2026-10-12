/** @format */

// Plain JS, not React-coupled - translates host intents into socket emits,
// applies server-authoritative sync_state to whichever adapter is active,
// and runs the countdown's clock-offset-corrected timing. A thin React hook
// (useWatchPartySync) wires this to a component; this class itself knows
// nothing about React.

const DRIFT_IGNORE_SECONDS = 1.5;
const DRIFT_NUDGE_MAX_SECONDS = 5;
const NUDGE_RATE = 1.1;
const NUDGE_DURATION_MS = 3000;

export class WatchPartySyncEngine {
	constructor({ socket, roomId }) {
		this.socket = socket;
		this.roomId = roomId;
		this.adapter = null;
		this._isHost = false;
		this._clockOffsetMs = 0; // serverNow - localNow, from the most recent timestamped message
		this._lastSyncState = null;
		this._nudgeTimeout = null;
		this._listeners = {};
	}

	// --- adapter / role wiring (called by the React hook on relevant changes) ---

	// Callers should only hand over an adapter once it reports isReady() -
	// e.g. construct the YT.Player, call setAdapter() from inside its own
	// onReady, not before. That invariant means _applyAuthoritative never
	// has to separately worry about "adapter exists but isn't ready yet".
	// If a sync_state arrived before the adapter existed at all, it's
	// already stashed in _lastSyncState - reapply it now so nothing is lost
	// to that race.
	setAdapter(adapter) {
		this._clearNudge();
		this.adapter = adapter;
		if (adapter && this._lastSyncState) {
			this._applyAuthoritative(this._lastSyncState);
		}
	}

	setIsHost(isHost) {
		this._isHost = !!isHost;
	}

	setSocket(socket) {
		this.socket = socket;
	}

	// --- simple pub/sub for the React layer ---

	on(event, cb) {
		(this._listeners[event] ||= new Set()).add(cb);
		return () => this._listeners[event]?.delete(cb);
	}

	_emit(event, payload) {
		this._listeners[event]?.forEach((cb) => cb(payload));
	}

	// --- host intents - only meaningful when setIsHost(true); the UI is
	// responsible for not exposing these to non-hosts, and the server
	// independently rejects them regardless of what the UI allows.
	//
	// These drive the host's OWN adapter directly (optimistic, immediate) as
	// well as emitting to the server: _applyAuthoritative deliberately skips
	// applying incoming sync_state back onto the host's own client ("the
	// host is the source of truth, don't fight itself"), so if these only
	// emitted and waited for the round-trip, the host's own player would
	// never actually be told to do anything. ---

	hostPlay() {
		this.adapter?.play();
		this.socket?.emit("host_play", {
			room_id: this.roomId,
			current_time: this.adapter?.getCurrentTime(),
		});
	}

	hostPause() {
		this.adapter?.pause();
		this.socket?.emit("host_pause", {
			room_id: this.roomId,
			current_time: this.adapter?.getCurrentTime(),
		});
	}

	hostSeek(time) {
		this.adapter?.seek(time);
		this.socket?.emit("host_seek", { room_id: this.roomId, current_time: time });
	}

	hostRestart() {
		this.adapter?.seek(0);
		this.adapter?.play();
		this.socket?.emit("host_restart", { room_id: this.roomId });
	}

	hostChangeMedia(source) {
		this.socket?.emit("host_change_media", { room_id: this.roomId, ...source });
	}

	startWatchParty() {
		this.socket?.emit("start_watch_party", { room_id: this.roomId });
	}

	reportReady() {
		this.socket?.emit("player_ready", { room_id: this.roomId });
	}

	// Periodic position heartbeat so drift correction has fresh data to work
	// from even when nothing else triggers a sync_state broadcast. Host-only
	// in practice (the hook only calls this when isHost), reuses host_seek's
	// server-side handling since "set the authoritative position" is exactly
	// what a heartbeat needs - no separate event required.
	hostHeartbeat() {
		if (!this.adapter) return;
		this.socket?.emit("host_seek", {
			room_id: this.roomId,
			current_time: this.adapter.getCurrentTime(),
		});
	}

	// --- inbound server events (wired by the hook's socket.on calls) ---

	handleSyncState(data) {
		this._updateClockOffset(data.server_now);
		this._lastSyncState = data;
		this._emit("stateChange", data);
		this._applyAuthoritative(data);
	}

	handleCountdownStarted(data) {
		this._updateClockOffset(data.server_now);
		const localStartAtMs = data.start_at * 1000 - this._clockOffsetMs;
		this._emit("countdown", { localStartAtMs });

		// Every client - host included - needs its own adapter to actually
		// start playing at this precise synchronized instant, not whenever
		// the next sync_state heartbeat happens to arrive (which could lag a
		// couple seconds) and not relying on _applyAuthoritative, which
		// deliberately skips the host's own client.
		if (this._countdownPlayTimeout) clearTimeout(this._countdownPlayTimeout);
		const delay = Math.max(0, localStartAtMs - Date.now());
		this._countdownPlayTimeout = setTimeout(() => {
			this.adapter?.seek(0);
			this.adapter?.play();
		}, delay);
	}

	handleMediaChanged(data) {
		this._emit("mediaChanged", data);
	}

	handleParticipantReady(data) {
		this._emit("readyStatus", data);
	}

	handleHostCommandRejected(data) {
		this._emit("rejected", data);
	}

	// A participant interacted directly with the underlying player's own
	// chrome (native YouTube controls, native <video> controls). If this
	// client IS the host, that's a legitimate action - make it authoritative.
	// If not, it must NOT become authoritative: snap back to the last known
	// server state instead, matching the spec's explicit requirement that
	// only host-generated commands may change room state.
	notifyLocalStateChange({ isPlaying, currentTime }) {
		// Calling adapter.play()/pause()/seek() ourselves (below, in
		// _applyAuthoritative) still fires the underlying player's own native
		// state-change event - without this guard that echo would come back
		// through here and get (re)broadcast as if a real local interaction
		// happened, which is exactly the loop this flag exists to prevent.
		if (this._applying) return;
		if (this._isHost) {
			if (isPlaying) {
				this.socket?.emit("host_play", { room_id: this.roomId, current_time: currentTime });
			} else {
				this.socket?.emit("host_pause", { room_id: this.roomId, current_time: currentTime });
			}
			return;
		}
		if (this._lastSyncState) this._applyAuthoritative(this._lastSyncState);
	}

	destroy() {
		this._clearNudge();
		if (this._applyingTimeout) clearTimeout(this._applyingTimeout);
		if (this._countdownPlayTimeout) clearTimeout(this._countdownPlayTimeout);
		this._listeners = {};
	}

	// --- internals ---

	_updateClockOffset(serverNowSeconds) {
		if (typeof serverNowSeconds === "number") {
			this._clockOffsetMs = serverNowSeconds * 1000 - Date.now();
		}
	}

	_applyAuthoritative(data) {
		if (!this.adapter || this._isHost) return; // the host's own client IS the source of truth

		const nowServerMs = Date.now() + this._clockOffsetMs;
		const elapsed = data.is_playing
			? Math.max(0, (nowServerMs - data.server_now * 1000) / 1000)
			: 0;
		const expected = data.current_time + elapsed;
		const actual = this.adapter.getCurrentTime();

		this._applying = true;
		if (this._applyingTimeout) clearTimeout(this._applyingTimeout);
		this._applyingTimeout = setTimeout(() => {
			this._applying = false;
		}, 500);

		const currentState = this.adapter.getPlaybackState();
		if (data.is_playing && currentState !== "playing") {
			this.adapter.play();
		} else if (!data.is_playing && currentState === "playing") {
			this.adapter.pause();
		}

		if (!this.adapter.supportsHardSync()) return; // Tmdb: nothing more can genuinely be corrected

		const diff = Math.abs(expected - actual);
		if (diff < DRIFT_IGNORE_SECONDS) {
			this._clearNudge();
		} else if (diff < DRIFT_NUDGE_MAX_SECONDS) {
			this._nudge(expected > actual);
		} else {
			this._clearNudge();
			this.adapter.seek(expected);
		}
	}

	_nudge(speedUp) {
		this.adapter?.setPlaybackRate(speedUp ? NUDGE_RATE : 1 / NUDGE_RATE);
		if (this._nudgeTimeout) clearTimeout(this._nudgeTimeout);
		this._nudgeTimeout = setTimeout(() => this._clearNudge(), NUDGE_DURATION_MS);
	}

	_clearNudge() {
		if (this._nudgeTimeout) {
			clearTimeout(this._nudgeTimeout);
			this._nudgeTimeout = null;
		}
		this.adapter?.setPlaybackRate(1);
	}
}
