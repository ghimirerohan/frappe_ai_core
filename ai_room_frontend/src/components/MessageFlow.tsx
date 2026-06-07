import { useDataChannel, useRemoteParticipants, useTranscriptions, useVoiceAssistant } from "@livekit/components-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgentAudioVisualizerAura } from "@/components/agents-ui/agent-audio-visualizer-aura";
import { detectArtifactKind, normalizeUiArtifact } from "@/lib/analyticsPayload";
import MessageBubble, { type UIBubble, type UIArtifact } from "./MessageBubble";
import type { TranscriptStream } from "./TranscriptBubble";
import StatusIndicator from "./StatusIndicator";

type ApiMessage = {
	name: string;
	role: string;
	content?: string;
	message_type?: string;
	artifacts?: Array<{ artifact_type: string; title?: string; chart_type?: string; payload_json?: unknown }>;
};

function decodePayload(raw: Uint8Array): unknown {
	try {
		return JSON.parse(new TextDecoder().decode(raw));
	} catch {
		return null;
	}
}

function normalizeStreamTs(t: number | undefined): number {
	if (t == null || !Number.isFinite(t)) return Date.now();
	/* LiveKit often uses seconds; ERPNext ts is ISO ms */
	return t < 1e12 ? Math.floor(t * 1000) : Math.floor(t);
}

function parseAnalyticsTs(raw: unknown): number {
	if (typeof raw === "number" && Number.isFinite(raw)) {
		return raw < 1e12 ? Math.floor(raw * 1000) : Math.floor(raw);
	}
	if (typeof raw === "string") {
		const ms = Date.parse(raw);
		if (!Number.isNaN(ms)) return ms;
	}
	return Date.now();
}

export default function MessageFlow({
	activeConversationId,
	selectedConversationId,
	focusedMessageId,
	onFocusMessage,
	onArtifactsUpdate,
	roomLive,
}: {
	activeConversationId: string | null;
	selectedConversationId: string;
	focusedMessageId: string | null;
	onFocusMessage: (id: string | null) => void;
	onArtifactsUpdate: (artifacts: UIArtifact[]) => void;
	roomLive: boolean;
}) {
	const transcriptions = useTranscriptions() as TranscriptStream[];
	const { state, audioTrack } = useVoiceAssistant();
	const remotes = useRemoteParticipants();
	const waitingForAgent = roomLive && remotes.length === 0;

	const [history, setHistory] = useState<UIBubble[]>([]);
	const [liveToolEvents, setLiveToolEvents] = useState<Array<{ at: number; bubble: UIBubble }>>([]);

	const bottomRef = useRef<HTMLDivElement>(null);

	const viewingLive =
		Boolean(activeConversationId) && selectedConversationId === activeConversationId;

	useEffect(() => {
		setLiveToolEvents([]);
	}, [activeConversationId]);

	useEffect(() => {
		if (viewingLive) {
			setHistory([]);
			return;
		}
		let cancelled = false;
		(async () => {
			try {
				const params = new URLSearchParams({
					conversation_id: selectedConversationId,
					limit: "200",
				});
				const res = await fetch(`/api/method/frappe_ai_core.api.session.get_conversation_messages?${params}`);
				const json = (await res.json()) as { message?: ApiMessage[]; exc?: string };
				if (!res.ok || json.exc || cancelled) return;
				const rows = Array.isArray(json.message) ? json.message : [];
				const mapped: UIBubble[] = rows.map((r) => {
					const artifacts = (r.artifacts ?? []).map((a) => {
						const norm = normalizeUiArtifact({
							artifact_type: a.artifact_type,
							title: a.title,
							chart_type: a.chart_type,
							payload_json: a.payload_json,
						});
						return {
							artifact_type: norm.artifact_type,
							title: norm.title,
							chart_type: norm.chart_type,
							payload_json: norm.payload_json,
						};
					});
					const summary =
						r.role === "tool_result"
							? (() => {
									const t = artifacts[0]?.title;
									return t ? `${r.content ?? "Tool"} · ${t}` : (r.content ?? "Tool result");
								})()
							: (r.content ?? "");
					return {
						id: r.name,
						role: (r.role as UIBubble["role"]) || "assistant",
						content: summary,
						messageType: r.message_type,
						artifacts,
					};
				});
				setHistory(mapped);
			} catch {
				if (!cancelled) setHistory([]);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [selectedConversationId, viewingLive]);

	const onAnalytics = useCallback(
		(msg: { payload: Uint8Array }) => {
			if (!viewingLive) return;
			const data = decodePayload(msg.payload) as {
				type?: string;
				tool?: string;
				ts?: unknown;
				payload?: Record<string, unknown>;
			} | null;
			if (!data || data.type !== "analytics_tool_result" || !data.payload) return;
			const id = `live-tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
			const tool = String(data.tool ?? "tool");
			const p = data.payload;
			const at = parseAnalyticsTs(data.ts);
			const detected = detectArtifactKind(p, tool);
			const norm = normalizeUiArtifact({
				artifact_type: detected.kind,
				title: detected.title,
				chart_type: detected.chartType,
				payload_json: p,
			});
			const artifact: UIArtifact = {
				artifact_type: norm.artifact_type,
				title: norm.title,
				chart_type: norm.chart_type,
				payload_json: norm.payload_json,
			};
			setLiveToolEvents((prev) => [
				...prev,
				{
					at,
					bubble: {
						id,
						role: "tool_result",
						content: `${tool} · ${detected.title}`,
						artifacts: [artifact],
					},
				},
			]);
		},
		[viewingLive],
	);

	useDataChannel("analytics", onAnalytics);

	const transcriptEvents = useMemo(() => {
		if (!viewingLive) return [];
		const sorted = [...transcriptions].sort(
			(a, b) => (a.streamInfo?.timestamp ?? 0) - (b.streamInfo?.timestamp ?? 0),
		);
		return sorted.map((s, i) => {
			const id = s.streamInfo?.id ?? `tr-${i}`;
			const isUser = (s.participantInfo?.identity ?? "").startsWith("user-");
			const at = normalizeStreamTs(s.streamInfo?.timestamp);
			return {
				at,
				bubble: {
					id: `live-tr-${id}-${i}`,
					role: isUser ? "user" : "assistant",
					content: s.text?.trim() || "…",
				} as UIBubble,
			};
		});
	}, [transcriptions, viewingLive]);

	const allBubbles = useMemo(() => {
		if (!viewingLive) return history;
		return [...transcriptEvents, ...liveToolEvents]
			.sort((a, b) => a.at - b.at)
			.map((e) => e.bubble);
	}, [viewingLive, transcriptEvents, liveToolEvents, history]);

	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [allBubbles.length, selectedConversationId, viewingLive]);

	const focusedArts = useMemo(() => {
		if (focusedMessageId) {
			return allBubbles.find((b) => b.id === focusedMessageId)?.artifacts ?? [];
		}
		const lastWithArt = [...allBubbles].reverse().find((b) => b.artifacts?.length);
		return lastWithArt?.artifacts ?? [];
	}, [allBubbles, focusedMessageId]);

	useEffect(() => {
		onArtifactsUpdate(focusedArts);
	}, [focusedArts, onArtifactsUpdate]);

	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col bg-slate-950/20">
			<div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
				{allBubbles.length === 0 ? (
					<p className="text-center text-sm text-slate-500">
						{viewingLive ? "Transcription appears as you speak…" : "No messages in this conversation."}
					</p>
				) : (
					allBubbles.map((b) => (
						<MessageBubble
							key={b.id}
							msg={b}
							isActive={focusedMessageId === b.id}
							onSelectArtifact={() => onFocusMessage(b.id)}
						/>
					))
				)}
				<div ref={bottomRef} />
			</div>
			<div className="shrink-0 border-t border-slate-700/40 bg-slate-900/40 px-4 py-4">
				<div className="mx-auto max-w-lg">
					<AgentAudioVisualizerAura
						size="sm"
						state={state}
						audioTrack={audioTrack}
						themeMode="dark"
						style={{ borderRadius: 16, margin: "0 auto" }}
					/>
					<StatusIndicator state={state} waitingForAgent={waitingForAgent} />
				</div>
			</div>
		</div>
	);
}
