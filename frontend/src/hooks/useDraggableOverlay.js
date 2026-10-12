/** @format */

import { useRef, useState } from "react";

// Drag-to-reposition for a floating overlay (camera PiP, remote gallery)
// within a given container ref. Returns a px offset from the container's
// top-left (null = caller should use its own default CSS position) plus
// pointer handlers to spread onto the draggable element.
export const useDraggableOverlay = (containerRef) => {
	const [offset, setOffset] = useState(null);
	const dragRef = useRef({ dragging: false });

	const onPointerDown = (e) => {
		const container = containerRef.current;
		const el = e.currentTarget;
		if (!container) return;

		const containerRect = container.getBoundingClientRect();
		const elRect = el.getBoundingClientRect();

		dragRef.current = {
			dragging: true,
			pointerId: e.pointerId,
			startClientX: e.clientX,
			startClientY: e.clientY,
			startLeft: elRect.left - containerRect.left,
			startTop: elRect.top - containerRect.top,
			elWidth: elRect.width,
			elHeight: elRect.height,
		};
		el.setPointerCapture(e.pointerId);
	};

	const onPointerMove = (e) => {
		const drag = dragRef.current;
		if (!drag.dragging) return;

		const container = containerRef.current;
		if (!container) return;

		const dx = e.clientX - drag.startClientX;
		const dy = e.clientY - drag.startClientY;

		const containerRect = container.getBoundingClientRect();
		const maxLeft = Math.max(0, containerRect.width - drag.elWidth);
		const maxTop = Math.max(0, containerRect.height - drag.elHeight);

		setOffset({
			x: Math.min(Math.max(0, drag.startLeft + dx), maxLeft),
			y: Math.min(Math.max(0, drag.startTop + dy), maxTop),
		});
	};

	const onPointerUp = (e) => {
		const drag = dragRef.current;
		try {
			e.currentTarget.releasePointerCapture(drag.pointerId ?? e.pointerId);
		} catch {
			// pointer capture may already be released (e.g. pointercancel)
		}
		dragRef.current = { dragging: false };
	};

	return { offset, setOffset, onPointerDown, onPointerMove, onPointerUp };
};
