/**
 * Notification relay helpers for the agent console.
 *
 * System notifications are shown through the service worker registration when
 * available (required on Android/installed PWAs) and fall back to the plain
 * Notification constructor on desktop browsers.
 */

export type NotificationPermissionState = "granted" | "denied" | "default" | "unsupported";

export function notificationPermission(): NotificationPermissionState {
	if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
	return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
	if (!("Notification" in window)) return "unsupported";
	if (Notification.permission !== "default") return Notification.permission;
	try {
		return await Notification.requestPermission();
	} catch {
		return Notification.permission;
	}
}

export type HandoffNotification = {
	handoff: string;
	customerName?: string;
	phone?: string;
	request?: string;
};

const NOTIFICATION_TAG_PREFIX = "ai-handoff-";

export async function showHandoffNotification(info: HandoffNotification): Promise<void> {
	if (notificationPermission() !== "granted") return;

	const title = info.customerName ? `${info.customerName} needs assistance` : "Customer needs assistance";
	const bodyParts = [info.request, info.phone].filter(Boolean) as string[];
	const body = bodyParts.length > 0 ? bodyParts.join(" · ") : "A call is waiting to be transferred to you.";
	const url = `/support/agent?handoff=${encodeURIComponent(info.handoff)}`;

	const options: NotificationOptions & { vibrate?: number[]; renotify?: boolean } = {
		body,
		tag: `${NOTIFICATION_TAG_PREFIX}${info.handoff}`,
		icon: "/assets/frappe_ai_core/images/frappe-ai-core.svg",
		badge: "/assets/frappe_ai_core/images/frappe-ai-core.svg",
		data: { url, handoff: info.handoff },
		vibrate: [180, 90, 180],
		requireInteraction: true,
	};

	try {
		const reg = await navigator.serviceWorker?.getRegistration();
		if (reg) {
			await reg.showNotification(title, options);
			return;
		}
	} catch {
		/* fall through to plain Notification */
	}
	try {
		const n = new Notification(title, options);
		n.onclick = () => {
			window.focus();
			window.dispatchEvent(new CustomEvent("handoff-notification-click", { detail: { handoff: info.handoff } }));
			n.close();
		};
	} catch {
		/* notifications unavailable; in-app popup still covers it */
	}
}

export async function closeHandoffNotification(handoff: string): Promise<void> {
	try {
		const reg = await navigator.serviceWorker?.getRegistration();
		const open = await reg?.getNotifications({ tag: `${NOTIFICATION_TAG_PREFIX}${handoff}` });
		open?.forEach((n) => n.close());
	} catch {
		/* best effort */
	}
}

/** PWA icon badge with the number of waiting calls. */
export function setQueueBadge(count: number): void {
	const nav = navigator as Navigator & {
		setAppBadge?: (n: number) => Promise<void>;
		clearAppBadge?: () => Promise<void>;
	};
	try {
		if (count > 0) void nav.setAppBadge?.(count);
		else void nav.clearAppBadge?.();
	} catch {
		/* unsupported */
	}
}

let audioCtx: AudioContext | null = null;

/** Soft two-tone chime for an incoming transfer; intentionally short and quiet. */
export function playIncomingChime(): void {
	try {
		audioCtx = audioCtx || new AudioContext();
		const ctx = audioCtx;
		if (ctx.state === "suspended") void ctx.resume();
		const now = ctx.currentTime;
		for (const [freq, at] of [
			[880, 0],
			[1174.66, 0.18],
		] as const) {
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			osc.type = "sine";
			osc.frequency.value = freq;
			gain.gain.setValueAtTime(0, now + at);
			gain.gain.linearRampToValueAtTime(0.12, now + at + 0.02);
			gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.45);
			osc.connect(gain).connect(ctx.destination);
			osc.start(now + at);
			osc.stop(now + at + 0.5);
		}
	} catch {
		/* audio not available */
	}
}
