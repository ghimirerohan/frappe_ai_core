import { cn } from "@/lib/utils";

export function InterviewAppShell({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"min-h-dvh flex flex-col bg-slate-950 text-slate-100 font-sans",
				"bg-[radial-gradient(ellipse_at_top,rgba(129,140,248,0.08),transparent_60%)]",
				className,
			)}
		>
			<header className="flex items-center gap-3 px-5 py-4">
				<div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-500/15">
					<svg className="h-4 w-4 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
						<rect x="2" y="7" width="20" height="14" rx="2" />
						<path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
					</svg>
				</div>
				<div>
					<p className="text-sm font-semibold text-slate-50">Interview Practice</p>
					<p className="flex items-center gap-1.5 text-xs text-slate-400">
						<span className="inline-block h-1.5 w-1.5 rounded-full bg-indigo-400" />
						Voice interview with instant feedback
					</p>
				</div>
			</header>
			<main className="flex-1 flex flex-col">{children}</main>
		</div>
	);
}
