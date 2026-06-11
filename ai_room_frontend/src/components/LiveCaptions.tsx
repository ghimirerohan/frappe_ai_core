import { useTranscriptions } from "@livekit/components-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef } from "react";
import type { TranscriptStream } from "./TranscriptBubble";

/**
 * Floating live caption of what the AI is saying, streamed word-by-word.
 * Only the agent's speech is shown — the customer's own words are never echoed back.
 */
export default function LiveCaptions({ speakerName }: { speakerName?: string }) {
	const transcriptions = useTranscriptions() as TranscriptStream[];
	const scrollRef = useRef<HTMLDivElement | null>(null);

	const latest = useMemo(() => {
		const agentStreams = transcriptions.filter(
			(s) => !(s.participantInfo?.identity || "").startsWith("user-") && (s.text || "").trim(),
		);
		if (agentStreams.length === 0) return null;
		return agentStreams.reduce((a, b) =>
			(b.streamInfo?.timestamp ?? 0) >= (a.streamInfo?.timestamp ?? 0) ? b : a,
		);
	}, [transcriptions]);

	// Keep the tail of long captions in view as text streams in.
	useEffect(() => {
		const el = scrollRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [latest?.text]);

	return (
		<div className="mx-auto w-full max-w-md px-4" aria-live="polite">
			<AnimatePresence mode="wait">
				{latest ? (
					<motion.div
						key={latest.streamInfo?.id ?? "caption"}
						initial={{ opacity: 0, y: 10 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -6 }}
						transition={{ duration: 0.25 }}
						className="rounded-2xl border border-white/[0.06] bg-white/[0.04] px-4 py-3 backdrop-blur-sm"
					>
						{speakerName ? (
							<p className="mb-1 text-center text-[10px] font-medium uppercase tracking-wider text-slate-500">
								{speakerName}
							</p>
						) : null}
						<div ref={scrollRef} className="max-h-20 overflow-hidden">
							<p className="text-center text-sm leading-relaxed text-slate-200">
								{latest.text.trim()}
							</p>
						</div>
					</motion.div>
				) : null}
			</AnimatePresence>
		</div>
	);
}
