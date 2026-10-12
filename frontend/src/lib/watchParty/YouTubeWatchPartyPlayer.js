/** @format */

import { WatchPartyPlayerAdapter } from "./WatchPartyPlayerAdapter";

// Wraps a ref to a YT.Player instance (construction/teardown of the actual
// player stays in the component that owns the IFrame API script loading and
// the DOM container - this adapter only ever calls methods on an already-
// constructed player, same underlying API the page already used directly
// before this refactor).
export class YouTubeWatchPartyPlayer extends WatchPartyPlayerAdapter {
	constructor(playerRef) {
		super();
		this.playerRef = playerRef;
	}

	async load(videoId) {
		this.playerRef.current?.loadVideoById?.(videoId);
	}

	async play() {
		this.playerRef.current?.playVideo?.();
	}

	pause() {
		this.playerRef.current?.pauseVideo?.();
	}

	seek(position) {
		this.playerRef.current?.seekTo?.(position, true);
	}

	getCurrentTime() {
		return this.playerRef.current?.getCurrentTime?.() || 0;
	}

	getDuration() {
		return this.playerRef.current?.getDuration?.() || 0;
	}

	getPlaybackState() {
		const player = this.playerRef.current;
		const YT = window.YT;
		if (!player?.getPlayerState || !YT) return "unstarted";
		switch (player.getPlayerState()) {
			case YT.PlayerState.PLAYING:
				return "playing";
			case YT.PlayerState.PAUSED:
				return "paused";
			case YT.PlayerState.BUFFERING:
				return "buffering";
			case YT.PlayerState.ENDED:
				return "ended";
			default:
				return "unstarted";
		}
	}

	setPlaybackRate(rate) {
		this.playerRef.current?.setPlaybackRate?.(rate);
	}

	isReady() {
		return typeof this.playerRef.current?.getCurrentTime === "function";
	}

	supportsHardSync() {
		return true;
	}
}
