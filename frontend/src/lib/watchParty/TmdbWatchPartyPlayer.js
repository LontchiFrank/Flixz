/** @format */

import { WatchPartyPlayerAdapter } from "./WatchPartyPlayerAdapter";

// Movie/TV content served through third-party embeds (vidsrc.xyz etc.) in a
// cross-origin iframe we don't own. There is no JS access to it at all - no
// play()/pause()/seek(), no currentTime - that's a platform wall, not a gap
// this adapter could close with more code. So: play/pause are local-only
// state flips (what driving the shared "is everyone roughly paused" toast
// needs), getCurrentTime is an estimate from elapsed wall-clock time since
// the last known position, and seek/setPlaybackRate are deliberate no-ops.
// This is the same honest, pre-existing behavior Watch Party has always had
// for this content type - just expressed through the adapter interface now.
export class TmdbWatchPartyPlayer extends WatchPartyPlayerAdapter {
	constructor() {
		super();
		this._playing = false;
		this._baseTime = 0;
		this._startedAtMs = null;
		this._ready = false;
	}

	async load() {
		this._playing = false;
		this._baseTime = 0;
		this._startedAtMs = null;
		this._ready = false;
	}

	/** Called by the iframe's onLoad - this is the only readiness signal available. */
	markReady() {
		this._ready = true;
	}

	async play() {
		if (!this._playing) {
			this._playing = true;
			this._startedAtMs = Date.now();
		}
	}

	pause() {
		if (this._playing) {
			this._baseTime = this.getCurrentTime();
		}
		this._playing = false;
		this._startedAtMs = null;
	}

	seek(position) {
		this._baseTime = position;
		this._startedAtMs = this._playing ? Date.now() : null;
	}

	getCurrentTime() {
		if (this._playing && this._startedAtMs) {
			return this._baseTime + (Date.now() - this._startedAtMs) / 1000;
		}
		return this._baseTime;
	}

	getDuration() {
		return 0; // genuinely unknown - no API access to the embed
	}

	getPlaybackState() {
		return this._playing ? "playing" : "paused";
	}

	setPlaybackRate() {
		// no-op: nothing to actually speed up/slow down
	}

	isReady() {
		return this._ready;
	}

	supportsHardSync() {
		return false;
	}
}
