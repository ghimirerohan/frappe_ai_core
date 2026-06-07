import InlineArtifactCard from "./InlineArtifactCard";

export type ChatRole = "user" | "assistant" | "tool_result" | "tool_call" | "system";

export type UIArtifact = {
	artifact_type: string;
	title?: string;
	chart_type?: string;
	payload_json?: Record<string, unknown>;
};

export type UIBubble = {
	id: string;
	role: ChatRole;
	content: string;
	messageType?: string;
	artifacts?: UIArtifact[];
};

export default function MessageBubble({
	msg,
	isActive,
	onSelectArtifact,
}: {
	msg: UIBubble;
	isActive?: boolean;
	onSelectArtifact?: () => void;
}) {
	const isUser = msg.role === "user";
	const isTool = msg.role === "tool_result" || msg.role === "tool_call";

	const align = isUser ? "items-end" : "items-start";
	const bubbleBg = isUser
		? "bg-indigo-600/30 border-indigo-400/40"
		: isTool
			? "bg-amber-900/25 border-amber-600/30"
			: "bg-slate-800/80 border-slate-600/40";

	const label = isUser ? "You" : isTool ? "Tool" : "Assistant";
	const primaryArtifactTitle = msg.artifacts?.[0]?.title;

	return (
		<div className={`flex w-full flex-col gap-2 ${align}`}>
			<div
				className={`max-w-[min(92%,42rem)] rounded-2xl border px-3.5 py-2.5 text-sm leading-relaxed text-slate-100 shadow-sm ${bubbleBg} ${isActive ? "ring-2 ring-indigo-400/50" : ""}`}
			>
				<div className="mb-1 text-[0.65rem] uppercase tracking-wide text-slate-400">{label}</div>
				<div className="whitespace-pre-wrap break-words text-slate-100">{msg.content || "…"}</div>
				{isTool && primaryArtifactTitle ? (
					<div className="mt-2 border-t border-amber-500/20 pt-2 text-[0.72rem] text-amber-100/90">
						<span className="text-slate-400">Artifact:</span> {primaryArtifactTitle}
						<span className="ml-1 text-slate-500">— click card below to focus in the right panel</span>
					</div>
				) : null}
			</div>
			{msg.artifacts && msg.artifacts.length > 0 ? (
				<div className={`flex max-w-[min(92%,42rem)] flex-col gap-2 ${isUser ? "items-end" : "items-start"}`}>
					{msg.artifacts.map((a, i) => (
						<InlineArtifactCard
							key={`${msg.id}-a-${i}`}
							artifact={a}
							onClick={() => onSelectArtifact?.()}
						/>
					))}
				</div>
			) : null}
		</div>
	);
}
