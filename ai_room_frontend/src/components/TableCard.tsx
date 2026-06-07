export default function TableCard({
	title,
	rows,
	columns,
}: {
	title?: string;
	rows: Record<string, unknown>[];
	columns?: string[];
}) {
	if (!rows.length) return null;
	const keys = columns?.length ? columns : Object.keys(rows[0] ?? {});

	return (
		<div
			style={{
				borderRadius: 12,
				overflow: "hidden",
				border: "1px solid rgba(148, 163, 184, 0.25)",
				background: "rgba(15, 23, 42, 0.75)",
			}}
		>
			{title ? (
				<div
					style={{
						padding: "8px 12px",
						fontSize: "0.78rem",
						fontWeight: 600,
						background: "rgba(30, 27, 75, 0.6)",
					}}
				>
					{title}
				</div>
			) : null}
			<div style={{ overflowX: "auto", maxHeight: 220 }}>
				<table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
					<thead>
						<tr style={{ background: "rgba(15, 23, 42, 0.95)" }}>
							{keys.map((k) => (
								<th
									key={k}
									style={{
										textAlign: "left",
										padding: "8px 10px",
										borderBottom: "1px solid rgba(148, 163, 184, 0.2)",
										color: "#c7d2fe",
									}}
								>
									{k}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{rows.slice(0, 50).map((row, i) => (
							<tr key={i} style={{ background: i % 2 ? "rgba(30, 27, 75, 0.25)" : "transparent" }}>
								{keys.map((k) => (
									<td
										key={k}
										style={{
											padding: "6px 10px",
											borderBottom: "1px solid rgba(148, 163, 184, 0.12)",
											color: "#e2e8f0",
										}}
									>
										{String((row as Record<string, unknown>)[k] ?? "")}
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}
