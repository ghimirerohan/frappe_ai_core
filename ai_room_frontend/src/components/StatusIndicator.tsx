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
	waitingForAgent?: boolean;
	labelOverride?: string;
};

export default function StatusIndicator({ state, waitingForAgent, labelOverride }: Props) {
	if (labelOverride) {
		return (
			<div className="text-center text-sm font-semibold tracking-wide text-emerald-200 mt-3">
				{labelOverride}
			</div>
		);
	}

	const key = state ?? "connecting";
	let label = LABELS[key] || `State: ${String(key)}`;

	if (waitingForAgent && (key === "connecting" || key === "disconnected" || key === "initializing" || !state)) {
		label = "Connecting to Sewa…";
	}

	return (
		<div className="text-center text-sm font-semibold tracking-wide text-indigo-200 mt-3">
			{label}
		</div>
	);
}
