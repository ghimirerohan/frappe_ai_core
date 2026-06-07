import type { UIArtifact } from "./MessageBubble";

const icons: Record<string, string> = {
	chart: "📊",
	table: "▦",
	kpi: "◇",
	code: "{ }",
	json: "{ }",
};

export default function InlineArtifactCard({
	artifact,
	onClick,
}: {
	artifact: UIArtifact;
	onClick?: () => void;
}) {
	const icon = icons[artifact.artifact_type] ?? "◆";
	const title = artifact.title || artifact.artifact_type;

	return (
		<button
			type="button"
			onClick={onClick}
			className="flex w-full max-w-xs items-center gap-2 rounded-xl border border-slate-600/50 bg-slate-900/70 px-3 py-2 text-left text-xs text-slate-200 transition hover:border-indigo-500/40 hover:bg-slate-800/90"
		>
			<span className="text-base opacity-90" aria-hidden>
				{icon}
			</span>
			<span className="min-w-0 flex-1 truncate font-medium text-indigo-100">{title}</span>
			<span className="shrink-0 text-[0.65rem] text-slate-500">Open →</span>
		</button>
	);
}
