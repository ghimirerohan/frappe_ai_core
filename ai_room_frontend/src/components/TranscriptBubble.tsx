export type TranscriptStream = {
	text: string;
	participantInfo: { identity: string };
	streamInfo: { id: string; timestamp: number };
};

export default function TranscriptBubble({ stream }: { stream: TranscriptStream }) {
	const id = stream.participantInfo?.identity ?? "";
	const isUser = id.startsWith("user-");
	const text = stream.text?.trim() || "…";

	return (
		<div
			style={{
				alignSelf: isUser ? "flex-end" : "flex-start",
				maxWidth: "92%",
				padding: "10px 14px",
				borderRadius: 14,
				background: isUser ? "rgba(99, 102, 241, 0.35)" : "rgba(15, 23, 42, 0.85)",
				border: `1px solid ${isUser ? "rgba(165, 180, 252, 0.4)" : "rgba(148, 163, 184, 0.25)"}`,
				fontSize: "0.88rem",
				lineHeight: 1.45,
				color: "#e2e8f0",
			}}
		>
			<div style={{ fontSize: "0.65rem", opacity: 0.65, marginBottom: 4 }}>
				{isUser ? "You" : "Agent"}
			</div>
			<div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{text}</div>
		</div>
	);
}
