import {
	LiveKitRoom,
	RoomAudioRenderer,
	useRoomContext,
} from "@livekit/components-react";
import { useCallback, useEffect, useState } from "react";
import ArtifactCanvas from "./ArtifactCanvas";
import ConversationSidebar from "./ConversationSidebar";
import LiveVoiceModelSubscriber from "./LiveVoiceModelSubscriber";
import MessageFlow from "./MessageFlow";
import type { UIArtifact } from "./MessageBubble";

function SessionEndButton() {
	const room = useRoomContext();
	return (
		<button
			type="button"
			onClick={() => room.disconnect()}
			className="rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-400"
		>
			End session
		</button>
	);
}

function AnalyticsRoomBody({
	roomName,
	conversationId,
	geminiModelLabel,
	geminiModelId,
	modelConfirmedByWorker,
	selectedConversationId,
	setSelectedConversationId,
	focusedMessageId,
	setFocusedMessageId,
	onArtifactsUpdate,
	canvasArtifacts,
	roomLive,
}: {
	roomName: string;
	conversationId: string | null;
	geminiModelLabel?: string;
	geminiModelId?: string;
	modelConfirmedByWorker: boolean;
	selectedConversationId: string;
	setSelectedConversationId: (id: string) => void;
	focusedMessageId: string | null;
	setFocusedMessageId: (id: string | null) => void;
	onArtifactsUpdate: (a: UIArtifact[]) => void;
	canvasArtifacts: UIArtifact[];
	roomLive: boolean;
}) {
	const room = useRoomContext();

	return (
		<>
			<header className="shrink-0 border-b border-slate-700/40 px-4 py-3">
				<div className="mx-auto flex max-w-[1400px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<h1 className="text-base font-semibold text-slate-100">Analytics · {roomName}</h1>
						<p className="text-xs text-slate-400">
							{roomLive ? "Live" : "Connecting…"} · ERPNext voice analytics
						</p>
						{geminiModelId || geminiModelLabel ? (
							<div className="mt-1">
								<p
									className={`text-[0.6rem] ${modelConfirmedByWorker ? "text-emerald-400/90" : "text-amber-200/80"}`}
								>
									{modelConfirmedByWorker
										? "Voice worker — model in use (same string passed to Gemini Live)"
										: "From session token; updates when the voice worker joins"}
								</p>
								<p
									className="mt-0.5 font-mono text-[0.72rem] font-semibold text-indigo-200"
									title={geminiModelId || geminiModelLabel}
								>
									{geminiModelId || geminiModelLabel}
								</p>
								{geminiModelLabel && geminiModelId && geminiModelLabel !== geminiModelId ? (
									<p className="mt-0.5 text-[0.68rem] text-slate-400">{geminiModelLabel}</p>
								) : null}
							</div>
						) : null}
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<SessionEndButton />
					</div>
				</div>
			</header>
			<RoomAudioRenderer />
			<div className="mx-auto flex min-h-0 w-full max-w-[1400px] flex-1">
				<ConversationSidebar
					activeConversationId={conversationId}
					selectedConversationId={selectedConversationId}
					onSelectConversation={(id) => {
						setSelectedConversationId(id);
						setFocusedMessageId(null);
					}}
					onNewChat={() => {
						room.disconnect();
					}}
				/>
				<MessageFlow
					activeConversationId={conversationId}
					selectedConversationId={selectedConversationId}
					focusedMessageId={focusedMessageId}
					onFocusMessage={setFocusedMessageId}
					onArtifactsUpdate={onArtifactsUpdate}
					roomLive={roomLive}
				/>
				<ArtifactCanvas artifacts={canvasArtifacts} />
			</div>
		</>
	);
}

export default function AnalyticsLayout({
	token,
	serverUrl,
	roomName,
	conversationId,
	geminiModelLabel,
	geminiModelId,
	onLeave,
}: {
	token: string;
	serverUrl: string;
	roomName: string;
	conversationId: string | null;
	geminiModelLabel?: string;
	geminiModelId?: string;
	onLeave: () => void;
}) {
	const [connected, setConnected] = useState(false);
	const [selectedConversationId, setSelectedConversationId] = useState(conversationId ?? "");
	const [focusedMessageId, setFocusedMessageId] = useState<string | null>(null);
	const [canvasArtifacts, setCanvasArtifacts] = useState<UIArtifact[]>([]);
	const [liveWorkerModel, setLiveWorkerModel] = useState<{ id: string; label: string } | null>(null);

	const onArtifactsUpdate = useCallback((a: UIArtifact[]) => {
		setCanvasArtifacts(a);
	}, []);

	const handleWorkerModel = useCallback((id: string, label: string) => {
		setLiveWorkerModel({ id, label });
	}, []);

	useEffect(() => {
		if (conversationId) setSelectedConversationId(conversationId);
	}, [conversationId]);

	useEffect(() => {
		setLiveWorkerModel(null);
	}, [roomName, token]);

	const effectiveSelected = selectedConversationId || conversationId || "";
	const displayModelId = liveWorkerModel?.id || geminiModelId;
	const displayModelLabel = liveWorkerModel?.label || geminiModelLabel;

	return (
		<div className="flex min-h-[100dvh] flex-col bg-gradient-to-br from-[#0f172a] to-[#312e81] font-sans text-slate-100">
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
				className="flex min-h-[100dvh] flex-1 flex-col"
			>
				<LiveVoiceModelSubscriber onModel={handleWorkerModel} />
				<AnalyticsRoomBody
					roomName={roomName}
					conversationId={conversationId}
					geminiModelLabel={displayModelLabel}
					geminiModelId={displayModelId}
					modelConfirmedByWorker={Boolean(liveWorkerModel)}
					selectedConversationId={effectiveSelected}
					setSelectedConversationId={setSelectedConversationId}
					focusedMessageId={focusedMessageId}
					setFocusedMessageId={setFocusedMessageId}
					onArtifactsUpdate={onArtifactsUpdate}
					canvasArtifacts={canvasArtifacts}
					roomLive={connected}
				/>
			</LiveKitRoom>
		</div>
	);
}
