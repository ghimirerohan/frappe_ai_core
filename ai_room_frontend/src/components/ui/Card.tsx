import { cn } from "@/lib/utils";

export function Card({
	className,
	children,
	...props
}: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={cn(
				"rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-sm p-5",
				className,
			)}
			{...props}
		>
			{children}
		</div>
	);
}
