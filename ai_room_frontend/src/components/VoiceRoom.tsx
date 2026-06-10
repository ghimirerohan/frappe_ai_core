import {
	LiveKitRoom,
	RoomAudioRenderer,
	useDataChannel,
	useRemoteParticipants,
	useRoomContext,
	useTracks,
	useVoiceAssistant,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AgentAudioVisualizerAura } from "@/components/agents-ui/agent-audio-visualizer-aura";
import { SupportAppShell } from "@/components/layout/SupportAppShell";
import { Button } from "@/components/ui/Button";
import ChatPanel from "./ChatPanel";
import LiveVoiceModelSubscriber from "./LiveVoiceModelSubscriber";
import StatusIndicator from "./StatusIndicator";

type CallPhase = "ai_active" | "handoff_pending" | "human_live";

function EndSessionButton() {
	const room = useRoomContext();
	return (
		<Button variant="danger" size="md" onClick={() => room.disconnect()}>
			End call
		</Button>
	);
}

function HandoffBanner({
	phase,
	agentName,
}: {
	phase: CallPhase;
	agentName: string;
}) {
	if (phase === "ai_active") return null;

	const isHuman = phase === "human_live";
	return (
		<AnimatePresence>
			<motion.div
				initial={{ opacity: 0, y: -8 }}
				animate={{ opacity: 1, y: 0 }}
				className={`mx-auto mb-4 max-w-lg rounded-xl px-4 py-3 text-center text-sm ${
					isHuman
						? "bg-emerald-900/50 border border-emerald-400/40 text-emerald-100"
						: "bg-amber-900/40 border border-amber-400/40 text-amber-100"
				}`}
				aria-live="polite"
			>
				{isHuman ? (
					<>
						<p className="font-semibold">AI has left — you are with a human agent</p>
						<p className="mt-1 text-xs opacity-90">
							{agentName ? `Speaking with ${agentName}` : "A human agent is live on the call"}
						</p>
					</>
				) : (
					<>
						<p className="font-semibold">Connecting you to a human agent…</p>
						<p className="mt-1 text-xs opacity-80">Please hold — Sewa is transferring your call</p>
					</>
				)}
			</motion.div>
		</AnimatePresence>
	);
}

function AssistantVisualizer({
	roomLive,
	showAnalyticsPanel,
	phase,
	agentName,
}: {
	roomLive: boolean;
	showAnalyticsPanel: boolean;
	phase: CallPhase;
	agentName: string;
}) {
	const { state: aiState, audioTrack: aiAudioTrack } = useVoiceAssistant();
	const remotes = useRemoteParticipants();
	const micTracks = useTracks([Track.Source.Microphone], { onlySubscribed: true });

	const humanTrack = useMemo(() => {
		return micTracks.find((t) => (t.participant?.identity || "").startsWith("agent-human-"));
	}, [micTracks]);

	const humanParticipant = remotes.find((p) => (p.identity || "").startsWith("agent-human-"));
	const waitingForAgent = roomLive && remotes.length === 0 && phase === "ai_active";

	const auraState = phase === "human_live" ? "speaking" : aiState;
	const auraTrack =
		phase === "human_live" ? (humanTrack as Parameters<typeof AgentAudioVisualizerAura>[0]["audioTrack"]) : aiAudioTrack;
	const auraColor = phase === "human_live" ? "#22C55E" : phase === "handoff_pending" ? "#F59E0B" : "#1FD5F9";
	const isDev = typeof import.meta !== "undefined" && (import.meta as { env?: { DEV?: boolean } }).env?.DEV;

	const statusLabel =
		phase === "human_live"
			? `Speaking with ${agentName || humanParticipant?.name || "human agent"}`
			: phase === "handoff_pending"
				? "Transferring to human agent…"
				: undefined;

	return (
		<div className={`w-full mx-auto ${showAnalyticsPanel ? "max-w-xl" : "max-w-md"}`}>
			{isDev && waitingForAgent ? (
				<div className="mb-4 rounded-xl border border-indigo-400/30 bg-slate-900/70 p-4 text-left text-sm text-indigo-100">
					<p className="font-semibold mb-2">Voice worker not joined (dev only)</p>
					<p className="text-xs opacity-80">Start the voice agent worker in your bench container.</p>
				</div>
			) : waitingForAgent ? (
				<div className="mb-4 rounded-xl border border-indigo-400/20 bg-slate-900/50 p-4 text-center text-sm text-slate-300">
					Connecting to Sewa…
				</div>
			) : null}
			<AgentAudioVisualizerAura
				size={showAnalyticsPanel ? "sm" : "lg"}
				state={auraState}
				audioTrack={auraTrack}
				color={auraColor}
				themeMode="dark"
				style={{ borderRadius: 16, margin: "0 auto" }}
			/>
			<StatusIndicator state={aiState} waitingForAgent={waitingForAgent} labelOverride={statusLabel} />
		</div>
	);
}

export default function VoiceRoom({
	token,
	serverUrl,
	roomName,
	showAnalyticsPanel = false,
	isSupportPortal = true,
	onLeave,
}: {
	token: string;
	serverUrl: string;
	roomName: string;
	/** @deprecated Model chip hidden on support portal; kept for API compat */
	geminiModelLabel?: string;
	geminiModelId?: string;
	showAnalyticsPanel?: boolean;
	isSupportPortal?: boolean;
	onLeave: () => void;
}) {
	const [connected, setConnected] = useState(false);
	const [phase, setPhase] = useState<CallPhase>("ai_active");
	const [agentName, setAgentName] = useState("");

	const handler = useCallback((msg: { payload: Uint8Array }) => {
		try {
			const data = JSON.parse(new TextDecoder().decode(msg.payload)) as {
				status?: string;
				agent_name?: string;
			};
			if (data.status === "requested") setPhase("handoff_pending");
			if (data.status === "human_joined") {
				setPhase("human_live");
				if (data.agent_name) setAgentName(data.agent_name);
			}
		} catch {
			/* ignore */
		}
	}, []);

	useEffect(() => {
		setPhase("ai_active");
		setAgentName("");
	}, [token, roomName]);

	const shell = isSupportPortal ? SupportAppShell : ({ children }: { children: React.ReactNode }) => (
		<div className="min-h-dvh flex flex-col bg-gradient-to-br from-slate-900 to-indigo-950 text-slate-100 p-4">
			{children}
		</div>
	);

	const Shell = shell;

	return (
		<Shell>
			<div className="flex flex-1 flex-col px-4 pb-6">
				<div className="text-center py-3">
					<p className="text-xs uppercase tracking-widest text-emerald-200/60">
						{phase === "human_live" ? "Live with agent" : phase === "handoff_pending" ? "Handoff" : "AI support"}
					</p>
					<h1 className="text-base font-medium text-slate-100 mt-1">
						{phase === "human_live" ? "Human agent call" : "Voice support session"}
					</h1>
				</div>

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
					className="flex flex-1 flex-col"
				>
					<HandoffDataListener onMessage={handler} />
					<LiveVoiceModelSubscriber onModel={() => {}} />
					<RoomAudioRenderer />
					<HandoffBanner phase={phase} agentName={agentName} />
					<HumanJoinDetector onHumanJoin={(name) => { setPhase("human_live"); setAgentName(name); }} />
					<div
						className={`flex-1 flex ${showAnalyticsPanel ? "flex-col overflow-auto" : "items-center justify-center"}`}
					>
						<AssistantVisualizer
							roomLive={connected}
							showAnalyticsPanel={showAnalyticsPanel}
							phase={phase}
							agentName={agentName}
						/>
						{showAnalyticsPanel ? <ChatPanel /> : null}
					</div>
					<div className="flex justify-center pt-6 pb-safe">
						<EndSessionButton />
					</div>
				</LiveKitRoom>
			</div>
		</Shell>
	);
}

function HandoffDataListener({ onMessage }: { onMessage: (msg: { payload: Uint8Array }) => void }) {
	useDataChannel("handoff", onMessage);
	return null;
}

function HumanJoinDetector({ onHumanJoin }: { onHumanJoin: (name: string) => void }) {
	const remotes = useRemoteParticipants();
	useEffect(() => {
		const human = remotes.find((p) => (p.identity || "").startsWith("agent-human-"));
		if (human) onHumanJoin(human.name || human.identity.replace("agent-human-", ""));
	}, [remotes, onHumanJoin]);
	return null;
}
