import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/** "just now", "2 min ago", "1 hr ago" — for queue cards. */
export function timeAgo(dateStr?: string): string {
	if (!dateStr) return "";
	const then = new Date(dateStr.replace(" ", "T")).getTime();
	if (Number.isNaN(then)) return "";
	const mins = Math.floor((Date.now() - then) / 60000);
	if (mins < 1) return "just now";
	if (mins < 60) return `${mins} min ago`;
	const hrs = Math.floor(mins / 60);
	return hrs < 24 ? `${hrs} hr ago` : `${Math.floor(hrs / 24)} d ago`;
}

/** mm:ss elapsed-call format. */
export function formatDuration(totalSeconds: number): string {
	const m = Math.floor(totalSeconds / 60);
	const s = totalSeconds % 60;
	return `${m}:${String(s).padStart(2, "0")}`;
}
