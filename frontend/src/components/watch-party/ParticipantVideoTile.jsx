/** @format */

import React, { useEffect, useRef } from "react";
import { Mic, MicOff, VideoOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSpeakingDetection } from "@/hooks/useSpeakingDetection";

const SIZE_CLASSES = {
	sm: "w-28 h-20 sm:w-32 sm:h-24",
	md: "w-32 h-24 sm:w-40 sm:h-32 md:w-48 md:h-36",
	lg: "w-40 h-32 sm:w-48 sm:h-36 md:w-56 md:h-40",
	fill: "w-full h-full",
	// Width-only, so a caller-supplied aspect-ratio class (e.g. aspect-video)
	// actually controls height instead of being overridden by an explicit
	// h-full (CSS only lets aspect-ratio fill in a dimension left unset).
	auto: "w-full",
};

// One camera box - the single building block reused for the local self-view,
// every remote participant tile, the docked strip, and the floating layer.
// Owns its own speaking-indicator detection so callers never have to wire
// that up per-tile.
const ParticipantVideoTile = ({
	stream,
	name,
	isLocal = false,
	isVideoEnabled = true,
	isAudioEnabled = true,
	size = "md",
	className,
	style,
	videoRef: externalVideoRef,
	dragHandleProps,
	resizable = false,
}) => {
	const internalVideoRef = useRef(null);
	const videoRef = externalVideoRef || internalVideoRef;
	const isSpeaking = useSpeakingDetection(stream, isAudioEnabled);

	// Remote streams: attach + play here (mirrors the existing attach pattern
	// used throughout WatchPartyPage.jsx's remote tiles). Local stream's own
	// video element is driven by WatchPartyPage via externalVideoRef exactly
	// as it is today, so this effect only applies to non-local tiles.
	useEffect(() => {
		if (isLocal) return;
		const el = videoRef.current;
		if (!el || !stream) return;
		if (el.srcObject !== stream) {
			el.srcObject = stream;
			el.onloadedmetadata = () => {
				el.play().catch((err) => {
					if (err.name !== "AbortError") {
						el.muted = true;
						el.play().catch(() => {});
					}
				});
			};
		}
	}, [stream, isLocal, videoRef]);

	const showVideo = stream && isVideoEnabled;
	const initial = name?.charAt(0)?.toUpperCase() || "?";

	return (
		<div
			{...(dragHandleProps || {})}
			style={style}
			className={cn(
				"relative rounded-xl overflow-hidden border-2 shadow-2xl bg-[#121212] select-none",
				isSpeaking ? "border-[#10B981]" : "border-white/20",
				resizable && "resize overflow-auto",
				SIZE_CLASSES[size] || SIZE_CLASSES.md,
				className
			)}>
			{showVideo ? (
				<video
					ref={videoRef}
					autoPlay
					playsInline
					muted={isLocal}
					draggable={false}
					className="w-full h-full object-cover bg-black pointer-events-none"
					style={isLocal ? { transform: "scaleX(-1)" } : undefined}
				/>
			) : (
				<div className="w-full h-full flex items-center justify-center bg-[#121212]">
					{stream ? (
						<div className="w-12 h-12 rounded-full bg-[#7C3AED] flex items-center justify-center text-lg font-bold">
							{initial}
						</div>
					) : (
						<span className="text-xs text-[#A1A1AA]">Loading camera...</span>
					)}
				</div>
			)}

			{/* Name + status badges */}
			<div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between gap-1 pointer-events-none">
				<span className="px-1.5 py-0.5 bg-black/80 rounded text-[10px] sm:text-xs font-medium truncate max-w-[70%]">
					{isLocal ? "You" : name || "Participant"}
				</span>
				<div className="flex items-center gap-1 flex-shrink-0">
					{!isVideoEnabled && (
						<span className="w-5 h-5 rounded-full bg-black/80 flex items-center justify-center">
							<VideoOff className="w-3 h-3 text-red-400" />
						</span>
					)}
					<span
						className={cn(
							"w-5 h-5 rounded-full bg-black/80 flex items-center justify-center",
							!isAudioEnabled && "text-red-400"
						)}>
						{isAudioEnabled ? (
							<Mic className="w-3 h-3" />
						) : (
							<MicOff className="w-3 h-3 text-red-400" />
						)}
					</span>
				</div>
			</div>
		</div>
	);
};

export default ParticipantVideoTile;
