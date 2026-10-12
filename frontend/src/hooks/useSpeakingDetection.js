/** @format */

import { useEffect, useRef, useState } from "react";

const SPEAKING_THRESHOLD = 20; // average byte amplitude (0-255) to count as "speaking"
const SILENCE_FRAMES_TO_STOP = 15; // ~0.25s at 60fps, debounces flicker on pauses between words

// Read-only volume-level tap on a MediaStream's audio track, via the Web
// Audio API. Never touches playback/routing - createMediaStreamSource taps
// the stream without consuming or altering it, so this can't introduce any
// audio feedback/echo or interfere with the call or movie audio.
export const useSpeakingDetection = (stream, enabled = true) => {
	const [isSpeaking, setIsSpeaking] = useState(false);
	const rafRef = useRef(null);
	const silenceFramesRef = useRef(0);

	useEffect(() => {
		if (!enabled || !stream || stream.getAudioTracks().length === 0) {
			setIsSpeaking(false);
			return;
		}

		let audioContext;
		let analyser;
		let source;
		let cancelled = false;

		try {
			audioContext = new (window.AudioContext || window.webkitAudioContext)();
			analyser = audioContext.createAnalyser();
			analyser.fftSize = 256;
			analyser.smoothingTimeConstant = 0.6;
			source = audioContext.createMediaStreamSource(stream);
			source.connect(analyser);
		} catch (err) {
			console.error("Speaking detection setup failed:", err);
			return;
		}

		const data = new Uint8Array(analyser.frequencyBinCount);
		silenceFramesRef.current = 0;

		const tick = () => {
			if (cancelled) return;
			analyser.getByteFrequencyData(data);
			let sum = 0;
			for (let i = 0; i < data.length; i++) sum += data[i];
			const average = sum / data.length;

			if (average > SPEAKING_THRESHOLD) {
				silenceFramesRef.current = 0;
				setIsSpeaking((prev) => (prev ? prev : true));
			} else {
				silenceFramesRef.current += 1;
				if (silenceFramesRef.current > SILENCE_FRAMES_TO_STOP) {
					setIsSpeaking((prev) => (prev ? false : prev));
				}
			}

			rafRef.current = requestAnimationFrame(tick);
		};
		rafRef.current = requestAnimationFrame(tick);

		return () => {
			cancelled = true;
			if (rafRef.current) cancelAnimationFrame(rafRef.current);
			try {
				source.disconnect();
				analyser.disconnect();
				audioContext.close();
			} catch {
				// already closed/disconnected
			}
			setIsSpeaking(false);
		};
	}, [stream, enabled]);

	return isSpeaking;
};
