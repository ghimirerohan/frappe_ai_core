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
				"min-h-dvh flex flex-col bg-slate-950 text-slate-100 font-sans",
				"bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.08),transparent_60%)]",
				className,
			)}
		>
			<header className="flex items-center gap-3 border-b border-white/5 px-5 py-4">
				<div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-500/15">
					<svg className="h-4.5 w-4.5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
						<path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
					</svg>
				</div>
				<div>
					<p className="text-sm font-semibold text-slate-50">{title}</p>
					<p className="text-xs text-slate-400">{subtitle}</p>
				</div>
			</header>
			<main className="flex flex-1 flex-col">{children}</main>
		</div>
	);
}
