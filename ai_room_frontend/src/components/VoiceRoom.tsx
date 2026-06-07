import {
	LiveKitRoom,
	RoomAudioRenderer,
	useDataChannel,
	useRemoteParticipants,
	useRoomContext,
	useVoiceAssistant,
} from "@livekit/components-react";
import { useCallback, useEffect, useState } from "react";
import { AgentAudioVisualizerAura } from "@/components/agents-ui/agent-audio-visualizer-aura";
import ChatPanel from "./ChatPanel";
import LiveVoiceModelSubscriber from "./LiveVoiceModelSubscriber";
import StatusIndicator from "./StatusIndicator";

function EndSessionButton() {
	const room = useRoomContext();
	return (
		<button
			type="button"
			onClick={() => {
				room.disconnect();
			}}
			style={{
				padding: "12px 24px",
				borderRadius: 12,
				border: "none",
				background: "#ef4444",
				color: "#fff",
				fontSize: "1rem",
				cursor: "pointer",
			}}
		>
			End session
		</button>
	);
}

function HandoffBanner() {
	const [requested, setRequested] = useState(false);
	const remotes = useRemoteParticipants();
	const humanJoined = remotes.some((p) => (p.identity || "").startsWith("agent-human-"));

	const handler = useCallback((msg: { payload: Uint8Array }) => {
		try {
			const data = JSON.parse(new TextDecoder().decode(msg.payload)) as { status?: string };
			if (data.status === "requested") setRequested(true);
		} catch {
			/* ignore non-JSON payloads */
		}
	}, []);
	useDataChannel("handoff", handler);

	if (!requested && !humanJoined) return null;

	return (
		<div
			style={{
				margin: "0 auto 1rem",
				maxWidth: 520,
				padding: "0.75rem 1rem",
				borderRadius: 12,
				background: humanJoined ? "rgba(22, 101, 52, 0.35)" : "rgba(120, 53, 15, 0.35)",
				border: `1px solid ${humanJoined ? "rgba(74, 222, 128, 0.5)" : "rgba(251, 191, 36, 0.5)"}`,
				textAlign: "center",
				fontSize: "0.9rem",
			}}
			aria-live="polite"
		>
			{humanJoined
				? "A human agent has joined the call. You can talk to them now."
				: "Connecting you to a human agent… please hold."}
		</div>
	);
}

function AssistantVisualizer({
	roomLive,
	showAnalyticsPanel,
	geminiModelId,
	geminiModelLabel,
	modelConfirmedByWorker,
}: {
	roomLive: boolean;
	showAnalyticsPanel: boolean;
	geminiModelId?: string;
	geminiModelLabel?: string;
	modelConfirmedByWorker: boolean;
}) {
	const { state, audioTrack } = useVoiceAssistant();
	const remotes = useRemoteParticipants();
	const waitingForAgent = roomLive && remotes.length === 0;
	const modelId = (geminiModelId || "").trim();
	const modelLabel = (geminiModelLabel || "").trim();
	const showLiveModel = roomLive && (modelId || modelLabel);
	const displayId = modelId || modelLabel;

	return (
		<div style={{ width: "100%", maxWidth: showAnalyticsPanel ? 560 : 480, margin: "0 auto" }}>
			{showLiveModel ? (
				<div
					style={{
						marginBottom: "1rem",
						padding: "0.55rem 0.85rem",
						borderRadius: 12,
						background: "rgba(30, 27, 75, 0.9)",
						border: "1px solid rgba(165, 180, 252, 0.45)",
						textAlign: "center",
					}}
					aria-live="polite"
				>
					<p style={{ margin: 0, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "#a5b4fc" }}>
						{modelConfirmedByWorker ? "Voice model in use (worker)" : "Voice model (session)"}
					</p>
					<p
						style={{
							margin: "0.25rem 0 0",
							fontSize: "0.62rem",
							color: modelConfirmedByWorker ? "#86efac" : "#fcd34d",
							lineHeight: 1.35,
						}}
					>
						{modelConfirmedByWorker
							? "Same id passed to Gemini Live in the agent process"
							: "Updates when the voice worker publishes its model"}
					</p>
					<p
						style={{
							margin: "0.35rem 0 0",
							fontSize: "0.82rem",
							fontWeight: 600,
							fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
							color: "#e0e7ff",
							wordBreak: "break-all",
							lineHeight: 1.35,
						}}
						title={displayId}
					>
						{displayId}
					</p>
					{modelLabel && modelId && modelLabel !== modelId ? (
						<p style={{ margin: "0.35rem 0 0", fontSize: "0.72rem", opacity: 0.8 }}>
							{modelLabel}
						</p>
					) : null}
				</div>
			) : null}
			{waitingForAgent ? (
				<div
					style={{
						marginBottom: "1.25rem",
						padding: "1rem 1.15rem",
						borderRadius: 14,
						background: "rgba(15, 23, 42, 0.75)",
						border: "1px solid rgba(129, 140, 248, 0.35)",
						fontSize: "0.88rem",
						lineHeight: 1.55,
						textAlign: "left",
					}}
				>
					<p style={{ margin: "0 0 0.65rem", fontWeight: 600, color: "#e0e7ff" }}>
						You are connected to the room, but the AI voice worker has not joined yet.
					</p>
					<p style={{ margin: "0 0 0.5rem", opacity: 0.92 }}>
						In the <strong>Frappe bench</strong> container (same place you run <code>bench</code>), start the worker:
					</p>
					<pre
						style={{
							margin: 0,
							padding: "0.65rem 0.75rem",
							borderRadius: 8,
							background: "#0f172a",
							overflowX: "auto",
							fontSize: "0.72rem",
							color: "#a5b4fc",
						}}
					>
						{`export LIVEKIT_URL=ws://livekit:7880
export LIVEKIT_API_KEY=devkey
export LIVEKIT_API_SECRET=secret
export FRAPPE_SITE=learn.localhost
export FRAPPE_BENCH_ROOT=/workspace/development/frappe-bench
python -m frappe_ai_core.ai_engine.voice_agent dev`}
					</pre>
					<p style={{ margin: "0.65rem 0 0", opacity: 0.85, fontSize: "0.82rem" }}>
						Use your real site name and bench path if different. Keep this terminal open while you talk.
					</p>
				</div>
			) : null}
			<AgentAudioVisualizerAura
				size={showAnalyticsPanel ? "sm" : "lg"}
				state={state}
				audioTrack={audioTrack}
				themeMode="dark"
				style={{ borderRadius: 16, margin: "0 auto" }}
			/>
			<StatusIndicator state={state} waitingForAgent={waitingForAgent} />
		</div>
	);
}

export default function VoiceRoom({
	token,
	serverUrl,
	roomName,
	geminiModelLabel,
	geminiModelId,
	showAnalyticsPanel = false,
	onLeave,
}: {
	token: string;
	serverUrl: string;
	roomName: string;
	geminiModelLabel?: string;
	geminiModelId?: string;
	/** When true, show transcript + ERPNext data cards below the Aura visualizer. */
	showAnalyticsPanel?: boolean;
	onLeave: () => void;
}) {
	const [connected, setConnected] = useState(false);
	const [liveWorkerModel, setLiveWorkerModel] = useState<{ id: string; label: string } | null>(null);

	const handleWorkerModel = useCallback((id: string, label: string) => {
		setLiveWorkerModel({ id, label });
	}, []);

	useEffect(() => {
		setLiveWorkerModel(null);
	}, [token, roomName]);

	useEffect(() => {
		return () => setConnected(false);
	}, [token, serverUrl, roomName]);

	const displayModelId = liveWorkerModel?.id || geminiModelId;
	const displayModelLabel = liveWorkerModel?.label || geminiModelLabel;
	const modelConfirmedByWorker = Boolean(liveWorkerModel);

	return (
		<div
			style={{
				minHeight: "100dvh",
				display: "flex",
				flexDirection: "column",
				background: "linear-gradient(160deg, #0f172a, #312e81)",
				color: "#e2e8f0",
				fontFamily: "system-ui, sans-serif",
				padding: "1rem",
			}}
		>
			<header style={{ textAlign: "center", marginBottom: showAnalyticsPanel ? "0.5rem" : "1rem" }}>
				<h1 style={{ fontSize: "1.15rem", margin: 0 }}>Session: {roomName}</h1>
				<p style={{ margin: "0.35rem 0 0", fontSize: "0.85rem", opacity: 0.8 }}>
					{connected ? "LiveKit room connected" : "Joining LiveKit room…"}
					{showAnalyticsPanel ? " · ERPNext analytics mode" : ""}
				</p>
				{displayModelId || displayModelLabel ? (
					<div
						style={{
							marginTop: "0.65rem",
							padding: "0.5rem 0.75rem",
							borderRadius: 10,
							background: "rgba(15, 23, 42, 0.55)",
							border: "1px solid rgba(148, 163, 184, 0.25)",
							maxWidth: 520,
							marginLeft: "auto",
							marginRight: "auto",
						}}
					>
						<p style={{ margin: 0, fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "#94a3b8" }}>
							Voice model
						</p>
						<p
							style={{
								margin: "0.25rem 0 0",
								fontSize: "0.65rem",
								color: modelConfirmedByWorker ? "#86efac" : "#fcd34d",
							}}
						>
							{modelConfirmedByWorker
								? "Confirmed by voice worker (in use)"
								: "Session default until the agent joins"}
						</p>
						<p
							style={{
								margin: "0.35rem 0 0",
								fontSize: "0.8rem",
								fontWeight: 600,
								fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
								color: "#c7d2fe",
								wordBreak: "break-all",
								lineHeight: 1.35,
							}}
							title={displayModelId || displayModelLabel}
						>
							{displayModelId || displayModelLabel}
						</p>
						{displayModelLabel && displayModelId && displayModelLabel !== displayModelId ? (
							<p style={{ margin: "0.3rem 0 0", fontSize: "0.75rem", opacity: 0.85 }}>
								{displayModelLabel}
							</p>
						) : null}
					</div>
				) : null}
			</header>

			<LiveKitRoom
				token={token}
				serverUrl={serverUrl}
				connect
				audio
				video={false}
				data-lk-theme="default"
				onConnected={() => setConnected(true)}
				onDisconnected={() => {
					setConnected(false);
					onLeave();
				}}
				style={{ flex: 1, display: "flex", flexDirection: "column" }}
			>
				<LiveVoiceModelSubscriber onModel={handleWorkerModel} />
				<RoomAudioRenderer />
				<HandoffBanner />
				<div
					style={{
						flex: 1,
						display: "flex",
						flexDirection: showAnalyticsPanel ? "column" : "row",
						alignItems: "stretch",
						justifyContent: showAnalyticsPanel ? "flex-start" : "center",
						overflow: showAnalyticsPanel ? "auto" : "visible",
						padding: showAnalyticsPanel ? "0 0.5rem" : 0,
					}}
				>
					<div
						style={{
							flex: showAnalyticsPanel ? "0 0 auto" : 1,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							minHeight: showAnalyticsPanel ? 200 : undefined,
						}}
					>
						<AssistantVisualizer
							roomLive={connected}
							showAnalyticsPanel={showAnalyticsPanel}
							geminiModelId={displayModelId}
							geminiModelLabel={displayModelLabel}
							modelConfirmedByWorker={modelConfirmedByWorker}
						/>
					</div>
					{showAnalyticsPanel ? <ChatPanel /> : null}
				</div>
				<div
					style={{
						display: "flex",
						justifyContent: "center",
						gap: "1rem",
						padding: "1.5rem 0 calc(1rem + env(safe-area-inset-bottom))",
					}}
				>
					<EndSessionButton />
				</div>
			</LiveKitRoom>
		</div>
	);
}
