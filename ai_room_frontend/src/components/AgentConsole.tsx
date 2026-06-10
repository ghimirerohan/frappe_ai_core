import {
	LiveKitRoom,
	RoomAudioRenderer,
	useRemoteParticipants,
	useRoomContext,
} from "@livekit/components-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { getMicrophoneBlockMessage } from "@/lib/mediaAccess";
import { csrf } from "@/utils/csrf";

type HandoffRow = {
	name: string;
	session: string;
	room_name?: string;
	status: string;
	requested_by?: string;
	assigned_agent?: string;
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
	summary: string;
	customer_request: string;
	suggested_next_step: string;
	reason: string;
};

const POLL_MS = 4000;

const cardStyle: React.CSSProperties = {
	background: "rgba(15, 23, 42, 0.7)",
	border: "1px solid rgba(148, 163, 184, 0.3)",
	borderRadius: 14,
	padding: "1rem 1.15rem",
	marginBottom: "1rem",
	textAlign: "left",
};

function CallControls({ onComplete }: { onComplete: () => void }) {
	const room = useRoomContext();
	const remotes = useRemoteParticipants();
	const clientPresent = remotes.some((p) => (p.identity || "").startsWith("user-"));
	return (
		<div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem" }}>
			<p style={{ margin: 0, fontSize: "0.85rem", opacity: 0.85 }}>
				{clientPresent ? "Client is connected — you are live." : "Waiting for the client on the line…"}
			</p>
			<button
				type="button"
				onClick={() => {
					room.disconnect();
					onComplete();
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
				End handoff
			</button>
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
			const res = await fetch("/api/method/frappe_ai_core.api.handoff.list_pending_handoffs");
			const json = (await res.json()) as { message?: HandoffRow[]; exc?: string };
			if (!res.ok || json.exc) {
				setError(typeof json.exc === "string" ? json.exc : res.statusText);
				return;
			}
			setError(null);
			setRows(Array.isArray(json.message) ? json.message : []);
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
			return;
		}
		try {
			const res = await fetch(
				`/api/method/frappe_ai_core.api.handoff.accept_handoff?handoff_name=${encodeURIComponent(name)}`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json", "X-Frappe-CSRF-Token": csrf() },
				},
			);
			const json = await res.json();
			if (!res.ok || json.exc) throw new Error(json.exc || json.message || res.statusText);
			const m = json.message;
			setActive({
				handoff: name,
				token: m.token,
				livekit_url: m.livekit_url,
				room_name: m.room_name,
				session: m.session,
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
			await fetch(
				`/api/method/frappe_ai_core.api.handoff.complete_handoff?handoff_name=${encodeURIComponent(name)}`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json", "X-Frappe-CSRF-Token": csrf() },
				},
			);
		} catch {
			/* best effort */
		}
		setActive(null);
		void load();
	}, [load]);

	if (active) {
		return (
			<div
				style={{
					minHeight: "100dvh",
					display: "flex",
					flexDirection: "column",
					background: "linear-gradient(160deg, #0f172a, #1e293b)",
					color: "#e2e8f0",
					fontFamily: "system-ui, sans-serif",
					padding: "1rem",
				}}
			>
				<header style={{ textAlign: "center", marginBottom: "1rem" }}>
					<h1 style={{ fontSize: "1.15rem", margin: 0 }}>Handoff call · {active.room_name}</h1>
				</header>
				<div style={{ ...cardStyle, maxWidth: 560, margin: "0 auto 1rem", width: "100%" }}>
					{active.reason ? (
						<p style={{ margin: "0 0 0.5rem" }}>
							<strong>Reason:</strong> {active.reason}
						</p>
					) : null}
					{active.customer_request ? (
						<p style={{ margin: "0 0 0.5rem" }}>
							<strong>Customer wants:</strong> {active.customer_request}
						</p>
					) : null}
					{active.summary ? (
						<p style={{ margin: "0 0 0.5rem", whiteSpace: "pre-wrap", opacity: 0.92 }}>
							<strong>Summary so far:</strong> {active.summary}
						</p>
					) : (
						<p style={{ margin: "0 0 0.5rem", opacity: 0.7 }}>No summary was provided by the AI.</p>
					)}
					{active.suggested_next_step ? (
						<p
							style={{
								margin: 0,
								padding: "0.5rem 0.65rem",
								borderRadius: 8,
								background: "rgba(99, 102, 241, 0.18)",
								border: "1px solid rgba(129, 140, 248, 0.4)",
								whiteSpace: "pre-wrap",
							}}
						>
							<strong>Start here:</strong> {active.suggested_next_step}
						</p>
					) : null}
				</div>
				<LiveKitRoom
					token={active.token}
					serverUrl={active.livekit_url}
					connect
					audio
					video={false}
					data-lk-theme="default"
					onDisconnected={() => setActive(null)}
					style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}
				>
					<RoomAudioRenderer />
					<CallControls onComplete={() => void complete(active.handoff)} />
				</LiveKitRoom>
			</div>
		);
	}

	return (
		<div
			style={{
				minHeight: "100dvh",
				background: "linear-gradient(160deg, #0f172a, #1e1b4b)",
				color: "#e2e8f0",
				fontFamily: "system-ui, sans-serif",
				padding: "1.5rem",
			}}
		>
			<div style={{ maxWidth: 640, margin: "0 auto" }}>
				<h1 style={{ fontSize: "1.35rem", marginBottom: "0.25rem" }}>Human Agent Console</h1>
				<p style={{ opacity: 0.8, marginTop: 0, marginBottom: "0.5rem", fontSize: "0.9rem" }}>
					Incoming calls the AI has transferred. Accept one to join the client's live call.
				</p>
				<p style={{ marginTop: 0, marginBottom: "1.25rem" }}>
					<a href="/support" style={{ color: "#a5b4fc", fontSize: "0.8rem", textDecoration: "none", opacity: 0.85 }}>
						← Customer support portal
					</a>
				</p>
				{error ? (
					<p style={{ color: "#fca5a5", marginBottom: "1rem", fontSize: "0.9rem" }}>{error}</p>
				) : null}
				{rows.length === 0 ? (
					<p style={{ opacity: 0.7 }}>No pending handoffs right now. New transfers will appear here.</p>
				) : (
					rows.map((r) => (
						<div key={r.name} style={cardStyle}>
							<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
								<span style={{ fontWeight: 600 }}>{r.requested_by || "Client"}</span>
								<span
									style={{
										fontSize: "0.7rem",
										padding: "2px 8px",
										borderRadius: 999,
										background: r.status === "Accepted" ? "rgba(74, 222, 128, 0.2)" : "rgba(251, 191, 36, 0.2)",
										color: r.status === "Accepted" ? "#86efac" : "#fcd34d",
									}}
								>
									{r.status}
								</span>
							</div>
							{r.customer_request ? (
								<p style={{ margin: "0 0 0.4rem", fontSize: "0.9rem" }}>
									<strong>Wants:</strong> {r.customer_request}
								</p>
							) : null}
							{r.summary ? (
								<p style={{ margin: "0 0 0.5rem", fontSize: "0.85rem", opacity: 0.85, whiteSpace: "pre-wrap" }}>
									{r.summary}
								</p>
							) : null}
							{r.suggested_next_step ? (
								<p style={{ margin: "0 0 0.6rem", fontSize: "0.85rem", color: "#c7d2fe" }}>
									<strong>Start here:</strong> {r.suggested_next_step}
								</p>
							) : null}
							<button
								type="button"
								onClick={() => void accept(r.name)}
								disabled={accepting === r.name}
								style={{
									padding: "10px 20px",
									borderRadius: 10,
									border: "none",
									background: "#6366f1",
									color: "#fff",
									fontSize: "0.95rem",
									cursor: accepting === r.name ? "not-allowed" : "pointer",
									opacity: accepting === r.name ? 0.6 : 1,
								}}
							>
								{accepting === r.name ? "Joining…" : r.status === "Accepted" ? "Rejoin call" : "Accept & join"}
							</button>
						</div>
					))
				)}
			</div>
		</div>
	);
}
