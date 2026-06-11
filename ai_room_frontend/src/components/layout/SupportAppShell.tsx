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
				"min-h-dvh flex flex-col bg-slate-950 text-slate-100 font-sans",
				"bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.07),transparent_60%)]",
				className,
			)}
		>
			<header className="flex items-center gap-3 px-5 py-4">
				<div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/15">
					<span className="text-base font-bold text-emerald-400">e</span>
				</div>
				<div>
					<p className="text-sm font-semibold text-slate-50">eSewa Support</p>
					<p className="flex items-center gap-1.5 text-xs text-slate-400">
						<span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
						We're here to help
					</p>
				</div>
			</header>
			<main className="flex-1 flex flex-col">{children}</main>
		</div>
	);
}
