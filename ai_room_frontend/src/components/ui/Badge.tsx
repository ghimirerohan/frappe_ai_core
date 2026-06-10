import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", {
	variants: {
		variant: {
			default: "bg-slate-700 text-slate-200",
			warning: "bg-amber-500/20 text-amber-300",
			success: "bg-emerald-500/20 text-emerald-300",
			info: "bg-blue-500/20 text-blue-300",
		},
	},
	defaultVariants: { variant: "default" },
});

export function Badge({
	className,
	variant,
	...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
	return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
