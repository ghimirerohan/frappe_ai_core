import { coerceChartData, getKpiFields, getTableRows, normalizeUiArtifact } from "@/lib/analyticsPayload";
import ChartCard from "./ChartCard";
import KpiCard from "./KpiCard";
import TableCard from "./TableCard";
import type { UIArtifact } from "./MessageBubble";

function renderArtifact(a: UIArtifact, key: string) {
	const normalized = normalizeUiArtifact({
		artifact_type: a.artifact_type,
		title: a.title,
		chart_type: a.chart_type,
		payload_json: a.payload_json,
	});
	const p = normalized.payload_json;
	const title = String(normalized.title ?? "Artifact");

	/* Prefer charts when we can coerce points (handles nested MCP `chart` payloads). */
	const chartPoints = coerceChartData(p);
	if (chartPoints?.length) {
		const chartType = String(normalized.chart_type || p.chartType || "bar");
		return <ChartCard key={key} title={title} chartType={chartType} payload={p} />;
	}

	const tableRows = getTableRows(p);
	if (tableRows?.length) {
		return (
			<TableCard
				key={key}
				title={title}
				rows={tableRows}
				columns={Array.isArray(p.columns) ? (p.columns as string[]) : undefined}
			/>
		);
	}

	const viewer = String(p.viewer ?? "").toLowerCase();
	const { value, subtitle, delta } = getKpiFields(p);
	const hasKpiValue = value !== undefined && value !== null && String(value) !== "";
	if (normalized.artifact_type === "kpi" || viewer.includes("kpi") || hasKpiValue) {
		const sub = subtitle ?? (delta != null ? String(delta) : undefined);
		return (
			<KpiCard
				key={key}
				title={title}
				value={typeof value === "number" ? value.toLocaleString() : String(value ?? "—")}
				sub={sub}
			/>
		);
	}

	return (
		<div
			key={key}
			className="rounded-xl border border-slate-600/40 bg-slate-900/80 p-3 text-xs text-slate-300"
		>
			<div className="mb-2 font-semibold text-indigo-200">{title}</div>
			<pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all text-[0.65rem] text-slate-400">
				{JSON.stringify(p, null, 2).slice(0, 4000)}
			</pre>
		</div>
	);
}

export default function ArtifactCanvas({ artifacts }: { artifacts: UIArtifact[] }) {
	return (
		<div className="flex h-full min-h-0 w-[380px] shrink-0 flex-col border-l border-slate-700/50 bg-slate-900/80">
			<div className="border-b border-slate-700/40 px-4 py-3">
				<h2 className="text-sm font-semibold tracking-wide text-indigo-200">Artifacts</h2>
				<p className="mt-0.5 text-[0.7rem] text-slate-500">Charts, tables, and KPIs from tool results</p>
			</div>
			<div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
				{artifacts.length === 0 ? (
					<p className="text-sm text-slate-500">Select a message with data, or speak to generate analytics.</p>
				) : (
					artifacts.map((a, i) => renderArtifact(a, `art-${i}-${a.title ?? i}`))
				)}
			</div>
		</div>
	);
}
