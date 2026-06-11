import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import { cn } from "@/lib/utils";

export function Modal({
	open,
	onClose,
	children,
	className,
}: {
	open: boolean;
	onClose?: () => void;
	children: React.ReactNode;
	className?: string;
}) {
	useEffect(() => {
		if (!open || !onClose) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, onClose]);

	return (
		<AnimatePresence>
			{open ? (
				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
					onClick={onClose}
					role="dialog"
					aria-modal="true"
				>
					<motion.div
						initial={{ opacity: 0, y: 24, scale: 0.98 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{ opacity: 0, y: 24, scale: 0.98 }}
						transition={{ type: "spring", duration: 0.35, bounce: 0.15 }}
						className={cn(
							"w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 shadow-2xl shadow-black/50",
							className,
						)}
						onClick={(e) => e.stopPropagation()}
					>
						{children}
					</motion.div>
				</motion.div>
			) : null}
		</AnimatePresence>
	);
}
