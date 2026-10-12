/** @format */

import { WatchPartyPlayerAdapter } from "./WatchPartyPlayerAdapter";

// Self-hosted uploaded content (the existing custom_content feature - real
// MP4/WebM/etc. files served by our own backend) played through a plain
// HTML5 <video> element. Every method here is a genuine native call, not an
// estimate - same capability tier as YouTube. Wraps a React ref to the
// <video> element rather than owning it, mirroring the exact element
// pattern WatchPage.jsx already has working for this same content type.
export class CustomWatchPartyPlayer extends WatchPartyPlayerAdapter {
	constructor(videoRef) {
		super();
		this.videoRef = videoRef;
	}

	async load() {
		// src is set by React via the <video> element's src prop; nothing to
		// do here beyond waiting for isReady() to go true via loadedmetadata.
	}

	async play() {
		try {
			await this.videoRef.current?.play();
		} catch (err) {
			if (err.name !== "AbortError") console.error("Custom video play failed:", err);
		}
	}

	pause() {
		this.videoRef.current?.pause();
	}

	seek(position) {
		const el = this.videoRef.current;
		if (el) el.currentTime = position;
	}

	getCurrentTime() {
		return this.videoRef.current?.currentTime || 0;
	}

	getDuration() {
		const d = this.videoRef.current?.duration;
		return Number.isFinite(d) ? d : 0;
	}

	getPlaybackState() {
		const el = this.videoRef.current;
		if (!el) return "unstarted";
		if (el.ended) return "ended";
		if (el.seeking || el.readyState < 3) return "buffering";
		return el.paused ? "paused" : "playing";
	}

	setPlaybackRate(rate) {
		const el = this.videoRef.current;
		if (el) el.playbackRate = rate;
	}

	isReady() {
		const el = this.videoRef.current;
		return !!el && el.readyState >= 2; // HAVE_CURRENT_DATA or better
	}

	supportsHardSync() {
		return true;
	}
}
