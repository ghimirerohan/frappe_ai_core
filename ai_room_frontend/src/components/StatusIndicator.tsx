type Props = {
	state: string | undefined;
	waitingForAgent?: boolean;
	labelOverride?: string;
	assistantName?: string;
};

/** Natural-language call status — phrased like a person, not a system. */
export default function StatusIndicator({ state, waitingForAgent, labelOverride, assistantName = "Sewa" }: Props) {
	if (labelOverride) {
		return <div className="mt-1.5 text-center text-sm text-emerald-200/90">{labelOverride}</div>;
	}

	const key = state ?? "connecting";
	const labels: Record<string, string> = {
		disconnected: "Call ended",
		connecting: "Calling…",
		initializing: "Calling…",
		listening: "Listening",
		thinking: "One moment…",
		speaking: "Speaking",
	};
	let label = labels[key] || "On the line";

	if (waitingForAgent && (key === "connecting" || key === "disconnected" || key === "initializing" || !state)) {
		label = `Connecting you to ${assistantName}…`;
	}

	return <div className="mt-1.5 text-center text-sm text-slate-400">{label}</div>;
}
