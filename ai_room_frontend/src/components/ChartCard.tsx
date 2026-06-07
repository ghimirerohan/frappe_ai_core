import {
	Bar,
	BarChart,
	Cell,
	Line,
	LineChart,
	Pie,
	PieChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { coerceChartData } from "@/lib/analyticsPayload";

const COLORS = ["#6366f1", "#8b5cf6", "#a78bfa", "#22d3ee", "#34d399", "#fbbf24"];

export default function ChartCard({
	title,
	chartType,
	payload,
}: {
	title: string;
	chartType: string;
	payload: Record<string, unknown>;
}) {
	const data = coerceChartData(payload);
	if (!data?.length) {
		return (
			<div
				style={{
					padding: 12,
					borderRadius: 12,
					background: "rgba(15, 23, 42, 0.75)",
					border: "1px solid rgba(148, 163, 184, 0.2)",
					fontSize: "0.78rem",
					color: "#94a3b8",
				}}
			>
				<div style={{ fontWeight: 600, marginBottom: 6, color: "#e2e8f0" }}>{title}</div>
				<pre style={{ margin: 0, overflow: "auto", maxHeight: 160, fontSize: "0.68rem" }}>
					{JSON.stringify(payload, null, 2).slice(0, 2000)}
				</pre>
			</div>
		);
	}

	const t = chartType.toLowerCase();
	const height = 200;

	return (
		<div
			style={{
				padding: "10px 8px 4px",
				borderRadius: 12,
				background: "rgba(15, 23, 42, 0.75)",
				border: "1px solid rgba(129, 140, 248, 0.3)",
			}}
		>
			<div style={{ fontSize: "0.78rem", fontWeight: 600, marginBottom: 8, paddingLeft: 8, color: "#e2e8f0" }}>
				{title}
			</div>
			<ResponsiveContainer width="100%" height={height}>
				{t === "pie" ? (
					<PieChart>
						<Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
							{data.map((_, i) => (
								<Cell key={i} fill={COLORS[i % COLORS.length]} />
							))}
						</Pie>
						<Tooltip />
					</PieChart>
				) : t === "line" ? (
					<LineChart data={data}>
						<XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 10 }} />
						<YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} />
						<Tooltip />
						<Line type="monotone" dataKey="value" stroke="#818cf8" strokeWidth={2} dot />
					</LineChart>
				) : (
					<BarChart data={data}>
						<XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 10 }} />
						<YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} />
						<Tooltip />
						<Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} />
					</BarChart>
				)}
			</ResponsiveContainer>
		</div>
	);
}
