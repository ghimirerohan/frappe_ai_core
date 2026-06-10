import { cn } from "@/lib/utils";

export function SupportAppShell({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"min-h-dvh flex flex-col bg-gradient-to-br from-slate-900 via-emerald-950 to-emerald-900 text-slate-100 font-sans",
				className,
			)}
		>
			<header className="flex items-center gap-3 px-5 py-4 border-b border-white/5">
				<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 border border-emerald-400/30">
					<span className="text-lg font-bold text-emerald-400">e</span>
				</div>
				<div>
					<p className="text-sm font-semibold tracking-wide text-emerald-50">eSewa Support</p>
					<p className="text-xs text-emerald-200/60">Voice customer care</p>
				</div>
			</header>
			<main className="flex-1 flex flex-col">{children}</main>
		</div>
	);
}
