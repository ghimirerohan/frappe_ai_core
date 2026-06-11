import { useLocalParticipant, useRoomContext } from "@livekit/components-react";
import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";

function MicIcon({ muted }: { muted: boolean }) {
	return muted ? (
		<svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
			<path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6" />
			<path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .74-.11 1.45-.32 2.11" />
			<line x1="12" y1="19" x2="12" y2="22" />
			<line x1="2" y1="2" x2="22" y2="22" />
		</svg>
	) : (
		<svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
			<rect x="9" y="2" width="6" height="12" rx="3" />
			<path d="M5 10v2a7 7 0 0 0 14 0v-2" />
			<line x1="12" y1="19" x2="12" y2="22" />
		</svg>
	);
}

function HangUpIcon() {
	return (
		<svg className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor">
			<path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.996.996 0 0 1 0-1.41C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.1-.7-.28-.79-.73-1.68-1.36-2.66-1.85a.996.996 0 0 1-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
		</svg>
	);
}

/**
 * Native-call-style control bar: mute toggle + hang up.
 * Must be rendered inside a <LiveKitRoom>.
 */
export default function CallControlBar({ onHangUp }: { onHangUp?: () => void }) {
	const room = useRoomContext();
	const { localParticipant } = useLocalParticipant();
	const [muted, setMuted] = useState(false);

	const toggleMute = useCallback(async () => {
		const next = !muted;
		try {
			await localParticipant.setMicrophoneEnabled(!next);
			setMuted(next);
		} catch {
			/* keep current state if the device refuses */
		}
	}, [muted, localParticipant]);

	return (
		<div className="flex items-center justify-center gap-8 py-5">
			<div className="flex flex-col items-center gap-1.5">
				<button
					type="button"
					onClick={() => void toggleMute()}
					aria-label={muted ? "Unmute microphone" : "Mute microphone"}
					aria-pressed={muted}
					className={cn(
						"flex h-14 w-14 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40",
						muted ? "bg-white text-slate-900" : "bg-white/10 text-white hover:bg-white/15",
					)}
				>
					<MicIcon muted={muted} />
				</button>
				<span className="text-[11px] text-slate-400">{muted ? "Unmute" : "Mute"}</span>
			</div>
			<div className="flex flex-col items-center gap-1.5">
				<button
					type="button"
					onClick={() => {
						room.disconnect();
						onHangUp?.();
					}}
					aria-label="End call"
					className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white transition-colors hover:bg-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
				>
					<HangUpIcon />
				</button>
				<span className="text-[11px] text-slate-400">End</span>
			</div>
		</div>
	);
}
