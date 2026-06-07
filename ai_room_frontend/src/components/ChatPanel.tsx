import { useDataChannel, useTranscriptions } from "@livekit/components-react";
import { useCallback, useMemo, useState } from "react";
import type { TranscriptStream } from "./TranscriptBubble";
import ChartCard from "./ChartCard";
import KpiCard from "./KpiCard";
import TableCard from "./TableCard";
import TranscriptBubble from "./TranscriptBubble";

type StatusLine = { id: string; ok: boolean; message: string; at: number };
type Insight = { id: string; tool: string; payload: Record<string, unknown>; at: number };

function decodePayload(raw: Uint8Array): unknown {
	try {
		return JSON.parse(new TextDecoder().decode(raw));
	} catch {
		return null;
	}
}

function StatusLog({ lines }: { lines: StatusLine[] }) {
	if (!lines.length) return null;
	return (
		<div
			style={{
				fontSize: "0.72rem",
				borderRadius: 10,
				padding: "8px 10px",
				background: "rgba(15, 23, 42, 0.9)",
				border: "1px solid rgba(148, 163, 184, 0.2)",
				maxHeight: 100,
				overflowY: "auto",
			}}
		>
			{lines.map((l) => (
				<div
					key={l.id}
					style={{
						color: l.ok ? "#86efac" : "#fca5a5",
						marginBottom: 4,
						opacity: 0.95,
					}}
				>
					{l.message}
				</div>
			))}
		</div>
	);
}

function renderInsight(ins: Insight) {
	const p = ins.payload;
	const viewer = String(p.viewer ?? p.type ?? "").toLowerCase();

	if (viewer.includes("kpi") || p.kpi !== undefined || typeof p.value === "number") {
		const title = String(p.title ?? ins.tool);
		const value = p.value ?? p.kpi ?? p.total ?? "—";
		const sub = p.subtitle ? String(p.subtitle) : p.delta != null ? String(p.delta) : undefined;
		return <KpiCard title={title} value={typeof value === "number" ? value.toLocaleString() : String(value)} sub={sub} />;
	}

	if (viewer.includes("chart") || p.chartType || p.labels || p.series) {
		const title = String(p.title ?? ins.tool);
		const chartType = String(p.chartType ?? "bar");
		return <ChartCard title={title} chartType={chartType} payload={p} />;
	}

	const rows = p.rows ?? p.data;
	if (Array.isArray(rows) && rows.length && typeof rows[0] === "object") {
		return (
			<TableCard
				title={String(p.title ?? ins.tool)}
				rows={rows as Record<string, unknown>[]}
				columns={Array.isArray(p.columns) ? (p.columns as string[]) : undefined}
			/>
		);
	}

	return (
		<div
			style={{
				padding: 10,
				borderRadius: 10,
				background: "rgba(15, 23, 42, 0.8)",
				border: "1px solid rgba(148, 163, 184, 0.2)",
				fontSize: "0.72rem",
			}}
		>
			<div style={{ fontWeight: 600, marginBottom: 6, color: "#c7d2fe" }}>{ins.tool}</div>
			<pre style={{ margin: 0, color: "#94a3b8", overflow: "auto", maxHeight: 180, fontSize: "0.65rem" }}>
				{JSON.stringify(p, null, 2).slice(0, 3500)}
			</pre>
		</div>
	);
}

export default function ChatPanel() {
	const transcriptions = useTranscriptions() as TranscriptStream[];

	const [statusLines, setStatusLines] = useState<StatusLine[]>([]);
	const [insights, setInsights] = useState<Insight[]>([]);

	const onStatus = useCallback((msg: { payload: Uint8Array }) => {
		const data = decodePayload(msg.payload) as { ok?: boolean; message?: string } | null;
		if (!data?.message) return;
		setStatusLines((prev) => [
			...prev,
			{
				id: `${Date.now()}-${Math.random()}`,
				ok: Boolean(data.ok),
				message: String(data.message),
				at: Date.now(),
			},
		]);
	}, []);

	const onError = useCallback((msg: { payload: Uint8Array }) => {
		const data = decodePayload(msg.payload) as { message?: string } | null;
		const m = data?.message ?? "Unknown error";
		setStatusLines((prev) => [
			...prev,
			{ id: `${Date.now()}-e`, ok: false, message: m, at: Date.now() },
		]);
	}, []);

	const onAnalytics = useCallback((msg: { payload: Uint8Array }) => {
		const data = decodePayload(msg.payload) as {
			type?: string;
			tool?: string;
			payload?: Record<string, unknown>;
		} | null;
		if (!data || data.type !== "analytics_tool_result" || !data.payload) return;
		setInsights((prev) => [
			...prev,
			{
				id: `${Date.now()}-${data.tool ?? "t"}`,
				tool: String(data.tool ?? "tool"),
				payload: data.payload,
				at: Date.now(),
			},
		]);
	}, []);

	useDataChannel("status", onStatus);
	useDataChannel("error", onError);
	useDataChannel("analytics", onAnalytics);

	const sortedStreams = useMemo(() => {
		return [...transcriptions].sort((a, b) => (a.streamInfo?.timestamp ?? 0) - (b.streamInfo?.timestamp ?? 0));
	}, [transcriptions]);

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				gap: "0.65rem",
				flex: 1,
				minHeight: 220,
				maxHeight: "42vh",
				marginTop: "0.75rem",
			}}
		>
			<div style={{ fontSize: "0.78rem", fontWeight: 600, color: "#c7d2fe" }}>Connection &amp; bridge</div>
			<StatusLog lines={statusLines} />

			<div style={{ fontSize: "0.78rem", fontWeight: 600, color: "#c7d2fe", marginTop: 4 }}>Live transcript</div>
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					gap: 8,
					overflowY: "auto",
					flex: 1,
					paddingRight: 4,
				}}
			>
				{sortedStreams.length === 0 ? (
					<p style={{ fontSize: "0.78rem", opacity: 0.65, margin: 0 }}>Transcription appears as you speak…</p>
				) : (
					sortedStreams.map((s, i) => (
						<TranscriptBubble key={`${s.streamInfo?.id ?? i}-${s.streamInfo?.timestamp ?? i}`} stream={s} />
					))
				)}
			</div>

			{insights.length > 0 ? (
				<>
					<div style={{ fontSize: "0.78rem", fontWeight: 600, color: "#c7d2fe" }}>Charts &amp; data</div>
					<div style={{ display: "flex", flexDirection: "column", gap: 10, overflowY: "auto", maxHeight: "36vh" }}>
						{insights.map((ins) => (
							<div key={ins.id}>{renderInsight(ins)}</div>
						))}
					</div>
				</>
			) : null}
		</div>
	);
}
