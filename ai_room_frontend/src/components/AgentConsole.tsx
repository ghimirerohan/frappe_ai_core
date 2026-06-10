import {
	LiveKitRoom,
	RoomAudioRenderer,
	useRemoteParticipants,
	useRoomContext,
} from "@livekit/components-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AgentAppShell } from "@/components/layout/AgentAppShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { getMicrophoneBlockMessage } from "@/lib/mediaAccess";
import { apiGet, apiPost } from "@/utils/api";

type HandoffRow = {
	name: string;
	session: string;
	room_name?: string;
	status: string;
	requested_by?: string;
	assigned_agent?: string;
	customer_name?: string;
	esewa_phone?: string;
	reason?: string;
	customer_request?: string;
	summary?: string;
	suggested_next_step?: string;
	creation?: string;
};

type ActiveCall = {
	handoff: string;
	token: string;
	livekit_url: string;
	room_name: string;
	session: string;
	customer_name: string;
	esewa_phone: string;
	summary: string;
	customer_request: string;
	suggested_next_step: string;
	reason: string;
};

const POLL_MS = 4000;

function IdentityBlock({ name, phone }: { name?: string; phone?: string }) {
	if (!name && !phone) return null;
	return (
		<div className="rounded-lg bg-blue-500/10 border border-blue-400/25 px-3 py-2 mb-3">
			<p className="text-xs uppercase tracking-wider text-blue-300 mb-1">Customer identity</p>
			{name ? (
				<p className="text-sm font-medium text-slate-100">
					<span className="text-slate-400">Name:</span> {name}
				</p>
			) : null}
			{phone ? (
				<p className="text-sm font-medium text-slate-100 mt-0.5">
					<span className="text-slate-400">Mobile:</span> {phone}
				</p>
			) : null}
		</div>
	);
}

function CallControls({ onComplete }: { onComplete: () => void }) {
	const room = useRoomContext();
	const remotes = useRemoteParticipants();
	const clientPresent = remotes.some((p) => (p.identity || "").startsWith("user-"));
	return (
		<div className="flex flex-col items-center gap-3 py-6">
			<p className="text-sm text-slate-400">
				{clientPresent ? "Customer is on the line — you are live." : "Waiting for customer to connect…"}
			</p>
			<Button variant="danger" onClick={() => { room.disconnect(); onComplete(); }}>
				End handoff
			</Button>
		</div>
	);
}

export default function AgentConsole() {
	const [rows, setRows] = useState<HandoffRow[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [accepting, setAccepting] = useState<string | null>(null);
	const [active, setActive] = useState<ActiveCall | null>(null);
	const activeRef = useRef(false);
	activeRef.current = active !== null;

	const load = useCallback(async () => {
		try {
			const data = await apiGet<HandoffRow[]>("frappe_ai_core.api.handoff.list_pending_handoffs");
			setError(null);
			setRows(Array.isArray(data) ? data : []);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	}, []);

	useEffect(() => {
		void load();
		const id = window.setInterval(() => {
			if (!activeRef.current) void load();
		}, POLL_MS);
		return () => window.clearInterval(id);
	}, [load]);

	const accept = useCallback(async (name: string) => {
		setAccepting(name);
		setError(null);
		const micBlock = getMicrophoneBlockMessage();
		if (micBlock) {
			setError(micBlock);
			setAccepting(null);
			return;
		}
		try {
			const m = await apiPost<ActiveCall>("frappe_ai_core.api.handoff.accept_handoff", {
				handoff_name: name,
			});
			setActive({
				handoff: name,
				token: m.token,
				livekit_url: m.livekit_url,
				room_name: m.room_name,
				session: m.session,
				customer_name: m.customer_name || "",
				esewa_phone: m.esewa_phone || "",
				summary: m.summary || "",
				customer_request: m.customer_request || "",
				suggested_next_step: m.suggested_next_step || "",
				reason: m.reason || "",
			});
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setAccepting(null);
		}
	}, []);

	const complete = useCallback(async (name: string) => {
		try {
			await apiPost("frappe_ai_core.api.handoff.complete_handoff", { handoff_name: name });
		} catch {
			/* best effort */
		}
		setActive(null);
		void load();
	}, [load]);

	if (active) {
		return (
			<AgentAppShell title="Live handoff" subtitle={active.room_name}>
				<div className="flex flex-1 flex-col p-4 max-w-2xl mx-auto w-full">
					<Card className="mb-4">
						<IdentityBlock name={active.customer_name} phone={active.esewa_phone} />
						{active.reason ? (
							<p className="text-sm mb-2">
								<span className="text-slate-400">Reason:</span> {active.reason}
							</p>
						) : null}
						{active.customer_request ? (
							<p className="text-sm mb-2">
								<span className="text-slate-400">Customer wants:</span> {active.customer_request}
							</p>
						) : null}
						{active.summary ? (
							<p className="text-sm text-slate-300 whitespace-pre-wrap mb-2">{active.summary}</p>
						) : (
							<p className="text-sm text-slate-500 mb-2">No summary from AI.</p>
						)}
						{active.suggested_next_step ? (
							<div className="rounded-lg bg-indigo-500/15 border border-indigo-400/30 px-3 py-2 text-sm">
								<span className="text-indigo-300 font-medium">Start here:</span> {active.suggested_next_step}
							</div>
						) : null}
					</Card>
					<LiveKitRoom
						token={active.token}
						serverUrl={active.livekit_url}
						connect
						audio
						video={false}
						onDisconnected={() => setActive(null)}
						className="flex-1 flex flex-col justify-center"
					>
						<RoomAudioRenderer />
						<CallControls onComplete={() => void complete(active.handoff)} />
					</LiveKitRoom>
				</div>
			</AgentAppShell>
		);
	}

	return (
		<AgentAppShell>
			<div className="p-5 max-w-2xl mx-auto w-full">
				<h2 className="text-lg font-semibold text-slate-50 mb-1">Incoming handoffs</h2>
				<p className="text-sm text-slate-400 mb-6">
					Calls transferred by Sewa (AI). Accept to join the customer's live session.
				</p>
				{error ? <p className="text-red-300 text-sm mb-4">{error}</p> : null}
				{rows.length === 0 ? (
					<Card className="text-center text-slate-400 text-sm py-8">
						No pending handoffs. New transfers appear here automatically.
					</Card>
				) : (
					rows.map((r) => (
						<Card key={r.name} className="mb-3">
							<div className="flex justify-between items-start mb-3">
								<div>
									<p className="font-semibold text-slate-100">
										{r.customer_name || r.requested_by || "Customer"}
									</p>
									{r.esewa_phone ? (
										<p className="text-xs text-slate-400 mt-0.5">{r.esewa_phone}</p>
									) : null}
								</div>
								<Badge variant={r.status === "Accepted" ? "success" : "warning"}>{r.status}</Badge>
							</div>
							<IdentityBlock name={r.customer_name} phone={r.esewa_phone} />
							{r.customer_request ? (
								<p className="text-sm mb-2">
									<span className="text-slate-400">Wants:</span> {r.customer_request}
								</p>
							) : null}
							{r.summary ? (
								<p className="text-sm text-slate-400 whitespace-pre-wrap mb-2 line-clamp-3">{r.summary}</p>
							) : null}
							{r.suggested_next_step ? (
								<p className="text-sm text-indigo-200 mb-3">
									<span className="font-medium">Start here:</span> {r.suggested_next_step}
								</p>
							) : null}
							<Button
								variant="agent"
								size="sm"
								disabled={accepting === r.name}
								onClick={() => void accept(r.name)}
							>
								{accepting === r.name ? "Joining…" : r.status === "Accepted" ? "Rejoin call" : "Accept & join"}
							</Button>
						</Card>
					))
				)}
			</div>
		</AgentAppShell>
	);
}
