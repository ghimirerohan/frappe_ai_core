"""Shared www context for AI Voice Room SPA pages."""

from __future__ import annotations

from urllib.parse import quote

import frappe


def _portal_mode(path: str) -> str:
	path = (path or "").rstrip("/") or "/"
	if path == "/support/agent" or path.endswith("/agent"):
		return "agent"
	if path in ("/support/reviews",) or "/cost" in path:
		return "manager"
	if path == "/support" or path.startswith("/support/"):
		return "customer"
	return "generic"


def _guest_redirect_paths() -> set[str]:
	return {"/support", "/support/agent", "/support/reviews"}


def apply_portal_context(context) -> None:
	"""Inject CSRF, portal boot, and PWA metadata into www page context."""
	context.csrf_token = frappe.sessions.get_csrf_token()
	frappe.db.commit()

	path = (frappe.request.path or "").rstrip("/") or "/"
	is_guest = frappe.session.user == "Guest"
	mode = _portal_mode(path)

	if is_guest and path in _guest_redirect_paths():
		frappe.redirect(f"/login?redirect-to={quote(frappe.request.path or '/support', safe='')}")

	context.user = frappe.session.user
	context.is_guest = is_guest
	context.roles = frappe.get_roles() if not is_guest else []
	context.portal_mode = mode

	if mode == "agent":
		context.pwa_manifest_url = "/api/method/frappe_ai_core.api.pwa.manifest_agent"
		context.pwa_app_title = "eSewa Agent"
		context.theme_color = "#1e3a5f"
	else:
		context.pwa_manifest_url = "/api/method/frappe_ai_core.api.pwa.manifest"
		context.pwa_app_title = "eSewa Support"
		context.theme_color = "#14532d"
