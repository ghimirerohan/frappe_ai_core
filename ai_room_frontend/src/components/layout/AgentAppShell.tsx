import { cn } from "@/lib/utils";

export function AgentAppShell({
	children,
	className,
	title = "Agent Console",
	subtitle = "eSewa human support",
}: {
	children: React.ReactNode;
	className?: string;
	title?: string;
	subtitle?: string;
}) {
	return (
		<div
			className={cn(
				"min-h-dvh flex flex-col bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950 text-slate-100 font-sans",
				className,
			)}
		>
			<header className="flex items-center gap-3 px-5 py-4 border-b border-white/5 bg-slate-900/40">
				<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/20 border border-blue-400/30">
					<svg className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
						<path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
					</svg>
				</div>
				<div>
					<p className="text-sm font-semibold tracking-wide text-slate-50">{title}</p>
					<p className="text-xs text-slate-400">{subtitle}</p>
				</div>
			</header>
			<main className="flex-1">{children}</main>
		</div>
	);
}
