const LABELS: Record<string, string> = {
	disconnected: "Disconnected",
	connecting: "Connecting…",
	initializing: "Initializing…",
	listening: "AI is listening",
	thinking: "AI is thinking",
	speaking: "AI is speaking",
};

type Props = {
	state: string | undefined;
	/** You are in the LiveKit room but no remote participant (AI agent) yet */
	waitingForAgent?: boolean;
};

export default function StatusIndicator({ state, waitingForAgent }: Props) {
	const key = state ?? "connecting";
	let label = LABELS[key] || `State: ${String(key)}`;

	if (waitingForAgent && (key === "connecting" || key === "disconnected" || key === "initializing" || !state)) {
		label = "Waiting for voice AI agent…";
	}

	return (
		<div
			style={{
				textAlign: "center",
				fontSize: "0.95rem",
				fontWeight: 600,
				letterSpacing: "0.02em",
				color: "#c7d2fe",
				marginTop: "0.75rem",
			}}
		>
			{label}
		</div>
	);
}
