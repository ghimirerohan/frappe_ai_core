import { csrf } from "./csrf";
import { getPortalBoot, redirectToLogin } from "./auth";

type FrappeResponse<T = unknown> = {
	message?: T;
	exc?: string;
	exc_type?: string;
};

export class ApiError extends Error {
	constructor(
		message: string,
		public readonly excType?: string,
	) {
		super(message);
		this.name = "ApiError";
	}
}

function handlePermissionError(json: FrappeResponse, status: number): never {
	const excType = json.exc_type || "";
	const exc = typeof json.exc === "string" ? json.exc : "";
	const isLogin =
		excType === "PermissionError" &&
		(exc.toLowerCase().includes("login") || getPortalBoot().is_guest);
	if (isLogin || (status === 403 && getPortalBoot().is_guest)) {
		redirectToLogin();
	}
	throw new ApiError(exc || "Permission denied", excType);
}

export async function apiPost<T = unknown>(
	method: string,
	params?: Record<string, string>,
): Promise<T> {
	const qs = params ? `?${new URLSearchParams(params).toString()}` : "";
	const res = await fetch(`/api/method/${method}${qs}`, {
		method: "POST",
		headers: { "Content-Type": "application/json", "X-Frappe-CSRF-Token": csrf() },
		credentials: "include",
	});
	const json = (await res.json()) as FrappeResponse<T>;
	if (!res.ok || json.exc) handlePermissionError(json, res.status);
	return json.message as T;
}

export async function apiGet<T = unknown>(
	method: string,
	params?: Record<string, string>,
): Promise<T> {
	const qs = params ? `?${new URLSearchParams(params).toString()}` : "";
	const res = await fetch(`/api/method/${method}${qs}`, { credentials: "include" });
	const json = (await res.json()) as FrappeResponse<T>;
	if (!res.ok || json.exc) handlePermissionError(json, res.status);
	return json.message as T;
}
