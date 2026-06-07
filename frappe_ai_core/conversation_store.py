# Copyright (c) 2026, Frappe AI Core and contributors
# For license information, please see license.txt

"""Persist AI Conversation / AI Message from API and LiveKit workers."""

from __future__ import annotations

import json
from typing import Any

import frappe


def get_conversation_id_for_session(session_name: str) -> str | None:
	return frappe.db.get_value("AI Conversation", {"session": session_name}, "name")


def ensure_conversation_for_session(session_name: str) -> str | None:
	"""Return conversation name for this AI Session, creating one if missing (worker backfill)."""
	cid = get_conversation_id_for_session(session_name)
	if cid:
		return cid
	if not frappe.db.exists("AI Session", session_name):
		return None
	sess = frappe.get_doc("AI Session", session_name)
	title = frappe.db.get_value("AI Agent Template", sess.template, "agent_name") or "Conversation"
	settings = frappe.get_single("AI Global Settings")
	from frappe_ai_core.api.session import normalize_gemini_live_model

	gemini_model = normalize_gemini_live_model(settings.gemini_model)
	conv = frappe.get_doc(
		{
			"doctype": "AI Conversation",
			"user": sess.user,
			"session": session_name,
			"template": sess.template,
			"status": "Active",
			"title": title,
			"gemini_model": gemini_model,
		}
	)
	try:
		conv.insert(ignore_permissions=True)
		frappe.db.commit()
	except Exception:
		frappe.db.rollback()
		frappe.log_error(frappe.get_traceback(), "frappe_ai_core ensure_conversation_for_session")
		return get_conversation_id_for_session(session_name)
	return conv.name


def _flatten_analytics_payload(p: dict[str, Any]) -> dict[str, Any]:
	"""Merge nested `chart` / `result` so stored JSON matches what ChartCard expects."""
	out = dict(p)
	chart = p.get("chart")
	if isinstance(chart, dict):
		out = {**out, **chart}
	res = p.get("result")
	if isinstance(res, dict):
		out = {**out, **res}
		inner = res.get("chart")
		if isinstance(inner, dict):
			out = {**out, **inner}
	elif isinstance(res, str):
		try:
			parsed = json.loads(res)
			if isinstance(parsed, dict):
				out = {**out, **parsed}
				inner = parsed.get("chart")
				if isinstance(inner, dict):
					out = {**out, **inner}
		except json.JSONDecodeError:
			pass
	return out


def build_artifacts_from_payload(tool: str, payload: dict[str, Any]) -> list[dict[str, Any]]:
	"""Derive AI Message Artifact rows from an analytics tool payload (mirrors ChatPanel heuristics)."""
	p = payload
	viewer = str(p.get("viewer") or p.get("type") or "").lower()

	if "kpi" in viewer or p.get("kpi") is not None or isinstance(p.get("value"), (int, float)):
		return [
			{
				"artifact_type": "kpi",
				"title": str(p.get("title") or tool),
				"chart_type": "",
				"payload_json": p,
			}
		]

	if "chart" in viewer or p.get("chartType") or p.get("labels") or p.get("series") or isinstance(
		p.get("chart"), dict
	):
		flat = _flatten_analytics_payload(p)
		return [
			{
				"artifact_type": "chart",
				"title": str(p.get("title") or tool),
				"chart_type": str(p.get("chartType") or flat.get("chartType") or "bar"),
				"payload_json": flat,
			}
		]

	rows = p.get("rows") or p.get("data")
	if isinstance(rows, list) and rows and isinstance(rows[0], dict):
		return [
			{
				"artifact_type": "table",
				"title": str(p.get("title") or tool),
				"chart_type": "",
				"payload_json": _flatten_analytics_payload(p),
			}
		]

	return [
		{
			"artifact_type": "json",
			"title": str(p.get("title") or tool),
			"chart_type": "",
			"payload_json": p,
		}
	]


def _bump_conversation_meta(conversation_id: str, preview_source: str, new_artifacts: int) -> None:
	preview = (preview_source or "").strip().replace("\n", " ")[:120]
	row = frappe.db.get_value(
		"AI Conversation",
		conversation_id,
		["message_count", "artifact_count"],
		as_dict=True,
	)
	mc = int(row.message_count or 0) + 1 if row else 1
	ac = int(row.artifact_count or 0) + new_artifacts if row else new_artifacts
	frappe.db.set_value(
		"AI Conversation",
		conversation_id,
		{
			"message_count": mc,
			"artifact_count": ac,
			"last_message_at": frappe.utils.now(),
			"last_message_preview": preview,
		},
	)


def append_message_for_session(
	session_name: str,
	*,
	role: str,
	content: str | None = None,
	content_json: dict | list | None = None,
	message_type: str = "text",
	model_used: str | None = None,
	artifacts: list[dict[str, Any]] | None = None,
) -> str | None:
	conv_id = ensure_conversation_for_session(session_name)
	if not conv_id:
		return None
	return append_message_for_conversation(
		conv_id,
		role=role,
		content=content,
		content_json=content_json,
		message_type=message_type,
		model_used=model_used,
		artifacts=artifacts,
		update_title_from_user=role == "user",
		commit=True,
	)


def append_message_for_conversation(
	conversation_id: str,
	*,
	role: str,
	content: str | None = None,
	content_json: dict | list | None = None,
	message_type: str = "text",
	model_used: str | None = None,
	artifacts: list[dict[str, Any]] | None = None,
	update_title_from_user: bool = False,
	commit: bool = True,
) -> str | None:
	msg = frappe.get_doc(
		{
			"doctype": "AI Message",
			"conversation": conversation_id,
			"role": role,
			"message_type": message_type,
			"content": content or "",
			"content_json": content_json,
			"model_used": model_used or None,
			"timestamp": frappe.utils.now(),
		}
	)
	for a in artifacts or []:
		msg.append(
			"artifacts",
			{
				"artifact_type": a.get("artifact_type") or "json",
				"title": a.get("title") or "",
				"chart_type": a.get("chart_type") or "",
				"payload_json": a.get("payload_json") if a.get("payload_json") is not None else a.get("payload"),
			},
		)
	try:
		msg.insert(ignore_permissions=True)
		_bump_conversation_meta(conversation_id, content or json.dumps(content_json or {}), len(artifacts or []))
		if update_title_from_user and (content or "").strip():
			mc = int(frappe.db.get_value("AI Conversation", conversation_id, "message_count") or 0)
			if mc < 3:
				t = (content or "").strip()[:80]
				if t:
					frappe.db.set_value("AI Conversation", conversation_id, "title", t)
		if commit:
			frappe.db.commit()
	except Exception:
		frappe.db.rollback()
		frappe.log_error(frappe.get_traceback(), "frappe_ai_core append_message_for_conversation")
		return None
	return msg.name


def mark_conversation_completed(session_name: str) -> None:
	cid = get_conversation_id_for_session(session_name)
	if not cid:
		return
	try:
		frappe.db.set_value("AI Conversation", cid, "status", "Completed")
		frappe.db.commit()
	except Exception:
		frappe.db.rollback()
		frappe.log_error(frappe.get_traceback(), "frappe_ai_core mark_conversation_completed")
