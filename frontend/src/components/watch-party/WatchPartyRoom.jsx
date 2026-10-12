/** @format */

import React, { useEffect, useRef, useState, useCallback } from "react";
import { ChevronLeft } from "lucide-react";
import WatchPartyPlayer from "./WatchPartyPlayer";
import ParticipantVideoTile from "./ParticipantVideoTile";
import ParticipantVideoStrip from "./ParticipantVideoStrip";
import FloatingParticipantLayer from "./FloatingParticipantLayer";
import WatchPartyControls from "./WatchPartyControls";
import WatchPartyChat from "./WatchPartyChat";
import LayoutSwitcher, { LAYOUTS } from "./LayoutSwitcher";

const CONTROLS_HIDE_DELAY = 3000;

// Orchestrates the whole room view. Fullscreen is modeled as ONE browser
// Fullscreen API call on a container wrapping the player+cameras+controls+
// chat together (per the spec's explicit requirement - not just the video
// element, so camera overlays and controls stay visible while fullscreen),
// crossed with the existing `layout` choice: picking the "Movie Only" layout
// while fullscreen IS Movie-Only Fullscreen (cameras hidden); any other
// layout while fullscreen is Cinema Fullscreen (cameras stay visible,
// controls auto-hide after inactivity). This avoids a second parallel
// fullscreen-mode state machine - switching between the two "modes" the
// spec describes is just a layout change, which never touches playback or
// call state, exactly as required.
const WatchPartyRoom = ({
	partyName,
	onBack,
	headerActions,
	isCreator,
	mediaType,
	title,
	backdropPath,
	isPlaying,
	currentTime,
	isBuffering,
	onTogglePlayback,
	youtubeContainerRef,
	youtubePlayerRef,
	onYoutubeSeek,
	showEmbeddedPlayer,
	streamingUrl,
	selectedSource,
	showSourcePicker,
	setShowSourcePicker,
	streamingSources,
	changeSource,
	tryNextSource,
	trailerKey,
	activeScreenShare,
	isSharingScreen,
	remoteScreenShareStream,
	isInCall,
	onStartCall,
	onEndCall,
	localStream,
	localVideoRef,
	isVideoEnabled,
	onToggleVideo,
	isAudioEnabled,
	onToggleAudio,
	onStartScreenShare,
	onStopScreenShare,
	remoteStreamEntries,
	peerNames,
	peerMediaState,
	identity,
	participantCount,
	isChatOpen,
	setIsChatOpen,
	messages,
	chatRef,
	newMessage,
	setNewMessage,
	onSendMessage,
}) => {
	const containerRef = useRef(null);
	const [layout, setLayout] = useState("cinema");
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [controlsVisible, setControlsVisible] = useState(true);
	const hideTimerRef = useRef(null);

	useEffect(() => {
		const onFsChange = () => {
			setIsFullscreen(document.fullscreenElement === containerRef.current);
		};
		document.addEventListener("fullscreenchange", onFsChange);
		return () => document.removeEventListener("fullscreenchange", onFsChange);
	}, []);

	const toggleFullscreen = useCallback(async () => {
		try {
			if (!document.fullscreenElement) {
				await containerRef.current?.requestFullscreen();
			} else {
				await document.exitFullscreen();
			}
		} catch (err) {
			console.error("Fullscreen error:", err);
		}
	}, []);

	// Auto-hide controls after inactivity, only while fullscreen - windowed
	// view always shows controls (no reason to hide them there).
	useEffect(() => {
		if (!isFullscreen) {
			setControlsVisible(true);
			return;
		}
		const resetTimer = () => {
			setControlsVisible(true);
			if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
			hideTimerRef.current = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_DELAY);
		};
		resetTimer();
		const el = containerRef.current;
		el?.addEventListener("mousemove", resetTimer);
		el?.addEventListener("pointerdown", resetTimer);
		return () => {
			el?.removeEventListener("mousemove", resetTimer);
			el?.removeEventListener("pointerdown", resetTimer);
			if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
		};
	}, [isFullscreen]);

	const isMovieOnly = layout === "movie-only";
	const isTheatre = layout === "theatre";
	const isFloating = layout === "floating";
	const showCameraLayer = isInCall && !isMovieOnly;

	return (
		<div
			ref={containerRef}
			className="w-full h-full min-h-screen bg-[#050505] flex flex-col lg:flex-row">
			<div className="relative flex flex-col flex-1 min-h-screen">
				{/* App-level header - party identity + room actions, distinct from
				    the player's own overlaid controls */}
				{(!isFullscreen || controlsVisible) && (
					<div className="p-3 md:p-4 flex items-center justify-between gap-2 border-b border-white/10 transition-opacity duration-300">
						<div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
							<button
								onClick={onBack}
								className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all flex-shrink-0">
								<ChevronLeft className="w-4 h-4 md:w-5 md:h-5" />
							</button>
							<h2 className="font-semibold text-sm md:text-base truncate">{partyName}</h2>
						</div>
						<div className="flex items-center gap-1.5 md:gap-2 flex-shrink-0">
							<LayoutSwitcher layout={layout} onChange={setLayout} />
							{headerActions}
						</div>
					</div>
				)}

				{/* Player + camera layer */}
				<div className={`relative flex-1 flex ${isTheatre ? "flex-row" : "flex-col"} min-h-0`}>
					<div className="relative flex-1 min-h-[250px]">
						<WatchPartyPlayer
							mediaType={mediaType}
							title={title}
							backdropPath={backdropPath}
							isPlaying={isPlaying}
							currentTime={currentTime}
							isBuffering={isBuffering}
							onTogglePlayback={onTogglePlayback}
							youtubeContainerRef={youtubeContainerRef}
							youtubePlayerRef={youtubePlayerRef}
							onYoutubeSeek={onYoutubeSeek}
							showEmbeddedPlayer={showEmbeddedPlayer}
							streamingUrl={streamingUrl}
							selectedSource={selectedSource}
							showSourcePicker={showSourcePicker}
							setShowSourcePicker={setShowSourcePicker}
							streamingSources={streamingSources}
							changeSource={changeSource}
							tryNextSource={tryNextSource}
							trailerKey={trailerKey}
							activeScreenShare={activeScreenShare}
							isSharingScreen={isSharingScreen}
							remoteScreenShareStream={remoteScreenShareStream}
							isFullscreen={isFullscreen}
							onToggleFullscreen={toggleFullscreen}
							controlsVisible={!isFullscreen || controlsVisible}
						/>

						{isFloating && showCameraLayer && (
							<FloatingParticipantLayer
								containerRef={containerRef}
								isInCall={isInCall}
								resetKey={isFullscreen ? "fs" : "windowed"}
								localStream={localStream}
								localVideoRef={localVideoRef}
								isLocalVideoEnabled={isVideoEnabled}
								isLocalAudioEnabled={isAudioEnabled}
								localName={identity?.name}
								remoteStreamEntries={remoteStreamEntries}
								peerNames={peerNames}
								peerMediaState={peerMediaState}
							/>
						)}
					</div>

					{isTheatre && showCameraLayer && (
						<div className="w-full max-w-[280px] border-l border-white/10 overflow-y-auto p-3 space-y-2 bg-black/40">
							<ParticipantTheatreList
								localStream={localStream}
								localVideoRef={localVideoRef}
								isVideoEnabled={isVideoEnabled}
								isAudioEnabled={isAudioEnabled}
								localName={identity?.name}
								remoteStreamEntries={remoteStreamEntries}
								peerNames={peerNames}
								peerMediaState={peerMediaState}
							/>
						</div>
					)}
				</div>

				{layout === "cinema" && showCameraLayer && (!isFullscreen || controlsVisible) && (
					<ParticipantVideoStrip
						isInCall={isInCall}
						localStream={localStream}
						localVideoRef={localVideoRef}
						isLocalVideoEnabled={isVideoEnabled}
						isLocalAudioEnabled={isAudioEnabled}
						localName={identity?.name}
						remoteStreamEntries={remoteStreamEntries}
						peerNames={peerNames}
						peerMediaState={peerMediaState}
					/>
				)}

				{(!isFullscreen || controlsVisible) && (
					<WatchPartyControls
						isInCall={isInCall}
						onStartCall={onStartCall}
						onEndCall={onEndCall}
						isVideoEnabled={isVideoEnabled}
						onToggleVideo={onToggleVideo}
						isAudioEnabled={isAudioEnabled}
						onToggleAudio={onToggleAudio}
						isSharingScreen={isSharingScreen}
						onStartScreenShare={onStartScreenShare}
						onStopScreenShare={onStopScreenShare}
						isChatOpen={isChatOpen}
						onToggleChat={() => setIsChatOpen(!isChatOpen)}
						isFullscreen={isFullscreen}
						onToggleFullscreen={toggleFullscreen}
						onExit={onBack}
						participantCount={participantCount}
					/>
				)}
			</div>

			<WatchPartyChat
				isOpen={isChatOpen}
				onClose={() => setIsChatOpen(false)}
				messages={messages}
				chatRef={chatRef}
				newMessage={newMessage}
				setNewMessage={setNewMessage}
				onSendMessage={onSendMessage}
				translucent={isFullscreen}
			/>
		</div>
	);
};

// Small inline list for Theatre Mode's side column - reuses ParticipantVideoTile
// at "fill" width within a stacked column rather than the horizontal strip.
const ParticipantTheatreList = ({
	localStream,
	localVideoRef,
	isVideoEnabled,
	isAudioEnabled,
	localName,
	remoteStreamEntries,
	peerNames,
	peerMediaState,
}) => {
	return (
		<>
			<ParticipantVideoTile
				isLocal
				size="auto"
				className="aspect-video"
				stream={localStream}
				videoRef={localVideoRef}
				isVideoEnabled={isVideoEnabled}
				isAudioEnabled={isAudioEnabled}
				name={localName}
			/>
			{remoteStreamEntries.map(([peerId, stream]) => (
				<ParticipantVideoTile
					key={peerId}
					size="auto"
					className="aspect-video"
					stream={stream}
					name={peerNames?.[peerId]}
					isVideoEnabled={peerMediaState?.[peerId]?.video !== false}
					isAudioEnabled={peerMediaState?.[peerId]?.audio !== false}
				/>
			))}
		</>
	);
};

export { LAYOUTS };
export default WatchPartyRoom;
