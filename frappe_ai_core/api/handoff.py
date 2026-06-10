# Copyright (c) 2026, Frappe AI Core and contributors
# For license information, please see license.txt

"""Human handoff APIs: human agents list pending requests, accept (join the room), complete."""

from __future__ import annotations

from typing import Any

import frappe
from frappe import _

_AGENT_ROLES = {"AI Human Agent", "AI Voice Manager", "System Manager"}


def _require_human_agent() -> None:
	if frappe.session.user == "Guest":
		frappe.throw(_("Login required"), frappe.PermissionError)
	if not (_AGENT_ROLES & set(frappe.get_roles())):
		frappe.throw(_("You are not allowed to handle handoffs"), frappe.PermissionError)


@frappe.whitelist()
def list_pending_handoffs() -> list[dict[str, Any]]:
	"""Pending (Requested) and recently accepted-by-me handoffs for the agent console queue."""
	_require_human_agent()
	rows = frappe.get_all(
		"AI Handoff Request",
		filters=[["status", "in", ["Requested", "Accepted"]]],
		fields=[
			"name",
			"session",
			"room_name",
			"status",
			"requested_by",
			"assigned_agent",
			"customer_name",
			"esewa_phone",
			"reason",
			"customer_request",
			"summary",
			"suggested_next_step",
			"creation",
		],
		order_by="creation asc",
		limit=50,
		ignore_permissions=True,
	)
	# Hide other agents' already-accepted calls; keep my own accepted ones visible.
	me = frappe.session.user
	return [r for r in rows if r.status == "Requested" or r.assigned_agent == me]


def _public_livekit_url(settings) -> str:
	from frappe_ai_core.utils.network import public_livekit_url

	return public_livekit_url(settings)


@frappe.whitelist()
def accept_handoff(handoff_name: str) -> dict[str, Any]:
	"""Accept a handoff and return a LiveKit token so the human agent can join the client's room."""
	_require_human_agent()
	if not frappe.db.exists("AI Handoff Request", handoff_name):
		frappe.throw(_("Handoff not found"))

	doc = frappe.get_doc("AI Handoff Request", handoff_name)
	if doc.status not in ("Requested", "Accepted"):
		frappe.throw(_("This handoff is no longer active (status: {0})").format(doc.status))
	if doc.status == "Accepted" and doc.assigned_agent and doc.assigned_agent != frappe.session.user:
		frappe.throw(_("Already accepted by {0}").format(doc.assigned_agent))

	room_name = doc.room_name or doc.session
	if not room_name:
		frappe.throw(_("Handoff has no room"))

	settings = frappe.get_single("AI Global Settings")
	api_key = (settings.livekit_api_key or "").strip()
	api_secret = (settings.get_password("livekit_api_secret") or "").strip()
	if not api_key or not api_secret:
		frappe.throw(_("Configure LiveKit API key and secret in AI Global Settings"))

	from frappe_ai_core.api.session import _mint_participant_token

	identity = f"agent-human-{frappe.session.user}"
	display_name = frappe.utils.get_fullname(frappe.session.user) or frappe.session.user
	token = _mint_participant_token(
		api_key=api_key,
		api_secret=api_secret,
		room_name=room_name,
		identity=identity[:120],
		display_name=f"{display_name} (Human Agent)",
	)

	doc.status = "Accepted"
	doc.assigned_agent = frappe.session.user
	if not doc.accepted_at:
		doc.accepted_at = frappe.utils.now()
	doc.save(ignore_permissions=True)
	frappe.db.commit()

	try:
		frappe.publish_realtime(
			"ai_handoff_accepted",
			{"handoff": handoff_name, "session": doc.session, "agent": display_name},
		)
	except Exception:
		pass

	return {
		"token": token,
		"livekit_url": _public_livekit_url(settings),
		"room_name": room_name,
		"session": doc.session,
		"customer_name": doc.customer_name or "",
		"esewa_phone": doc.esewa_phone or "",
		"summary": doc.summary or "",
		"customer_request": doc.customer_request or "",
		"suggested_next_step": doc.suggested_next_step or "",
		"reason": doc.reason or "",
	}


@frappe.whitelist()
def complete_handoff(handoff_name: str) -> dict[str, Any]:
	"""Mark a handoff completed (human finished the call)."""
	_require_human_agent()
	if not frappe.db.exists("AI Handoff Request", handoff_name):
		frappe.throw(_("Handoff not found"))
	doc = frappe.get_doc("AI Handoff Request", handoff_name)
	doc.status = "Completed"
	if not doc.completed_at:
		doc.completed_at = frappe.utils.now()
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return {"status": "Completed", "handoff": handoff_name}
