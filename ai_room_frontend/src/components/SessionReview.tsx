import { useCallback, useEffect, useState } from "react";

type Evaluation = {
	score?: number;
	summary?: string;
	highlights?: string[];
	weaknesses?: string[];
	raw?: string;
	error?: string;
};

type Handoff = {
	name?: string;
	status?: string;
	reason?: string;
	summary?: string;
	customer_request?: string;
	suggested_next_step?: string;
	assigned_agent?: string;
};

type SessionReviewData = {
	name: string;
	status: string;
	score: number | null;
	evaluation: Evaluation;
	transcript: string;
	template?: string;
	template_label?: string;
	user?: string;
	started_at?: string;
	ended_at?: string;
	total_tokens?: number;
	cost_usd?: number;
	cost_npr?: number;
	handoff?: Handoff | null;
	is_manager?: boolean;
};

const card: React.CSSProperties = {
	background: "rgba(15, 23, 42, 0.7)",
	border: "1px solid rgba(148, 163, 184, 0.22)",
	borderRadius: 14,
	padding: "1rem 1.15rem",
	marginBottom: "1rem",
};

function scoreColor(score: number): string {
	if (score >= 80) return "#4ade80";
	if (score >= 60) return "#fbbf24";
	return "#f87171";
}

export default function SessionReview({
	sessionName,
	backHref = "/support",
	backLabel = "← Back to support",
}: {
	sessionName: string;
	backHref?: string;
	backLabel?: string;
}) {
	const [data, setData] = useState<SessionReviewData | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [polling, setPolling] = useState(true);

	const load = useCallback(async () => {
		try {
			const res = await fetch(
				`/api/method/frappe_ai_core.api.session.get_session_status?session_name=${encodeURIComponent(sessionName)}`,
				{ credentials: "include", headers: { "X-Frappe-CSRF-Token": window.csrf_token || "" } },
			);
			const json = (await res.json()) as { message?: SessionReviewData; exc?: string };
			if (!res.ok || json.exc) throw new Error(typeof json.exc === "string" ? json.exc : res.statusText);
			setData(json.message || null);
			setError(null);
			const st = json.message?.status;
			if (st === "Evaluated" || (st === "Completed" && json.message?.transcript)) {
				setPolling(false);
			}
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
			setPolling(false);
		}
	}, [sessionName]);

	useEffect(() => {
		void load();
	}, [load]);

	useEffect(() => {
		if (!polling) return;
		const id = window.setInterval(() => void load(), 2500);
		const stop = window.setTimeout(() => setPolling(false), 90000);
		return () => {
			window.clearInterval(id);
			window.clearTimeout(stop);
		};
	}, [polling, load]);

	const ev = data?.evaluation || {};
	const score = typeof data?.score === "number" ? data.score : typeof ev.score === "number" ? ev.score : null;
	const highlights = Array.isArray(ev.highlights) ? ev.highlights : [];
	const weaknesses = Array.isArray(ev.weaknesses) ? ev.weaknesses : [];
	const transcriptLines = (data?.transcript || "").split("\n").filter(Boolean);

	return (
		<div
			style={{
				minHeight: "100dvh",
				padding: "1.25rem clamp(1rem, 4vw, 2rem)",
				fontFamily: "system-ui, sans-serif",
				background: "linear-gradient(160deg, #0f172a, #14532d)",
				color: "#e2e8f0",
			}}
		>
			<div style={{ maxWidth: 720, margin: "0 auto" }}>
				<p style={{ margin: "0 0 1rem" }}>
					<a href={backHref} style={{ color: "#a5b4fc", fontSize: "0.85rem", textDecoration: "none" }}>
						{backLabel}
					</a>
				</p>

				<h1 style={{ fontSize: "1.45rem", margin: "0 0 0.35rem" }}>Call summary</h1>
				<p style={{ margin: "0 0 1.25rem", opacity: 0.75, fontSize: "0.88rem" }}>
					{data?.template_label || data?.template || "Support session"}
					{data?.name ? ` · ${data.name}` : ""}
				</p>

				{error ? (
					<div style={{ ...card, borderColor: "rgba(248,113,113,0.45)", color: "#fca5a5" }}>{error}</div>
				) : null}

				{!data && !error ? (
					<div style={{ ...card, opacity: 0.85 }}>Loading session review…</div>
				) : null}

				{data ? (
					<>
						<div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: "1rem" }}>
							<div style={{ ...card, flex: "1 1 140px", textAlign: "center", marginBottom: 0 }}>
								<div style={{ fontSize: "0.72rem", opacity: 0.7, textTransform: "uppercase" }}>Status</div>
								<div style={{ fontSize: "1.1rem", fontWeight: 600, marginTop: 4 }}>{data.status}</div>
								{polling && data.status !== "Evaluated" ? (
									<div style={{ fontSize: "0.75rem", opacity: 0.65, marginTop: 4 }}>Generating rating…</div>
								) : null}
							</div>
							<div style={{ ...card, flex: "1 1 140px", textAlign: "center", marginBottom: 0 }}>
								<div style={{ fontSize: "0.72rem", opacity: 0.7, textTransform: "uppercase" }}>Score</div>
								<div
									style={{
										fontSize: "2rem",
										fontWeight: 700,
										marginTop: 4,
										color: score != null ? scoreColor(score) : "#94a3b8",
									}}
								>
									{score != null ? Math.round(score) : "—"}
								</div>
								{score != null ? <div style={{ fontSize: "0.75rem", opacity: 0.65 }}>out of 100</div> : null}
							</div>
							{data.is_manager && (data.cost_usd ?? 0) > 0 ? (
								<div style={{ ...card, flex: "1 1 160px", textAlign: "center", marginBottom: 0 }}>
									<div style={{ fontSize: "0.72rem", opacity: 0.7, textTransform: "uppercase" }}>Call cost</div>
									<div style={{ fontSize: "1.1rem", fontWeight: 600, marginTop: 4, color: "#4ade80" }}>
										${data.cost_usd!.toFixed(4)}
									</div>
									<div style={{ fontSize: "0.75rem", opacity: 0.65 }}>रू {data.cost_npr?.toFixed(2)}</div>
								</div>
							) : null}
						</div>

						{ev.summary ? (
							<div style={card}>
								<div style={{ fontWeight: 600, marginBottom: 6 }}>Evaluation summary</div>
								<p style={{ margin: 0, lineHeight: 1.55, opacity: 0.92 }}>{ev.summary}</p>
							</div>
						) : null}

						{highlights.length > 0 ? (
							<div style={card}>
								<div style={{ fontWeight: 600, marginBottom: 6, color: "#86efac" }}>Highlights</div>
								<ul style={{ margin: 0, paddingLeft: "1.2rem", lineHeight: 1.5 }}>
									{highlights.map((h) => (
										<li key={h}>{h}</li>
									))}
								</ul>
							</div>
						) : null}

						{weaknesses.length > 0 ? (
							<div style={card}>
								<div style={{ fontWeight: 600, marginBottom: 6, color: "#fcd34d" }}>Areas to improve</div>
								<ul style={{ margin: 0, paddingLeft: "1.2rem", lineHeight: 1.5 }}>
									{weaknesses.map((w) => (
										<li key={w}>{w}</li>
									))}
								</ul>
							</div>
						) : null}

						{data.handoff ? (
							<div style={card}>
								<div style={{ fontWeight: 600, marginBottom: 8 }}>Human handoff</div>
								{data.handoff.reason ? (
									<p style={{ margin: "0 0 0.5rem" }}>
										<strong>Reason:</strong> {data.handoff.reason}
									</p>
								) : null}
								{data.handoff.customer_request ? (
									<p style={{ margin: "0 0 0.5rem" }}>
										<strong>Customer wanted:</strong> {data.handoff.customer_request}
									</p>
								) : null}
								{data.handoff.summary ? (
									<p style={{ margin: "0 0 0.5rem", whiteSpace: "pre-wrap", opacity: 0.9 }}>
										<strong>AI summary:</strong> {data.handoff.summary}
									</p>
								) : null}
								{data.handoff.suggested_next_step ? (
									<p style={{ margin: 0, padding: "0.5rem 0.65rem", borderRadius: 8, background: "rgba(34,197,94,0.12)" }}>
										<strong>Starting point for rep:</strong> {data.handoff.suggested_next_step}
									</p>
								) : null}
							</div>
						) : null}

						<div style={card}>
							<div style={{ fontWeight: 600, marginBottom: 8 }}>Transcript</div>
							{transcriptLines.length === 0 ? (
								<p style={{ margin: 0, opacity: 0.65, fontSize: "0.9rem" }}>No transcript captured for this session.</p>
							) : (
								<div
									style={{
										maxHeight: 360,
										overflowY: "auto",
										fontSize: "0.88rem",
										lineHeight: 1.55,
										whiteSpace: "pre-wrap",
										fontFamily: "ui-monospace, monospace",
										opacity: 0.92,
									}}
								>
									{transcriptLines.map((line) => {
										const isUser = line.startsWith("User:");
										return (
											<div
												key={line}
												style={{
													marginBottom: 6,
													padding: "4px 8px",
													borderRadius: 6,
													background: isUser ? "rgba(59,130,246,0.12)" : "rgba(34,197,94,0.1)",
												}}
											>
												{line}
											</div>
										);
									})}
								</div>
							)}
						</div>

						{data.is_manager ? (
							<p style={{ fontSize: "0.8rem", opacity: 0.7 }}>
								<a href="/support/reviews" style={{ color: "#a5b4fc" }}>
									All session reviews →
								</a>
								{" · "}
								<a href="/app/ai-session" style={{ color: "#a5b4fc" }}>
									Open in Desk
								</a>
							</p>
						) : null}
					</>
				) : null}
			</div>
		</div>
	);
}
