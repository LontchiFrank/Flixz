/** @format */

import React from "react";
import { useDraggableOverlay } from "@/hooks/useDraggableOverlay";
import ParticipantVideoTile from "./ParticipantVideoTile";
import { Z } from "./zIndex";

// One independently-draggable (and natively resizable) floating tile. Pulled
// out as its own component because useDraggableOverlay is a hook, and hooks
// can't be called per-item inside a .map() in the parent.
const FloatingTile = ({ containerRef, defaultPosition, zIndexBase, ...tileProps }) => {
	const drag = useDraggableOverlay(containerRef);

	return (
		<ParticipantVideoTile
			{...tileProps}
			size="md"
			resizable
			className="absolute shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
			style={{
				zIndex: zIndexBase,
				touchAction: "none",
				...(drag.offset
					? { top: drag.offset.y, left: drag.offset.x }
					: { top: defaultPosition.y, left: defaultPosition.x }),
			}}
			dragHandleProps={{
				title: "Drag to move",
				onPointerDown: drag.onPointerDown,
				onPointerMove: drag.onPointerMove,
				onPointerUp: drag.onPointerUp,
				onPointerCancel: drag.onPointerUp,
			}}
		/>
	);
};

// Floating Mode: camera tiles float freely above the movie, each one
// independently draggable and natively resizable (CSS `resize`). Tiles
// start staggered down the right edge so they don't all stack on load, but
// once dragged, each remembers its own position (reset happens in the
// parent via containerRef/layout-change the same way the old single-group
// drag used to reset on fullscreen toggle).
const FloatingParticipantLayer = ({
	containerRef,
	isInCall,
	hidden,
	resetKey, // bump this (e.g. fullscreen mode) to remount tiles and drop stale drag offsets
	localStream,
	localVideoRef,
	isLocalVideoEnabled,
	isLocalAudioEnabled,
	localName,
	remoteStreamEntries,
	peerNames,
	peerMediaState,
}) => {
	if (!isInCall || hidden) return null;

	const STAGGER_Y = 150;
	const STAGGER_X_JITTER = 24;

	return (
		<>
			<FloatingTile
				key={`local-${resetKey}`}
				containerRef={containerRef}
				defaultPosition={{ x: 16, y: 16 }}
				zIndexBase={Z.FLOATING_TILE}
				isLocal
				stream={localStream}
				videoRef={localVideoRef}
				isVideoEnabled={isLocalVideoEnabled}
				isAudioEnabled={isLocalAudioEnabled}
				name={localName}
			/>
			{remoteStreamEntries.map(([peerId, stream], i) => (
				<FloatingTile
					key={`${peerId}-${resetKey}`}
					containerRef={containerRef}
					defaultPosition={{
						x: 16 + ((i * STAGGER_X_JITTER) % 80),
						y: 16 + (i + 1) * STAGGER_Y,
					}}
					zIndexBase={Z.FLOATING_TILE - i - 1}
					stream={stream}
					name={peerNames?.[peerId]}
					isVideoEnabled={peerMediaState?.[peerId]?.video !== false}
					isAudioEnabled={peerMediaState?.[peerId]?.audio !== false}
				/>
			))}
		</>
	);
};

export default FloatingParticipantLayer;
