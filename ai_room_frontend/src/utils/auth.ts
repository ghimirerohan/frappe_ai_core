export type PortalMode = "customer" | "agent" | "manager" | "generic";

export type PortalBoot = {
	user: string;
	is_guest: boolean;
	roles: string[];
	portal_mode: PortalMode;
};

declare global {
	interface Window {
		__PORTAL_BOOT__?: PortalBoot;
	}
}

const ROLE_HUMAN_AGENT = "AI Human Agent";
const ROLE_VOICE_MANAGER = "AI Voice Manager";
const ROLE_SYSTEM_MANAGER = "System Manager";

export function getPortalBoot(): PortalBoot {
	const boot = window.__PORTAL_BOOT__;
	if (boot) return boot;
	return { user: "Guest", is_guest: true, roles: [], portal_mode: inferPortalMode() };
}

export function inferPortalMode(): PortalMode {
	const path = window.location.pathname.replace(/\/+$/, "");
	if (path === "/support/agent" || path.endsWith("/agent")) return "agent";
	if (path === "/support/reviews" || path.includes("/cost")) return "manager";
	if (path === "/support" || path.startsWith("/support/")) return "customer";
	return "generic";
}

export function redirectToLogin(): void {
	const target = window.location.pathname + window.location.search;
	window.location.href = `/login?redirect-to=${encodeURIComponent(target)}`;
}

export type AuthCheckResult =
	| { ok: true }
	| { ok: false; reason: "guest" | "forbidden"; message: string };

export function checkRouteAccess(path: string): AuthCheckResult {
	const boot = getPortalBoot();
	const normalized = path.replace(/\/+$/, "") || "/";

	if (normalized === "/support/agent" || normalized.endsWith("/agent")) {
		if (boot.is_guest) return { ok: false, reason: "guest", message: "Login required" };
		const allowed =
			boot.roles.includes(ROLE_HUMAN_AGENT) ||
			boot.roles.includes(ROLE_SYSTEM_MANAGER);
		if (!allowed) {
			return {
				ok: false,
				reason: "forbidden",
				message: "You need the AI Human Agent role to access the agent console.",
			};
		}
		return { ok: true };
	}

	if (normalized === "/support/reviews" || normalized.includes("/cost")) {
		if (boot.is_guest) return { ok: false, reason: "guest", message: "Login required" };
		const allowed =
			boot.roles.includes(ROLE_VOICE_MANAGER) ||
			boot.roles.includes(ROLE_SYSTEM_MANAGER);
		if (!allowed) {
			return {
				ok: false,
				reason: "forbidden",
				message: "You need the AI Voice Manager role to access this page.",
			};
		}
		return { ok: true };
	}

	if (normalized === "/support" || normalized.startsWith("/support")) {
		if (boot.is_guest) return { ok: false, reason: "guest", message: "Login required" };
		return { ok: true };
	}

	return { ok: true };
}

export function hasRole(...roles: string[]): boolean {
	const boot = getPortalBoot();
	return roles.some((r) => boot.roles.includes(r));
}
