/** @format */

// Common interface every media adapter implements, so WatchPartySyncEngine
// never has to know or care whether it's driving a YouTube video, an
// uploaded file, or a third-party movie embed. Subclasses override what
// they can genuinely support; unsupported operations are safe no-ops
// (documented per-method in each adapter) rather than throwing, since a
// best-effort adapter (Tmdb) legitimately can't implement several of these.
export class WatchPartyPlayerAdapter {
	/** @param {any} source - adapter-specific (videoId, content url, etc.) */
	async load(source) {} // eslint-disable-line no-unused-vars

	async play() {}

	pause() {}

	/** @param {number} position - seconds */
	seek(position) {} // eslint-disable-line no-unused-vars

	/** @returns {number} seconds */
	getCurrentTime() {
		return 0;
	}

	/** @returns {number} seconds, 0 if unknown */
	getDuration() {
		return 0;
	}

	/** @returns {"unstarted"|"playing"|"paused"|"buffering"|"ended"} */
	getPlaybackState() {
		return "unstarted";
	}

	/** @param {number} rate */
	setPlaybackRate(rate) {} // eslint-disable-line no-unused-vars

	/** @returns {boolean} */
	isReady() {
		return false;
	}

	/** Whether seek()/setPlaybackRate() actually do anything real. */
	supportsHardSync() {
		return false;
	}

	destroy() {}
}
