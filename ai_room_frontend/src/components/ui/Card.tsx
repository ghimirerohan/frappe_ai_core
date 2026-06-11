import { cn } from "@/lib/utils";

export function Card({
	className,
	children,
	...props
}: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={cn(
				"rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5",
				className,
			)}
			{...props}
		>
			{children}
		</div>
	);
}
