/**
 * ERPNext MCP / analytics tools often return viewer metadata at the top level
 * and the actual chart/table/KPI fields nested under `chart`, `result`, or string JSON.
 * ChartCard/TableCard expect a flattened shape (labels+series, rows, value, etc.).
 */

export function parseRecordJson(raw: unknown): Record<string, unknown> {
	if (raw == null) return {};
	if (typeof raw === "string") {
		const t = raw.trim();
		if (!t) return {};
		try {
			const v = JSON.parse(t) as unknown;
			if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
		} catch {
			return {};
		}
		return {};
	}
	if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
	return {};
}

/** Merge nested `chart`, parsed `result` / `content`, so ChartCard can read labels/series/data. */
export function flattenAnalyticsPayload(p: Record<string, unknown>): Record<string, unknown> {
	let out: Record<string, unknown> = { ...p };

	const mergeIn = (obj: Record<string, unknown> | null | undefined) => {
		if (!obj || typeof obj !== "object" || Array.isArray(obj)) return;
		out = { ...out, ...obj };
	};

	const chart = p.chart;
	if (chart && typeof chart === "object" && !Array.isArray(chart)) {
		mergeIn(chart as Record<string, unknown>);
	}

	const result = p.result;
	if (typeof result === "string") {
		try {
			const parsed = JSON.parse(result) as unknown;
			if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
				mergeIn(parsed as Record<string, unknown>);
				const innerChart = (parsed as Record<string, unknown>).chart;
				if (innerChart && typeof innerChart === "object" && !Array.isArray(innerChart)) {
					mergeIn(innerChart as Record<string, unknown>);
				}
			}
		} catch {
			/* ignore */
		}
	} else if (result && typeof result === "object" && !Array.isArray(result)) {
		mergeIn(result as Record<string, unknown>);
		const innerChart = (result as Record<string, unknown>).chart;
		if (innerChart && typeof innerChart === "object" && !Array.isArray(innerChart)) {
			mergeIn(innerChart as Record<string, unknown>);
		}
	}

	const content = p.content;
	if (typeof content === "string") {
		try {
			const parsed = JSON.parse(content) as unknown;
			if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
				mergeIn(parsed as Record<string, unknown>);
			}
		} catch {
			/* ignore */
		}
	}

	// Some tools nest the payload again
	const data = p.data;
	if (data && typeof data === "object" && !Array.isArray(data)) {
		const d = data as Record<string, unknown>;
		if (d.labels || d.series || d.chartType || d.rows) {
			mergeIn(d);
		}
	}

	return out;
}

type NamedValue = { name: string; value: number };

/** Chart data for Recharts (name/value rows). */
export function coerceChartData(payload: Record<string, unknown>): NamedValue[] | null {
	const flat = flattenAnalyticsPayload(payload);

	const direct = flat.data;
	if (Array.isArray(direct)) {
		const out: NamedValue[] = [];
		for (const r of direct) {
			if (r && typeof r === "object") {
				const o = r as Record<string, unknown>;
				const name = String(o.name ?? o.label ?? o.item ?? o.customer ?? o.key ?? o.x ?? "");
				const value = Number(o.value ?? o.amount ?? o.qty ?? o.total ?? o.count ?? o.y ?? 0);
				if (name) out.push({ name, value });
			}
		}
		if (out.length) return out;
	}

	const labels = flat.labels as string[] | undefined;
	const series = flat.series as { data?: number[] }[] | undefined;
	if (labels?.length && series?.[0]?.data?.length) {
		return labels.map((name, i) => ({ name, value: Number(series[0].data![i] ?? 0) }));
	}

	// Chart.js–style
	const datasets = flat.datasets as { data?: number[] }[] | undefined;
	if (labels?.length && datasets?.[0]?.data?.length) {
		return labels.map((name, i) => ({ name, value: Number(datasets[0].data![i] ?? 0) }));
	}

	// Single series array of numbers + categories
	const categories = flat.categories as string[] | undefined;
	const values = flat.values as number[] | undefined;
	if (categories?.length && values?.length) {
		return categories.map((name, i) => ({ name, value: Number(values[i] ?? 0) }));
	}

	return null;
}

export function getTableRows(payload: Record<string, unknown>): Record<string, unknown>[] | null {
	const flat = flattenAnalyticsPayload(payload);
	/* Chart payloads often use `data` as [{ name, value }]; that is not a table. */
	if (coerceChartData(flat)?.length) return null;
	const rows = flat.rows ?? flat.data;
	if (Array.isArray(rows) && rows.length && typeof rows[0] === "object" && !Array.isArray(rows[0])) {
		return rows as Record<string, unknown>[];
	}
	return null;
}

export function getKpiFields(payload: Record<string, unknown>): {
	value: unknown;
	subtitle?: string;
	delta?: unknown;
} {
	const flat = flattenAnalyticsPayload(payload);
	return {
		value: flat.value ?? flat.kpi ?? flat.total ?? flat.amount,
		subtitle: flat.subtitle != null ? String(flat.subtitle) : undefined,
		delta: flat.delta,
	};
}

export function detectArtifactKind(
	p: Record<string, unknown>,
	toolFallback: string,
): { kind: "kpi" | "chart" | "table" | "json"; title: string; chartType: string } {
	const viewer = String(p.viewer ?? p.type ?? "").toLowerCase();
	const title = String(p.title ?? toolFallback);
	const chartType = String(p.chartType ?? "bar");

	if (viewer.includes("kpi") || p.kpi !== undefined || typeof p.value === "number") {
		return { kind: "kpi", title, chartType };
	}
	if (
		viewer.includes("chart") ||
		p.chartType ||
		p.labels ||
		p.series ||
		(p.chart && typeof p.chart === "object")
	) {
		return { kind: "chart", title, chartType };
	}
	const rows = p.rows ?? p.data;
	if (Array.isArray(rows) && rows.length && typeof rows[0] === "object" && !Array.isArray(rows[0])) {
		return { kind: "table", title, chartType };
	}
	return { kind: "json", title, chartType };
}

/** Normalize artifact from API or LiveKit for rendering (parsed JSON + flattened where useful). */
export function normalizeUiArtifact(a: {
	artifact_type: string;
	title?: string;
	chart_type?: string;
	payload_json?: unknown;
}): {
	artifact_type: string;
	title?: string;
	chart_type?: string;
	payload_json: Record<string, unknown>;
} {
	const raw = parseRecordJson(a.payload_json);
	const flat = flattenAnalyticsPayload(raw);
	return {
		artifact_type: a.artifact_type,
		title: a.title ?? (typeof flat.title === "string" ? flat.title : undefined),
		chart_type: a.chart_type ?? (typeof flat.chartType === "string" ? String(flat.chartType) : undefined),
		payload_json: flat,
	};
}
