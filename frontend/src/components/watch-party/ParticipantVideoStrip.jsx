/** @format */

import React from "react";
import ParticipantVideoTile from "./ParticipantVideoTile";

// Cinema Mode's docked horizontal camera strip underneath the movie.
// Scrolls horizontally once there are more tiles than fit - no hard cap.
const ParticipantVideoStrip = ({
	isInCall,
	localStream,
	localVideoRef,
	isLocalVideoEnabled,
	isLocalAudioEnabled,
	localName,
	remoteStreamEntries,
	peerNames,
	peerMediaState,
}) => {
	if (!isInCall) return null;

	return (
		<div className="flex items-center gap-2 px-3 md:px-4 py-2 overflow-x-auto border-t border-white/10 bg-black/40">
			<ParticipantVideoTile
				isLocal
				size="sm"
				stream={localStream}
				videoRef={localVideoRef}
				isVideoEnabled={isLocalVideoEnabled}
				isAudioEnabled={isLocalAudioEnabled}
				name={localName}
				className="flex-shrink-0"
			/>
			{remoteStreamEntries.map(([peerId, stream]) => (
				<ParticipantVideoTile
					key={peerId}
					size="sm"
					stream={stream}
					name={peerNames?.[peerId]}
					isVideoEnabled={peerMediaState?.[peerId]?.video !== false}
					isAudioEnabled={peerMediaState?.[peerId]?.audio !== false}
					className="flex-shrink-0"
				/>
			))}
		</div>
	);
};

export default ParticipantVideoStrip;
