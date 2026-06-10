import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { csrf } from "@/utils/csrf";
import {
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	Line,
	LineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

type Bucket = { key: string; cost_usd: number; cost_npr: number; total_tokens: number };

type CostSummary = {
	from_date: string;
	to_date: string;
	usd_to_npr_rate: number;
	totals: {
		cost_usd: number;
		cost_npr: number;
		total_tokens: number;
		input_audio_tokens: number;
		output_audio_tokens: number;
		input_text_tokens: number;
		output_text_tokens: number;
		sessions: number;
		records: number;
		unpriced_records: number;
		avg_cost_usd_per_session: number;
	};
	daily: Bucket[];
	by_model: Bucket[];
	by_kind: Bucket[];
	by_template: Bucket[];
};

const COLORS = ["#22c55e", "#6366f1", "#f59e0b", "#06b6d4", "#a78bfa", "#ef4444"];

/** Local calendar date (YYYY-MM-DD). Avoid toISOString() — that is UTC and can be one day behind. */
function localYmd(d: Date = new Date()): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

function usd(n: number): string {
	return `$${n.toLocaleString(undefined, { minimumFractionDigits: n < 1 ? 4 : 2, maximumFractionDigits: 4 })}`;
}
function npr(n: number): string {
	return `रू ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}
function compact(n: number): string {
	return n.toLocaleString(undefined, { notation: "compact", maximumFractionDigits: 1 });
}

const card: React.CSSProperties = {
	background: "rgba(15, 23, 42, 0.7)",
	border: "1px solid rgba(148, 163, 184, 0.2)",
	borderRadius: 14,
	padding: "1rem 1.1rem",
};

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
	return (
		<div style={{ ...card, flex: "1 1 160px", minWidth: 150 }}>
			<div style={{ fontSize: "0.72rem", letterSpacing: 0.4, textTransform: "uppercase", opacity: 0.7 }}>{label}</div>
			<div style={{ fontSize: "1.5rem", fontWeight: 700, marginTop: 4, color: accent || "#e2e8f0" }}>{value}</div>
			{sub ? <div style={{ fontSize: "0.78rem", opacity: 0.65, marginTop: 2 }}>{sub}</div> : null}
		</div>
	);
}

function BreakdownTable({ title, rows }: { title: string; rows: Bucket[] }) {
	return (
		<div style={{ ...card, flex: "1 1 280px", minWidth: 260 }}>
			<div style={{ fontWeight: 600, marginBottom: 8 }}>{title}</div>
			{rows.length === 0 ? (
				<div style={{ fontSize: "0.82rem", opacity: 0.6 }}>No data yet.</div>
			) : (
				<table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
					<thead>
						<tr style={{ textAlign: "left", opacity: 0.6 }}>
							<th style={{ padding: "4px 0" }}>Name</th>
							<th style={{ padding: "4px 0", textAlign: "right" }}>Tokens</th>
							<th style={{ padding: "4px 0", textAlign: "right" }}>USD</th>
							<th style={{ padding: "4px 0", textAlign: "right" }}>NPR</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((r) => (
							<tr key={r.key} style={{ borderTop: "1px solid rgba(148,163,184,0.12)" }}>
								<td style={{ padding: "5px 0", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.key}>
									{r.key}
								</td>
								<td style={{ padding: "5px 0", textAlign: "right" }}>{compact(r.total_tokens)}</td>
								<td style={{ padding: "5px 0", textAlign: "right" }}>{usd(r.cost_usd)}</td>
								<td style={{ padding: "5px 0", textAlign: "right", opacity: 0.8 }}>{npr(r.cost_npr)}</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
		</div>
	);
}

export default function CostDashboard() {
	const [data, setData] = useState<CostSummary | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const defaultFrom = useMemo(() => {
		const d = new Date();
		d.setDate(d.getDate() - 30);
		return localYmd(d);
	}, []);
	const [fromDate, setFromDate] = useState(defaultFrom);
	const [toDate, setToDate] = useState(() => localYmd());
	const usedServerDefaults = useRef(false);

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const params = new URLSearchParams();
			// First load: let the server pick today + last 30 days (site timezone).
			if (!usedServerDefaults.current) {
				usedServerDefaults.current = true;
			} else {
				params.set("from_date", fromDate);
				params.set("to_date", toDate);
			}
			const res = await fetch(`/api/method/frappe_ai_core.api.costing.get_cost_summary?${params.toString()}`, {
				credentials: "include",
				headers: { "X-Frappe-CSRF-Token": csrf() },
			});
			const json = (await res.json()) as { message?: CostSummary; exc?: string; _server_messages?: string };
			if (!res.ok || json.exc) {
				throw new Error(typeof json.exc === "string" ? json.exc : res.statusText);
			}
			const payload = json.message || null;
			setData(payload);
			if (payload?.from_date) setFromDate(payload.from_date);
			if (payload?.to_date) setToDate(payload.to_date);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setLoading(false);
		}
	}, [fromDate, toDate]);

	useEffect(() => {
		void load();
	}, [load]);

	const t = data?.totals;
	const dailyData = (data?.daily || []).map((d) => ({ day: d.key.slice(5), usd: d.cost_usd, npr: d.cost_npr }));
	const modelData = (data?.by_model || []).slice(0, 8).map((m) => ({ name: m.key.replace(/^gemini-/, ""), usd: m.cost_usd }));

	return (
		<div
			style={{
				minHeight: "100dvh",
				padding: "1.5rem clamp(1rem, 4vw, 2.5rem)",
				fontFamily: "system-ui, sans-serif",
				background: "linear-gradient(160deg, #0f172a, #052e16)",
				color: "#e2e8f0",
			}}
		>
			<div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: "1.25rem" }}>
				<div>
					<h1 style={{ fontSize: "1.5rem", margin: 0 }}>AI Tokenomics</h1>
					<p style={{ opacity: 0.7, margin: "4px 0 0", fontSize: "0.85rem" }}>
						Operating cost of voice + judge + analytics models. Rates from AI Model Pricing
						{data ? ` · 1 USD ≈ रू ${data.usd_to_npr_rate}` : ""}.
					</p>
				</div>
				<div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
					<label style={{ fontSize: "0.72rem", opacity: 0.7 }}>
						From
						<input
							type="date"
							value={fromDate}
							max={toDate}
							onChange={(e) => setFromDate(e.target.value)}
							style={inputStyle}
						/>
					</label>
					<label style={{ fontSize: "0.72rem", opacity: 0.7 }}>
						To
						<input type="date" value={toDate} min={fromDate} max={localYmd()} onChange={(e) => setToDate(e.target.value)} style={inputStyle} />
					</label>
					<button type="button" onClick={() => void load()} style={btnStyle}>
						Refresh
					</button>
					<a
						href="/app/query-report/AI Tokenomics"
						style={{ ...btnStyle, textDecoration: "none", background: "rgba(148,163,184,0.15)", color: "#e2e8f0" }}
						title="Open in Frappe Desk"
					>
						Desk report
					</a>
				</div>
			</div>

			{error ? (
				<div style={{ ...card, borderColor: "rgba(248,113,113,0.5)", color: "#fca5a5", marginBottom: "1rem" }}>{error}</div>
			) : null}
			{loading && !data ? <div style={{ opacity: 0.7 }}>Loading…</div> : null}

			{t ? (
				<>
					<div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: "1.25rem" }}>
						<Kpi label="Total Cost (USD)" value={usd(t.cost_usd)} accent="#4ade80" sub={`${t.records} usage records`} />
						<Kpi label="Total Cost (NPR)" value={npr(t.cost_npr)} accent="#60a5fa" />
						<Kpi label="Total Tokens" value={compact(t.total_tokens)} accent="#fbbf24" />
						<Kpi label="Sessions" value={String(t.sessions)} />
						<Kpi label="Avg / Session" value={usd(t.avg_cost_usd_per_session)} sub="USD" />
						{t.unpriced_records > 0 ? (
							<Kpi label="Unpriced" value={String(t.unpriced_records)} accent="#fca5a5" sub="add to AI Model Pricing" />
						) : null}
					</div>

					<div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: "1.25rem" }}>
						<div style={{ ...card, flex: "2 1 420px", minWidth: 320 }}>
							<div style={{ fontWeight: 600, marginBottom: 10 }}>Daily cost (USD)</div>
							<div style={{ width: "100%", height: 240 }}>
								<ResponsiveContainer>
									<LineChart data={dailyData} margin={{ top: 4, right: 12, bottom: 0, left: -10 }}>
										<CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
										<XAxis dataKey="day" tick={{ fill: "#94a3b8", fontSize: 11 }} />
										<YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
										<Tooltip
											contentStyle={{ background: "#0f172a", border: "1px solid rgba(148,163,184,0.3)", borderRadius: 8 }}
											formatter={(v: number) => usd(v)}
										/>
										<Line type="monotone" dataKey="usd" stroke="#22c55e" strokeWidth={2} dot={false} />
									</LineChart>
								</ResponsiveContainer>
							</div>
						</div>
						<div style={{ ...card, flex: "1 1 320px", minWidth: 280 }}>
							<div style={{ fontWeight: 600, marginBottom: 10 }}>Cost by model (USD)</div>
							<div style={{ width: "100%", height: 240 }}>
								<ResponsiveContainer>
									<BarChart data={modelData} margin={{ top: 4, right: 12, bottom: 0, left: -10 }}>
										<CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
										<XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={60} />
										<YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
										<Tooltip
											contentStyle={{ background: "#0f172a", border: "1px solid rgba(148,163,184,0.3)", borderRadius: 8 }}
											formatter={(v: number) => usd(v)}
										/>
										<Bar dataKey="usd" radius={[4, 4, 0, 0]}>
											{modelData.map((_, i) => (
												<Cell key={i} fill={COLORS[i % COLORS.length]} />
											))}
										</Bar>
									</BarChart>
								</ResponsiveContainer>
							</div>
						</div>
					</div>

					<div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
						<BreakdownTable title="By model" rows={data!.by_model} />
						<BreakdownTable title="By usage kind" rows={data!.by_kind} />
						<BreakdownTable title="By template" rows={data!.by_template} />
					</div>
				</>
			) : null}
		</div>
	);
}

const inputStyle: React.CSSProperties = {
	display: "block",
	marginTop: 3,
	padding: "6px 8px",
	borderRadius: 8,
	border: "1px solid rgba(148,163,184,0.35)",
	background: "rgba(15,23,42,0.85)",
	color: "#e2e8f0",
	fontSize: "0.85rem",
};

const btnStyle: React.CSSProperties = {
	padding: "8px 14px",
	borderRadius: 8,
	border: "none",
	background: "#22c55e",
	color: "#052e16",
	fontWeight: 600,
	fontSize: "0.85rem",
	cursor: "pointer",
};
