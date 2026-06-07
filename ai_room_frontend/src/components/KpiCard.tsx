export default function KpiCard({
	title,
	value,
	sub,
}: {
	title: string;
	value: string | number;
	sub?: string;
}) {
	return (
		<div
			style={{
				padding: "14px 16px",
				borderRadius: 12,
				background: "linear-gradient(135deg, rgba(30, 27, 75, 0.95), rgba(15, 23, 42, 0.95))",
				border: "1px solid rgba(129, 140, 248, 0.35)",
			}}
		>
			<div style={{ fontSize: "0.72rem", opacity: 0.75, marginBottom: 6 }}>{title}</div>
			<div style={{ fontSize: "1.45rem", fontWeight: 700, color: "#a5b4fc" }}>{value}</div>
			{sub ? <div style={{ fontSize: "0.75rem", opacity: 0.7, marginTop: 6 }}>{sub}</div> : null}
		</div>
	);
}
