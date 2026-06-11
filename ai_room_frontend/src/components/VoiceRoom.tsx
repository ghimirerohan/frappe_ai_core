import {
	LiveKitRoom,
	RoomAudioRenderer,
	useDataChannel,
	useRemoteParticipants,
	useTracks,
	useVoiceAssistant,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AgentAudioVisualizerAura } from "@/components/agents-ui/agent-audio-visualizer-aura";
import CallControlBar from "@/components/CallControlBar";
import { InterviewAppShell } from "@/components/layout/InterviewAppShell";
import { SupportAppShell } from "@/components/layout/SupportAppShell";
import { useCallTimer } from "@/hooks/useCallTimer";
import { cn, formatDuration } from "@/lib/utils";
import ChatPanel from "./ChatPanel";
import LiveCaptions from "./LiveCaptions";
import LiveVoiceModelSubscriber from "./LiveVoiceModelSubscriber";
import StatusIndicator from "./StatusIndicator";

type CallPhase = "ai_active" | "handoff_pending" | "human_live";
export type VoiceRoomVariant = "support" | "interview" | "plain";

function PhasePill({ phase, agentName }: { phase: CallPhase; agentName: string }) {
	if (phase === "ai_active") return null;
	const isHuman = phase === "human_live";
	return (
		<AnimatePresence>
			<motion.div
				initial={{ opacity: 0, y: -8 }}
				animate={{ opacity: 1, y: 0 }}
				className="flex justify-center mb-4"
				aria-live="polite"
			>
				<span
					className={cn(
						"inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm",
						isHuman
							? "bg-emerald-500/15 text-emerald-200"
							: "bg-amber-500/15 text-amber-200",
					)}
				>
					<span
						className={cn(
							"inline-block h-2 w-2 rounded-full",
							isHuman ? "bg-emerald-400" : "bg-amber-400 animate-pulse",
						)}
					/>
					{isHuman
						? agentName
							? `You're with ${agentName}`
							: "You're with a member of our team"
						: "Connecting you to a person — please hold"}
				</span>
			</motion.div>
		</AnimatePresence>
	);
}

function AssistantVisualizer({
	roomLive,
	showAnalyticsPanel,
	phase,
	agentName,
	assistantName,
}: {
	roomLive: boolean;
	showAnalyticsPanel: boolean;
	phase: CallPhase;
	agentName: string;
	assistantName: string;
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

	const speakerName =
		phase === "human_live" ? agentName || humanParticipant?.name || "Support agent" : assistantName;

	const statusLabel =
		phase === "human_live"
			? `On the line with ${speakerName}`
			: phase === "handoff_pending"
				? "Hold on — bringing someone in…"
				: undefined;

	return (
		<div className={`w-full mx-auto ${showAnalyticsPanel ? "max-w-xl" : "max-w-md"}`}>
			<AgentAudioVisualizerAura
				size={showAnalyticsPanel ? "sm" : "lg"}
				state={auraState}
				audioTrack={auraTrack}
				color={auraColor}
				themeMode="dark"
				style={{ borderRadius: 16, margin: "0 auto" }}
			/>
			<p className="mt-5 text-center text-lg font-medium text-slate-100">{speakerName}</p>
			<StatusIndicator
				state={aiState}
				waitingForAgent={waitingForAgent}
				labelOverride={statusLabel}
				assistantName={assistantName}
			/>
		</div>
	);
}

function CallTimer({ connected }: { connected: boolean }) {
	const seconds = useCallTimer(connected);
	if (!connected) return null;
	return <span className="text-xs tabular-nums text-slate-500">{formatDuration(seconds)}</span>;
}

export default function VoiceRoom({
	token,
	serverUrl,
	roomName,
	showAnalyticsPanel = false,
	isSupportPortal,
	variant,
	assistantName = "Sewa",
	onLeave,
}: {
	token: string;
	serverUrl: string;
	roomName: string;
	/** @deprecated Model chip hidden on support portal; kept for API compat */
	geminiModelLabel?: string;
	geminiModelId?: string;
	showAnalyticsPanel?: boolean;
	/** @deprecated Use `variant` instead; kept for API compat */
	isSupportPortal?: boolean;
	variant?: VoiceRoomVariant;
	assistantName?: string;
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

	const resolvedVariant: VoiceRoomVariant = variant ?? (isSupportPortal === false ? "plain" : "support");
	const Shell =
		resolvedVariant === "support"
			? SupportAppShell
			: resolvedVariant === "interview"
				? InterviewAppShell
				: ({ children }: { children: React.ReactNode }) => (
						<div className="min-h-dvh flex flex-col bg-slate-950 text-slate-100 p-4">{children}</div>
					);

	return (
		<Shell>
			<div className="flex flex-1 flex-col px-4 pb-2">
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
					<HumanJoinDetector
						onHumanJoin={(name) => {
							setPhase("human_live");
							setAgentName(name);
						}}
					/>
					<div className="flex justify-center pt-3">
						<CallTimer connected={connected} />
					</div>
					<div className="pt-2">
						<PhasePill phase={phase} agentName={agentName} />
					</div>
					<div
						className={`flex-1 flex ${showAnalyticsPanel ? "flex-col overflow-auto" : "items-center justify-center"}`}
					>
						<AssistantVisualizer
							roomLive={connected}
							showAnalyticsPanel={showAnalyticsPanel}
							phase={phase}
							agentName={agentName}
							assistantName={assistantName}
						/>
						{showAnalyticsPanel ? <ChatPanel /> : null}
					</div>
					{!showAnalyticsPanel && phase !== "human_live" ? (
						<div className="pb-1">
							<LiveCaptions speakerName={assistantName} />
						</div>
					) : null}
					<div className="pb-safe">
						<CallControlBar />
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
