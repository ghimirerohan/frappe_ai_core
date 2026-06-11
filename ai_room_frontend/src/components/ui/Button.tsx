import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
	"inline-flex items-center justify-center rounded-xl font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
	{
		variants: {
			variant: {
				primary: "bg-emerald-500 text-emerald-950 hover:bg-emerald-400 focus-visible:ring-emerald-500",
				agent: "bg-blue-600 text-white hover:bg-blue-500 focus-visible:ring-blue-500",
				interview: "bg-indigo-500 text-white hover:bg-indigo-400 focus-visible:ring-indigo-500",
				danger: "bg-red-500 text-white hover:bg-red-400 focus-visible:ring-red-500",
				ghost: "border border-white/10 bg-transparent text-slate-300 hover:bg-white/5 focus-visible:ring-slate-500",
			},
			size: {
				sm: "px-4 py-2 text-sm",
				md: "px-6 py-3 text-base",
				lg: "px-8 py-4 text-lg w-full",
			},
		},
		defaultVariants: { variant: "primary", size: "md" },
	},
);

export interface ButtonProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement>,
		VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
	return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
