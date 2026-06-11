import { LiveKitRoom, RoomAudioRenderer, useRemoteParticipants } from "@livekit/components-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import CallControlBar from "@/components/CallControlBar";
import { AgentAppShell } from "@/components/layout/AgentAppShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { useCallTimer } from "@/hooks/useCallTimer";
import { getMicrophoneBlockMessage } from "@/lib/mediaAccess";
import {
	closeHandoffNotification,
	notificationPermission,
	playIncomingChime,
	requestNotificationPermission,
	setQueueBadge,
	showHandoffNotification,
} from "@/lib/notifications";
import { cn, formatDuration, timeAgo } from "@/lib/utils";
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

const POLL_MS = 3000;
const INCOMING_POPUP_MS = 20000;

function initialOf(name?: string): string {
	return (name || "C").trim().charAt(0).toUpperCase() || "C";
}

function Avatar({ name, className }: { name?: string; className?: string }) {
	return (
		<div
			className={cn(
				"flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-base font-semibold text-blue-300",
				className,
			)}
		>
			{initialOf(name)}
		</div>
	);
}

function CustomerBrief({ row, compact = false }: { row: Partial<HandoffRow>; compact?: boolean }) {
	return (
		<div className="space-y-2 text-left">
			{row.customer_request ? (
				<p className="text-sm text-slate-200 leading-relaxed">
					<span className="text-slate-500">Needs help with — </span>
					{row.customer_request}
				</p>
			) : null}
			{row.reason && row.reason !== row.customer_request ? (
				<p className="text-sm text-slate-400 leading-relaxed">{row.reason}</p>
			) : null}
			{row.summary ? (
				<p
					className={cn(
						"text-sm text-slate-400 leading-relaxed whitespace-pre-wrap",
						compact && "line-clamp-3",
					)}
				>
					{row.summary}
				</p>
			) : null}
			{row.suggested_next_step ? (
				<div className="rounded-lg bg-blue-500/10 px-3 py-2 text-sm text-blue-200">
					<span className="font-medium">Start here:</span> {row.suggested_next_step}
				</div>
			) : null}
		</div>
	);
}

/** In-app popup announcing a new transfer; clicking it opens the confirmation dialog. */
function IncomingCallPopup({
	row,
	onView,
	onDismiss,
}: {
	row: HandoffRow | null;
	onView: (row: HandoffRow) => void;
	onDismiss: () => void;
}) {
	return (
		<AnimatePresence>
			{row ? (
				<motion.div
					initial={{ opacity: 0, y: -64 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: -64 }}
					transition={{ type: "spring", duration: 0.4, bounce: 0.25 }}
					className="fixed inset-x-0 top-3 z-40 mx-auto w-[min(26rem,calc(100vw-1.5rem))]"
				>
					<button
						type="button"
						onClick={() => onView(row)}
						className="w-full rounded-2xl border border-emerald-400/30 bg-slate-900/95 p-4 text-left shadow-2xl shadow-black/50 backdrop-blur transition-colors hover:border-emerald-400/60"
					>
						<div className="flex items-center gap-3">
							<span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
								<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/30" />
								<svg className="relative h-5 w-5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
									<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
								</svg>
							</span>
							<div className="min-w-0 flex-1">
								<p className="text-[11px] font-medium uppercase tracking-wider text-emerald-400">
									Incoming transfer
								</p>
								<p className="truncate text-sm font-semibold text-slate-50">
									{row.customer_name || "Customer"}
									{row.esewa_phone ? <span className="font-normal text-slate-400"> · {row.esewa_phone}</span> : null}
								</p>
								{row.customer_request ? (
									<p className="mt-0.5 truncate text-xs text-slate-400">{row.customer_request}</p>
								) : null}
							</div>
							<span
								role="button"
								tabIndex={0}
								aria-label="Dismiss"
								onClick={(e) => {
									e.stopPropagation();
									onDismiss();
								}}
								onKeyDown={(e) => {
									if (e.key === "Enter" || e.key === " ") {
										e.stopPropagation();
										onDismiss();
									}
								}}
								className="rounded-full p-2 text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-300"
							>
								<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
									<line x1="18" y1="6" x2="6" y2="18" />
									<line x1="6" y1="6" x2="18" y2="18" />
								</svg>
							</span>
						</div>
					</button>
				</motion.div>
			) : null}
		</AnimatePresence>
	);
}

/** Confirmation dialog: review who is waiting, then take the call. */
function ConfirmJoinModal({
	row,
	joining,
	error,
	onConfirm,
	onClose,
}: {
	row: HandoffRow | null;
	joining: boolean;
	error: string | null;
	onConfirm: (row: HandoffRow) => void;
	onClose: () => void;
}) {
	return (
		<Modal open={row !== null} onClose={joining ? undefined : onClose}>
			{row ? (
				<div className="p-6">
					<div className="mb-4 flex items-center gap-3">
						<Avatar name={row.customer_name} />
						<div className="min-w-0">
							<p className="truncate text-base font-semibold text-slate-50">
								{row.customer_name || "Customer"}
							</p>
							<p className="text-xs text-slate-400">
								{[row.esewa_phone, row.creation ? `waiting ${timeAgo(row.creation)}` : ""]
									.filter(Boolean)
									.join(" · ")}
							</p>
						</div>
					</div>
					<CustomerBrief row={row} />
					{error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
					<div className="mt-6 flex gap-3">
						<Button variant="ghost" size="md" className="flex-1" disabled={joining} onClick={onClose}>
							Not now
						</Button>
						<Button
							variant="agent"
							size="md"
							className="flex-1"
							disabled={joining}
							onClick={() => onConfirm(row)}
						>
							{joining ? "Connecting…" : "Accept & join"}
						</Button>
					</div>
				</div>
			) : null}
		</Modal>
	);
}

function AlertsBanner() {
	const [perm, setPerm] = useState(notificationPermission());
	if (perm !== "default") return null;
	return (
		<div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-blue-400/20 bg-blue-500/10 px-4 py-3">
			<p className="text-sm text-blue-100">Get alerted when a customer is transferred to you.</p>
			<Button
				variant="agent"
				size="sm"
				onClick={() => {
					void requestNotificationPermission().then(setPerm);
				}}
			>
				Enable alerts
			</Button>
		</div>
	);
}

function LiveCallStatus({ seconds }: { seconds: number }) {
	const remotes = useRemoteParticipants();
	const customerOn = remotes.some((p) => (p.identity || "").startsWith("user-"));
	return (
		<div className="flex flex-col items-center gap-1 py-4">
			<span className="flex items-center gap-2 text-sm font-medium text-slate-200">
				<span
					className={cn(
						"inline-block h-2 w-2 rounded-full",
						customerOn ? "bg-emerald-400" : "bg-amber-400 animate-pulse",
					)}
				/>
				{customerOn ? "Customer is on the line" : "Waiting for the customer…"}
			</span>
			<span className="text-xs tabular-nums text-slate-500">{formatDuration(seconds)}</span>
		</div>
	);
}

export default function AgentConsole() {
	const [rows, setRows] = useState<HandoffRow[]>([]);
	const [loaded, setLoaded] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [joinError, setJoinError] = useState<string | null>(null);
	const [accepting, setAccepting] = useState<string | null>(null);
	const [active, setActive] = useState<ActiveCall | null>(null);
	const [incoming, setIncoming] = useState<HandoffRow | null>(null);
	const [confirming, setConfirming] = useState<HandoffRow | null>(null);
	const [deepLink, setDeepLink] = useState<string | null>(() => {
		const fromUrl = new URLSearchParams(window.location.search).get("handoff");
		if (fromUrl) {
			const u = new URL(window.location.href);
			u.searchParams.delete("handoff");
			window.history.replaceState({}, "", u);
		}
		return fromUrl;
	});

	const activeRef = useRef(false);
	activeRef.current = active !== null;
	const seenRef = useRef<Set<string> | null>(null);
	const callSeconds = useCallTimer(active !== null);

	const load = useCallback(async () => {
		try {
			const data = await apiGet<HandoffRow[]>("frappe_ai_core.api.handoff.list_pending_handoffs");
			setError(null);
			setRows(Array.isArray(data) ? data : []);
			setLoaded(true);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	}, []);

	useEffect(() => {
		void load();
		const id = window.setInterval(() => void load(), POLL_MS);
		const onVisible = () => {
			if (!document.hidden) void load();
		};
		document.addEventListener("visibilitychange", onVisible);
		return () => {
			window.clearInterval(id);
			document.removeEventListener("visibilitychange", onVisible);
		};
	}, [load]);

	// Notification relay: alert on transfers that arrive after the first load.
	useEffect(() => {
		if (!loaded) return;
		const requested = rows.filter((r) => r.status === "Requested");
		setQueueBadge(requested.length);

		if (seenRef.current === null) {
			seenRef.current = new Set(rows.map((r) => r.name));
			return;
		}
		const seen = seenRef.current;
		for (const r of requested) {
			if (seen.has(r.name)) continue;
			seen.add(r.name);
			playIncomingChime();
			if (document.hidden || activeRef.current) {
				void showHandoffNotification({
					handoff: r.name,
					customerName: r.customer_name,
					phone: r.esewa_phone,
					request: r.customer_request,
				});
			}
			if (!activeRef.current) setIncoming(r);
		}

		// Drop alerts for handoffs another agent already took.
		const live = new Set(rows.map((r) => r.name));
		setIncoming((cur) => (cur && !live.has(cur.name) ? null : cur));
		setConfirming((cur) => (cur && !live.has(cur.name) ? null : cur));
	}, [rows, loaded]);

	useEffect(() => {
		if (!incoming) return;
		const id = window.setTimeout(() => setIncoming(null), INCOMING_POPUP_MS);
		return () => window.clearTimeout(id);
	}, [incoming]);

	// Notification clicks (service worker or fallback) deep-link into the confirmation dialog.
	useEffect(() => {
		const onSwMessage = (e: MessageEvent) => {
			const d = e.data as { type?: string; handoff?: string } | null;
			if (d?.type === "handoff-notification-click" && d.handoff) setDeepLink(d.handoff);
		};
		const onWinEvent = (e: Event) => {
			const detail = (e as CustomEvent<{ handoff?: string }>).detail;
			if (detail?.handoff) setDeepLink(detail.handoff);
		};
		navigator.serviceWorker?.addEventListener("message", onSwMessage);
		window.addEventListener("handoff-notification-click", onWinEvent);
		return () => {
			navigator.serviceWorker?.removeEventListener("message", onSwMessage);
			window.removeEventListener("handoff-notification-click", onWinEvent);
		};
	}, []);

	useEffect(() => {
		if (!deepLink || !loaded || activeRef.current) return;
		const row = rows.find((r) => r.name === deepLink);
		if (row) {
			setConfirming(row);
			setIncoming(null);
			setDeepLink(null);
		} else {
			setError("That call is no longer waiting — it may have been taken or ended.");
			setDeepLink(null);
		}
	}, [deepLink, loaded, rows]);

	const openConfirm = useCallback((row: HandoffRow) => {
		setJoinError(null);
		setIncoming(null);
		setConfirming(row);
	}, []);

	const accept = useCallback(
		async (row: HandoffRow) => {
			setAccepting(row.name);
			setJoinError(null);
			const micBlock = getMicrophoneBlockMessage();
			if (micBlock) {
				setJoinError(micBlock);
				setAccepting(null);
				return;
			}
			try {
				const m = await apiPost<ActiveCall>("frappe_ai_core.api.handoff.accept_handoff", {
					handoff_name: row.name,
				});
				setActive({
					handoff: row.name,
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
				setConfirming(null);
				setIncoming(null);
				void closeHandoffNotification(row.name);
			} catch (e) {
				setJoinError(e instanceof Error ? e.message : String(e));
			} finally {
				setAccepting(null);
			}
		},
		[],
	);

	const complete = useCallback(
		async (name: string) => {
			try {
				await apiPost("frappe_ai_core.api.handoff.complete_handoff", { handoff_name: name });
			} catch {
				/* best effort */
			}
			setActive(null);
			void load();
		},
		[load],
	);

	if (active) {
		return (
			<AgentAppShell title="Live call" subtitle="You are connected to the customer">
				<div className="mx-auto flex w-full max-w-2xl flex-1 flex-col p-4">
					<Card className="mb-4">
						<div className="mb-4 flex items-center gap-3">
							<Avatar name={active.customer_name} />
							<div className="min-w-0">
								<p className="truncate text-base font-semibold text-slate-50">
									{active.customer_name || "Customer"}
								</p>
								{active.esewa_phone ? <p className="text-xs text-slate-400">{active.esewa_phone}</p> : null}
							</div>
							<Badge variant="success" className="ml-auto">
								Live
							</Badge>
						</div>
						<CustomerBrief row={active} />
					</Card>
					<LiveKitRoom
						token={active.token}
						serverUrl={active.livekit_url}
						connect
						audio
						video={false}
						onDisconnected={() => setActive(null)}
						className="flex flex-1 flex-col justify-end"
					>
						<RoomAudioRenderer />
						<LiveCallStatus seconds={callSeconds} />
						<CallControlBar onHangUp={() => void complete(active.handoff)} />
					</LiveKitRoom>
				</div>
			</AgentAppShell>
		);
	}

	const waiting = rows.filter((r) => r.status === "Requested");
	const mine = rows.filter((r) => r.status === "Accepted");

	return (
		<AgentAppShell>
			<IncomingCallPopup row={incoming} onView={openConfirm} onDismiss={() => setIncoming(null)} />
			<ConfirmJoinModal
				row={confirming}
				joining={accepting !== null}
				error={joinError}
				onConfirm={(row) => void accept(row)}
				onClose={() => setConfirming(null)}
			/>

			<div className="mx-auto w-full max-w-2xl p-5">
				<div className="mb-1 flex items-center justify-between">
					<h2 className="text-lg font-semibold text-slate-50">Call queue</h2>
					<span className="flex items-center gap-1.5 text-xs text-slate-400">
						<span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
						Watching for transfers
					</span>
				</div>
				<p className="mb-5 text-sm text-slate-400">
					Customers handed over by the assistant appear here the moment they're transferred.
				</p>

				<AlertsBanner />
				{error ? <p className="mb-4 text-sm text-red-300">{error}</p> : null}

				{mine.length > 0 ? (
					<div className="mb-6">
						<p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">Your active calls</p>
						{mine.map((r) => (
							<Card key={r.name} className="mb-3 border-emerald-400/20">
								<div className="flex items-center gap-3">
									<Avatar name={r.customer_name} className="bg-emerald-500/15 text-emerald-300" />
									<div className="min-w-0 flex-1">
										<p className="truncate font-semibold text-slate-100">{r.customer_name || "Customer"}</p>
										{r.esewa_phone ? <p className="text-xs text-slate-400">{r.esewa_phone}</p> : null}
									</div>
									<Button variant="primary" size="sm" disabled={accepting !== null} onClick={() => void accept(r)}>
										{accepting === r.name ? "Connecting…" : "Rejoin"}
									</Button>
								</div>
							</Card>
						))}
					</div>
				) : null}

				{waiting.length === 0 ? (
					<Card className="py-10 text-center">
						<p className="text-sm text-slate-400">No one is waiting right now.</p>
						<p className="mt-1 text-xs text-slate-500">You'll be alerted as soon as a customer needs you.</p>
					</Card>
				) : (
					waiting.map((r) => (
						<Card key={r.name} className="mb-3">
							<div className="mb-3 flex items-center gap-3">
								<Avatar name={r.customer_name} />
								<div className="min-w-0 flex-1">
									<p className="truncate font-semibold text-slate-100">{r.customer_name || "Customer"}</p>
									<p className="text-xs text-slate-400">
										{[r.esewa_phone, r.creation ? `waiting ${timeAgo(r.creation)}` : ""]
											.filter(Boolean)
											.join(" · ")}
									</p>
								</div>
								<Badge variant="warning">Waiting</Badge>
							</div>
							<CustomerBrief row={r} compact />
							<div className="mt-4">
								<Button variant="agent" size="sm" disabled={accepting !== null} onClick={() => openConfirm(r)}>
									Take this call
								</Button>
							</div>
						</Card>
					))
				)}
			</div>
		</AgentAppShell>
	);
}
