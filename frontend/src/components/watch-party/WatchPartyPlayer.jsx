/** @format */

import React, { useEffect, useRef, useState } from "react";
import {
	Play,
	Pause,
	Volume2,
	VolumeX,
	Maximize2,
	Minimize2,
	Loader2,
	Film,
	RefreshCw,
	Server,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Z } from "./zIndex";

const formatTime = (seconds) => {
	if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.floor(seconds % 60);
	const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
	const ss = String(s).padStart(2, "0");
	return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

// The "Layer 1" cinematic movie screen: renders whichever content the party
// is actually playing (YouTube via the existing YT.Player instance, a
// vidsrc-style embed, a trailer fallback, or someone's screen share) and
// overlays a branded control bar on top of it. All playback STATE and the
// YouTube Player API instance itself still live in WatchPartyPage.jsx -
// this component only calls methods on the player it's handed and reflects
// state it's given; it owns no sync logic of its own.
const WatchPartyPlayer = ({
	mediaType, // "movie" | "tv" | "youtube"
	title,
	backdropPath,
	isPlaying,
	currentTime,
	isBuffering,
	onTogglePlayback,
	// YouTube
	youtubeContainerRef,
	youtubePlayerRef,
	onYoutubeSeek,
	// Movie/TV embed
	showEmbeddedPlayer,
	streamingUrl,
	selectedSource,
	showSourcePicker,
	setShowSourcePicker,
	streamingSources,
	changeSource,
	tryNextSource,
	trailerKey,
	// Screen share
	activeScreenShare,
	isSharingScreen,
	remoteScreenShareStream,
	// Fullscreen (presentation only - WatchPartyRoom owns the actual API call)
	isFullscreen,
	onToggleFullscreen,
	controlsVisible = true,
}) => {
	const isYoutube = mediaType === "youtube";
	const [iframeLoaded, setIframeLoaded] = useState(false);
	const [volume, setVolume] = useState(100);
	const [isMuted, setIsMuted] = useState(false);
	const [progress, setProgress] = useState({ time: 0, duration: 0 });
	const [isScrubbing, setIsScrubbing] = useState(false);
	const [scrubTime, setScrubTime] = useState(0);
	const progressBarRef = useRef(null);

	// Reset the iframe-loaded flag whenever the actual embed URL changes
	useEffect(() => {
		setIframeLoaded(false);
	}, [streamingUrl]);

	// Poll the real YouTube player for smooth progress - the shared
	// `currentTime` prop only updates on sync events (~every 2s / on
	// play/pause/seek), too coarse for a smooth scrubber.
	useEffect(() => {
		if (!isYoutube) return;
		const tick = () => {
			const player = youtubePlayerRef.current;
			if (player?.getCurrentTime && !isScrubbing) {
				setProgress({
					time: player.getCurrentTime() || 0,
					duration: player.getDuration() || 0,
				});
			}
		};
		tick();
		const id = setInterval(tick, 250);
		return () => clearInterval(id);
	}, [isYoutube, youtubePlayerRef, isScrubbing]);

	// Movie/TV elapsed-time ticker: estimate from the shared currentTime/
	// isPlaying props the same way the existing sync system already does,
	// just rendered locally - no new sync mechanics.
	const tickerAnchorRef = useRef({ time: currentTime, wallClock: Date.now() });
	const [tickerNow, setTickerNow] = useState(Date.now());
	useEffect(() => {
		tickerAnchorRef.current = { time: currentTime, wallClock: Date.now() };
	}, [currentTime, isPlaying]);
	useEffect(() => {
		if (isYoutube || !isPlaying) return;
		const id = setInterval(() => setTickerNow(Date.now()), 1000);
		return () => clearInterval(id);
	}, [isYoutube, isPlaying]);
	const tickerSeconds = isPlaying
		? tickerAnchorRef.current.time +
		  (tickerNow - tickerAnchorRef.current.wallClock) / 1000
		: currentTime;

	const handleVolumeChange = (next) => {
		setVolume(next);
		const player = youtubePlayerRef?.current;
		if (!player) return;
		player.setVolume(next);
		if (next === 0 && !isMuted) {
			player.mute();
			setIsMuted(true);
		} else if (next > 0 && isMuted) {
			player.unMute();
			setIsMuted(false);
		}
	};

	const toggleMute = () => {
		const player = youtubePlayerRef?.current;
		if (!player) return;
		if (isMuted) {
			player.unMute();
			setIsMuted(false);
		} else {
			player.mute();
			setIsMuted(true);
		}
	};

	const seekFromClientX = (clientX) => {
		const bar = progressBarRef.current;
		if (!bar || !progress.duration) return 0;
		const rect = bar.getBoundingClientRect();
		const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
		return ratio * progress.duration;
	};

	const handleScrubStart = (e) => {
		if (!isYoutube) return;
		setIsScrubbing(true);
		setScrubTime(seekFromClientX(e.clientX));
	};
	const handleScrubMove = (e) => {
		if (!isScrubbing) return;
		setScrubTime(seekFromClientX(e.clientX));
	};
	const handleScrubEnd = () => {
		if (!isScrubbing) return;
		setIsScrubbing(false);
		youtubePlayerRef?.current?.seekTo(scrubTime, true);
		onYoutubeSeek?.(scrubTime);
	};

	const displayTime = isScrubbing ? scrubTime : progress.time;

	const renderContent = () => {
		if (isYoutube) {
			return (
				<div
					ref={youtubeContainerRef}
					className="w-full h-full min-h-[250px] md:min-h-[400px] overflow-hidden relative"
				/>
			);
		}
		if (showEmbeddedPlayer) {
			return (
				<>
					<iframe
						src={streamingUrl}
						onLoad={() => setIframeLoaded(true)}
						className="w-full h-full min-h-[250px] md:min-h-[400px]"
						allowFullScreen
						allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
					/>
					{!iframeLoaded && (
						<div className="absolute inset-0 flex items-center justify-center bg-black/60 pointer-events-none">
							<Loader2 className="w-8 h-8 animate-spin text-[#7C3AED]" />
						</div>
					)}
				</>
			);
		}
		if (trailerKey && selectedSource?.id === "trailer") {
			return (
				<iframe
					src={`https://www.youtube.com/embed/${trailerKey}?autoplay=0&controls=1`}
					className="w-full h-full min-h-[250px] md:min-h-[800px]"
					allowFullScreen
					allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
				/>
			);
		}
		return (
			<div className="w-full h-full min-h-[250px] md:min-h-[400px] flex items-center justify-center">
				{backdropPath && (
					<img
						src={backdropPath}
						alt={title}
						className="absolute inset-0 w-full h-full object-cover opacity-30"
					/>
				)}
				<div className="relative text-center p-4 md:p-6">
					<div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-[#7C3AED]/20 flex items-center justify-center mb-3 md:mb-4 mx-auto">
						<Film className="w-8 h-8 md:w-10 md:h-10 text-[#7C3AED]" />
					</div>
					<h3 className="text-lg md:text-xl font-bold mb-2">Select a Streaming Source</h3>
					<p className="text-sm md:text-base text-[#A1A1AA] mb-4 max-w-md mx-auto px-2">
						Click the source picker below to choose a streaming source, or click
						"Try Next" to automatically cycle through sources.
					</p>
					<button
						onClick={tryNextSource}
						className="btn-primary flex items-center gap-2 mx-auto text-sm md:text-base">
						<RefreshCw className="w-4 h-4 md:w-5 md:h-5" />
						Try First Source
					</button>
				</div>
			</div>
		);
	};

	// Viewing someone else's screen share takes over the whole player area
	if (activeScreenShare && !isSharingScreen && remoteScreenShareStream) {
		return (
			<div className="relative w-full h-full bg-black flex items-center justify-center">
				<div className="absolute top-4 left-4 z-20 px-4 py-2 bg-green-500/90 backdrop-blur-sm rounded-full text-white text-sm font-medium flex items-center gap-2">
					<div className="w-2 h-2 bg-white rounded-full animate-pulse" />
					{activeScreenShare.name} is sharing their screen
				</div>
				<video
					autoPlay
					playsInline
					className="w-full h-full object-contain"
					ref={(el) => {
						if (el && remoteScreenShareStream && el.srcObject !== remoteScreenShareStream) {
							el.srcObject = remoteScreenShareStream;
							el.muted = false;
							el.play().catch(() => {});
						}
					}}
				/>
			</div>
		);
	}

	return (
		<div className="relative w-full h-full bg-black group">
			{isSharingScreen && (
				<div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-4 py-2 bg-green-500/90 backdrop-blur-sm rounded-full text-white text-sm font-medium flex items-center gap-2">
					<div className="w-2 h-2 bg-white rounded-full animate-pulse" />
					You are sharing your screen
				</div>
			)}

			{renderContent()}

			{isYoutube && isBuffering && (
				<div className="absolute inset-0 flex items-center justify-center pointer-events-none">
					<Loader2 className="w-10 h-10 animate-spin text-[#7C3AED]" />
				</div>
			)}

			{/* Title bar */}
			<div
				style={{ zIndex: Z.PLAYER_CHROME }}
				className={cn(
					"absolute top-0 left-0 right-0 p-3 md:p-4 bg-gradient-to-b from-black/70 to-transparent transition-opacity duration-300",
					controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
				)}>
				<h2 className="text-sm md:text-base font-semibold truncate drop-shadow">{title}</h2>
			</div>

			{/* Branded control bar */}
			<div
				style={{ zIndex: Z.PLAYER_CHROME }}
				className={cn(
					"absolute bottom-0 left-0 right-0 px-3 md:px-4 py-2 md:py-3 bg-gradient-to-t from-black/85 to-transparent transition-opacity duration-300",
					controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
				)}>
				{isYoutube ? (
					<div
						ref={progressBarRef}
						onPointerDown={handleScrubStart}
						onPointerMove={handleScrubMove}
						onPointerUp={handleScrubEnd}
						onPointerLeave={() => isScrubbing && handleScrubEnd()}
						className="relative h-1.5 mb-2 rounded-full bg-white/20 cursor-pointer group/bar">
						<div
							className="absolute inset-y-0 left-0 rounded-full bg-[#7C3AED]"
							style={{
								width: progress.duration
									? `${Math.min(100, (displayTime / progress.duration) * 100)}%`
									: "0%",
							}}
						/>
						<div
							className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-white opacity-0 group-hover/bar:opacity-100 transition-opacity"
							style={{
								left: progress.duration
									? `${Math.min(100, (displayTime / progress.duration) * 100)}%`
									: "0%",
							}}
						/>
					</div>
				) : (
					<div className="mb-2 text-xs text-[#A1A1AA]">{formatTime(tickerSeconds)} elapsed</div>
				)}

				<div className="flex items-center justify-between gap-2">
					<div className="flex items-center gap-2">
						<button
							onClick={onTogglePlayback}
							data-testid="player-toggle-playback-btn"
							className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all">
							{isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
						</button>

						{isYoutube ? (
							<>
								<span className="text-xs text-[#A1A1AA] hidden sm:inline">
									{formatTime(displayTime)} / {formatTime(progress.duration)}
								</span>
								<div className="hidden sm:flex items-center gap-1.5 group/vol">
									<button
										onClick={toggleMute}
										className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center">
										{isMuted || volume === 0 ? (
											<VolumeX className="w-4 h-4" />
										) : (
											<Volume2 className="w-4 h-4" />
										)}
									</button>
									<input
										type="range"
										min={0}
										max={100}
										value={isMuted ? 0 : volume}
										onChange={(e) => handleVolumeChange(Number(e.target.value))}
										className="w-16 accent-[#7C3AED]"
									/>
								</div>
							</>
						) : (
							<div className="relative">
								<button
									onClick={() => setShowSourcePicker(!showSourcePicker)}
									className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-xs">
									<Server className="w-3.5 h-3.5" />
									<span className="hidden sm:inline">{selectedSource?.name}</span>
								</button>
								{showSourcePicker && (
									<div
										style={{ zIndex: Z.DROPDOWN }}
										className="absolute left-0 bottom-full mb-2 bg-[#0A0A0A] border border-white/10 rounded-xl p-2 min-w-[200px] max-w-[280px] shadow-xl max-h-[260px] overflow-y-auto">
										{streamingSources?.map((source, index) => (
											<button
												key={source.id}
												onClick={() => changeSource(source, index)}
												className={cn(
													"w-full text-left px-3 py-2 rounded-lg text-sm transition-all",
													selectedSource?.id === source.id
														? "bg-[#7C3AED] text-white"
														: "hover:bg-white/5"
												)}>
												{source.name}
											</button>
										))}
									</div>
								)}
							</div>
						)}
					</div>

					<button
						onClick={onToggleFullscreen}
						title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
						className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all">
						{isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
					</button>
				</div>
			</div>
		</div>
	);
};

export default WatchPartyPlayer;
