declare global {
	interface Window {
		csrf_token?: string;
		frappe?: { csrf_token?: string };
	}
}

export function csrf(): string {
	return window.csrf_token || window.frappe?.csrf_token || "";
}
