/** @format */

import React from "react";
import { Play } from "lucide-react";
import { Z } from "./zIndex";

// Two phases, both only shown before a hard-sync party (YouTube/custom
// upload) has actually started playing for the first time (or just after a
// media change, which needs the same fresh ready-check):
//  - "waiting": "{host} selected a video" + ready count + (host-only) Start
//    button
//  - "countdown": READY? 3 2 1 GO!, driven by useWatchPartySync's
//    clock-offset-corrected countdownSeconds (same instant for everyone,
//    not a per-client timer)
// TMDB/best-effort parties never show this - they have no real readiness
// signal and no way to guarantee a synchronized start, so they keep going
// straight to advisory-only playback as before.
const WatchPartyCountdownOverlay = ({
	phase, // "waiting" | "countdown" | null
	countdownSeconds, // 0 ("GO!") | 1 | 2 | 3
	readyStatus,
	hostName,
	isHost,
	onStartWatchParty,
}) => {
	if (!phase) return null;

	return (
		<div
			className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm"
			style={{ zIndex: Z.DROPDOWN }}>
			{phase === "waiting" ? (
				<div className="text-center px-6">
					<p className="text-lg md:text-xl text-[#A1A1AA] mb-2">
						{hostName ? `${hostName} selected a video` : "Video selected"}
					</p>
					<p className="text-sm text-[#52525B] mb-6">
						{readyStatus.ready_count}/{Math.max(readyStatus.total_count, 1)} ready
					</p>
					{isHost ? (
						<button
							onClick={onStartWatchParty}
							data-testid="start-watch-party-btn"
							className="btn-primary flex items-center gap-2 mx-auto px-6 py-3 text-base">
							<Play className="w-5 h-5" />
							Start Watch Party
						</button>
					) : (
						<p className="text-white font-medium">Waiting for {hostName || "the host"} to start...</p>
					)}
				</div>
			) : (
				<div className="text-center">
					<p className="text-sm md:text-base text-[#A1A1AA] mb-4 tracking-widest uppercase">Ready?</p>
					<div
						key={countdownSeconds}
						className="text-7xl md:text-9xl font-bold text-white animate-in zoom-in-50 fade-in duration-300">
						{countdownSeconds === 0 ? "GO!" : countdownSeconds}
					</div>
				</div>
			)}
		</div>
	);
};

export default WatchPartyCountdownOverlay;
