/** @format */

import React from "react";
import {
	Video,
	VideoOff,
	Mic,
	MicOff,
	MonitorUp,
	MonitorStop,
	MessageSquare,
	Maximize2,
	Minimize2,
	PhoneOff,
	LogOut,
	Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ToolbarButton = ({ onClick, active, danger, title, children, badge }) => (
	<button
		type="button"
		onClick={onClick}
		title={title}
		className={cn(
			"relative w-10 h-10 md:w-11 md:h-11 rounded-full flex items-center justify-center transition-all",
			danger
				? "bg-red-500 hover:bg-red-600"
				: active
				? "bg-white/10 hover:bg-white/20"
				: "bg-red-500/20 text-red-500 hover:bg-red-500/30"
		)}>
		{children}
		{badge && (
			<span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-[#7C3AED] rounded-full" />
		)}
	</button>
);

// Bottom toolbar: Mic | Camera | Share | Chat | Fullscreen | Exit, matching
// the requested layout. Call controls call straight into the existing
// WebRTC handlers (startCall/toggleVideo/toggleAudio/startScreenShare/
// stopScreenShare/endCall) passed down from WatchPartyPage.jsx - no new
// call logic lives here.
const WatchPartyControls = ({
	isInCall,
	onStartCall,
	onEndCall,
	isVideoEnabled,
	onToggleVideo,
	isAudioEnabled,
	onToggleAudio,
	isSharingScreen,
	onStartScreenShare,
	onStopScreenShare,
	isChatOpen,
	onToggleChat,
	hasUnreadChat,
	isFullscreen,
	onToggleFullscreen,
	onExit,
	participantCount,
}) => {
	return (
		<div className="flex items-center justify-between gap-2 px-3 md:px-4 py-2.5 md:py-3 border-t border-white/10 bg-[#050505]">
			<div className="flex items-center gap-1.5 text-[#A1A1AA] text-sm">
				<Users className="w-4 h-4" />
				<span className="hidden sm:inline">{participantCount} watching</span>
				<span className="sm:hidden">{participantCount}</span>
			</div>

			<div className="flex items-center gap-1.5 md:gap-2">
				{isInCall ? (
					<>
						<ToolbarButton
							onClick={onToggleAudio}
							active={isAudioEnabled}
							title={isAudioEnabled ? "Mute microphone" : "Unmute microphone"}>
							{isAudioEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
						</ToolbarButton>
						<ToolbarButton
							onClick={onToggleVideo}
							active={isVideoEnabled}
							title={isVideoEnabled ? "Turn camera off" : "Turn camera on"}>
							{isVideoEnabled ? (
								<Video className="w-4 h-4" />
							) : (
								<VideoOff className="w-4 h-4" />
							)}
						</ToolbarButton>
						<ToolbarButton
							onClick={isSharingScreen ? onStopScreenShare : onStartScreenShare}
							active={!isSharingScreen}
							title={isSharingScreen ? "Stop sharing screen" : "Share your screen"}>
							{isSharingScreen ? (
								<MonitorStop className="w-4 h-4 text-green-400" />
							) : (
								<MonitorUp className="w-4 h-4" />
							)}
						</ToolbarButton>
					</>
				) : (
					<button
						onClick={onStartCall}
						data-testid="controls-start-call-btn"
						className="btn-primary flex items-center gap-2 px-3 py-2 text-sm">
						<Video className="w-4 h-4" />
						<span className="hidden sm:inline">Join Call</span>
					</button>
				)}

				<ToolbarButton onClick={onToggleChat} active={isChatOpen} title="Chat" badge={hasUnreadChat}>
					<MessageSquare className="w-4 h-4" />
				</ToolbarButton>

				<ToolbarButton
					onClick={onToggleFullscreen}
					active
					title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
					{isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
				</ToolbarButton>

				{isInCall && (
					<ToolbarButton onClick={onEndCall} danger title="Leave video call">
						<PhoneOff className="w-4 h-4" />
					</ToolbarButton>
				)}

				<ToolbarButton onClick={onExit} active title="Exit watch party">
					<LogOut className="w-4 h-4" />
				</ToolbarButton>
			</div>
		</div>
	);
};

export default WatchPartyControls;
