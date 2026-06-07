import { useCallback, useEffect, useState } from "react";

type SessionRow = {
	name: string;
	user: string;
	template: string;
	template_label: string;
	status: string;
	score: number | null;
	started_at?: string;
	ended_at?: string;
	total_tokens: number;
	cost_usd: number;
	cost_npr: number;
	transcript_preview: string;
};

const card: React.CSSProperties = {
	background: "rgba(15, 23, 42, 0.7)",
	border: "1px solid rgba(148, 163, 184, 0.22)",
	borderRadius: 14,
	padding: "1rem 1.15rem",
	marginBottom: "0.75rem",
};

function scoreColor(score: number): string {
	if (score >= 80) return "#4ade80";
	if (score >= 60) return "#fbbf24";
	return "#f87171";
}

export default function SessionReviewList() {
	const [rows, setRows] = useState<SessionRow[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const res = await fetch("/api/method/frappe_ai_core.api.session.list_session_reviews?limit=50", {
				credentials: "include",
				headers: { "X-Frappe-CSRF-Token": window.csrf_token || "" },
			});
			const json = (await res.json()) as { message?: SessionRow[]; exc?: string };
			if (!res.ok || json.exc) throw new Error(typeof json.exc === "string" ? json.exc : res.statusText);
			setRows(Array.isArray(json.message) ? json.message : []);
			setError(null);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
			setRows([]);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	return (
		<div
			style={{
				minHeight: "100dvh",
				padding: "1.25rem clamp(1rem, 4vw, 2rem)",
				fontFamily: "system-ui, sans-serif",
				background: "linear-gradient(160deg, #0f172a, #1e293b)",
				color: "#e2e8f0",
			}}
		>
			<div style={{ maxWidth: 820, margin: "0 auto" }}>
				<p style={{ margin: "0 0 1rem" }}>
					<a href="/support" style={{ color: "#a5b4fc", fontSize: "0.85rem", textDecoration: "none" }}>
						← Customer support portal
					</a>
				</p>
				<h1 style={{ fontSize: "1.45rem", margin: "0 0 0.35rem" }}>Session reviews</h1>
				<p style={{ margin: "0 0 1.25rem", opacity: 0.75, fontSize: "0.88rem" }}>
					Manager view — transcripts, scores, and costs for recent support calls.
				</p>

				{error ? (
					<div style={{ ...card, borderColor: "rgba(248,113,113,0.45)", color: "#fca5a5" }}>
						{error}
						<p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem", opacity: 0.85 }}>
							Requires <strong>AI Voice Manager</strong> or <strong>System Manager</strong> role.
						</p>
					</div>
				) : null}

				{loading ? <div style={{ ...card, opacity: 0.8 }}>Loading sessions…</div> : null}

				{!loading && !error && rows.length === 0 ? (
					<div style={{ ...card, opacity: 0.8 }}>No sessions yet. Run a support call first.</div>
				) : null}

				{rows.map((r) => (
					<a
						key={r.name}
						href={`/support/review?session=${encodeURIComponent(r.name)}`}
						style={{ textDecoration: "none", color: "inherit", display: "block" }}
					>
						<div style={{ ...card, cursor: "pointer" }}>
							<div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8 }}>
								<div>
									<div style={{ fontWeight: 600 }}>{r.template_label || r.template}</div>
									<div style={{ fontSize: "0.8rem", opacity: 0.7 }}>
										{r.user} · {r.status} · {r.name}
									</div>
								</div>
								<div style={{ textAlign: "right" }}>
									{r.score != null ? (
										<div style={{ fontSize: "1.5rem", fontWeight: 700, color: scoreColor(r.score) }}>
											{Math.round(r.score)}
										</div>
									) : (
										<div style={{ opacity: 0.5 }}>—</div>
									)}
									{r.cost_usd > 0 ? (
										<div style={{ fontSize: "0.75rem", opacity: 0.7 }}>${r.cost_usd.toFixed(4)}</div>
									) : null}
								</div>
							</div>
							{r.transcript_preview ? (
								<p style={{ margin: "0.6rem 0 0", fontSize: "0.82rem", opacity: 0.8, lineHeight: 1.45 }}>
									{r.transcript_preview}
									{r.transcript_preview.length >= 140 ? "…" : ""}
								</p>
							) : null}
						</div>
					</a>
				))}
			</div>
		</div>
	);
}
