# Copyright (c) 2026, Frappe AI Core and contributors
# For license information, please see license.txt

from __future__ import annotations

import asyncio
import datetime
import json
import os
from typing import Any
from urllib.parse import urlparse

import frappe
from frappe import _
from frappe.utils import cint

from frappe_ai_core.ai_engine.context_loader import format_context_for_prompt, map_language_mode_to_instruction_suffix
from frappe_ai_core.ai_engine.stt_config import map_language_mode_to_stt_instruction_block
from frappe_ai_core.utils.network import get_lan_access_info, get_livekit_lan_warnings, public_livekit_url

# Gemini Live / native-audio model IDs (Google AI API). See:
# https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-native-audio-preview-12-2025
# https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-live-preview
#
# livekit-plugins-google only types/validates 2.5 native-audio preview ids for the Gemini API;
# gemini-3.1-flash-live-preview can return WebSocket 1007 with some keys/SDK combos — default 2.5.
_GEMINI_LIVE_VOICE_MODELS = frozenset(
	{
		"gemini-3.1-flash-live-preview",
		"gemini-2.5-flash-native-audio-preview-12-2025",
		"gemini-2.5-flash-native-audio-preview-09-2025",
	}
)
_GEMINI_LIVE_MODEL_CANONICAL = {x.lower(): x for x in _GEMINI_LIVE_VOICE_MODELS}
# Common Desk typos / shorthand → official id
_GEMINI_LIVE_MODEL_ALIASES: dict[str, str] = {
	"gemini-3.1-flash-live": "gemini-3.1-flash-live-preview",
}
_DEFAULT_GEMINI_LIVE_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025"


def normalize_gemini_live_model(model: str | None) -> str:
	"""Map AI Global Settings to a Live API voice model Google documents for real-time audio.

	Unknown or legacy broken ids (e.g. gemini-1.5-flash-live-preview) fall back to the default.
	"""
	m = (model or "").strip()
	if not m:
		return _DEFAULT_GEMINI_LIVE_MODEL
	if m.startswith("gemini-live-"):
		return m
	key = m.lower()
	if key in _GEMINI_LIVE_MODEL_ALIASES:
		return _GEMINI_LIVE_MODEL_ALIASES[key]
	if key in _GEMINI_LIVE_MODEL_CANONICAL:
		return _GEMINI_LIVE_MODEL_CANONICAL[key]
	return _DEFAULT_GEMINI_LIVE_MODEL


def voice_model_ui_label(model_id: str) -> str:
	"""Short user-visible name for the Gemini Live / native-audio model (matches worker after normalization)."""
	m = (model_id or "").strip().lower()
	if "gemini-3.1-flash-live" in m:
		return "Gemini 3.1 Flash Live"
	if "gemini-2.5-flash-native-audio" in m:
		return "Gemini 2.5 Flash (Live native audio)"
	if "gemini-3.1" in m and "flash" in m:
		return "Gemini 3.1 Flash"
	if "gemini-3" in m and "flash" in m and "native" in m:
		return "Gemini 3 Flash (Live native audio)"
	if "gemini-2.5" in m and "flash" in m:
		return "Gemini 2.5 Flash"
	if "gemini-3" in m and "flash" in m:
		return "Gemini 3 Flash"
	if not m:
		return "Gemini 2.5 Flash (Live native audio)"
	base = model_id.strip()
	if base.lower().startswith("gemini-"):
		base = base[7:]
	return f"Gemini {base.replace('-', ' ')}"


_LIVEKIT_AUTH_HINT = _(
	"If this is HTTP 401: LiveKit API key/secret must match the server. "
	"Use API Key `devkey` and Secret `secret` with the default Docker setup, or match `LIVEKIT_KEYS` / `resources/livekit.yaml` "
	"(under `keys:` use `devkey: secret` — not separate `APIKey` / `APIsecret` lines). "
	"Restart the `livekit` container after changing keys."
)


def _livekit_http_base(ws_url: str) -> str:
	u = (ws_url or "").strip()
	if u.startswith("ws://"):
		return "http://" + u[5:]
	if u.startswith("wss://"):
		return "https://" + u[6:]
	if u.startswith("http"):
		return u
	return f"http://{u}"


def _run_async(coro):
	"""Run coroutine from sync Frappe (no running loop)."""
	try:
		asyncio.get_running_loop()
	except RuntimeError:
		return asyncio.run(coro)
	# Should not happen in Frappe request path
	import concurrent.futures

	with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
		fut = ex.submit(asyncio.run, coro)
		return fut.result(timeout=120)


async def _livekit_prepare_room_and_dispatch(
	http_url: str,
	api_key: str,
	api_secret: str,
	room_name: str,
	agent_name: str,
	metadata: str,
) -> None:
	"""Create room server-side, then agent dispatch (same JWT auth for both)."""
	from livekit import api
	from livekit.api.twirp_client import TwirpError
	from livekit.protocol.agent_dispatch import CreateAgentDispatchRequest
	from livekit.protocol.room import CreateRoomRequest

	lk = api.LiveKitAPI(url=http_url, api_key=api_key, api_secret=api_secret)
	try:
		try:
			await lk.room.create_room(CreateRoomRequest(name=room_name))
		except TwirpError as e:
			if e.status == 401:
				raise
			st = getattr(e, "status", 0)
			code = (e.code or "").lower()
			msg_l = (e.message or "").lower()
			if st in (409, 412) or code in ("already_exists", "conflict") or "already exists" in msg_l:
				pass
			else:
				raise
		await lk.agent_dispatch.create_dispatch(
			CreateAgentDispatchRequest(
				room=room_name,
				agent_name=agent_name,
				metadata=metadata,
			)
		)
	finally:
		await lk.aclose()


def _mint_participant_token(
	*,
	api_key: str,
	api_secret: str,
	room_name: str,
	identity: str,
	display_name: str,
	ttl_minutes: int = 60,
) -> str:
	from livekit.api import AccessToken, VideoGrants

	grant = VideoGrants(
		room_join=True,
		room=room_name,
		can_publish=True,
		can_subscribe=True,
		can_publish_data=True,
	)
	return (
		AccessToken(api_key, api_secret)
		.with_identity(identity)
		.with_name(display_name)
		.with_ttl(datetime.timedelta(minutes=ttl_minutes))
		.with_grants(grant)
		.to_jwt()
	)


@frappe.whitelist()
def list_agent_templates() -> list[dict[str, Any]]:
	"""List interview / agent templates for the Voice Room selector (logged-in users).

	Templates are not secret; any authenticated user may start a session with a template name
	(see get_session_token). Uses ignore_permissions so desk roles without DocType read still see options.
	"""
	if frappe.session.user == "Guest":
		frappe.throw(_("Login required"), frappe.PermissionError)

	return frappe.get_all(
		"AI Agent Template",
		fields=["name", "agent_name", "persona_type", "language_mode"],
		order_by="agent_name asc",
		ignore_permissions=True,
	)


@frappe.whitelist()
def get_session_token(
	ref_doctype: str | None = None,
	ref_docname: str | None = None,
	template_name: str | None = None,
) -> dict[str, Any]:
	"""Create AI Session, dispatch voice agent, return LiveKit JWT for the browser."""
	if frappe.session.user == "Guest":
		frappe.throw(_("Login required"), frappe.PermissionError)

	if ref_doctype and ref_docname:
		if not frappe.has_permission(ref_doctype, "read", ref_docname):
			frappe.throw(_("Not permitted to access {0} {1}").format(ref_doctype, ref_docname))

	settings = frappe.get_single("AI Global Settings")
	# Browsers often need ws://localhost:7880; Frappe in Docker must hit the LiveKit service (e.g. ws://livekit:7880).
	lk_url = settings.livekit_url or "ws://localhost:7880"
	internal = (getattr(settings, "livekit_internal_url", None) or "").strip()
	dispatch_ws = internal or lk_url
	http_url = _livekit_http_base(dispatch_ws)
	api_key = (settings.livekit_api_key or "").strip()
	api_secret = (settings.get_password("livekit_api_secret") or "").strip()

	if not api_key or not api_secret:
		frappe.throw(_("Configure LiveKit API key and secret in AI Global Settings"))

	raw_voice_model = settings.gemini_model or _DEFAULT_GEMINI_LIVE_MODEL
	gemini_voice_model = normalize_gemini_live_model(raw_voice_model)
	gemini_voice_model_label = voice_model_ui_label(gemini_voice_model)

	if template_name:
		if not frappe.db.exists("AI Agent Template", template_name):
			frappe.throw(_("Invalid template"))
		template = template_name
	else:
		templates = frappe.get_all("AI Agent Template", pluck="name", limit=1)
		if not templates:
			frappe.throw(_("Create an AI Agent Template first"))
		template = templates[0]

	template_doc = frappe.get_doc("AI Agent Template", template)
	persona_type = template_doc.persona_type or ""
	voice_agent_name = (settings.livekit_agent_name or "frappe-ai-voice").strip()
	analytics_name = (getattr(settings, "analytics_agent_name", None) or "frappe-ai-analytics").strip()
	if persona_type == "Business Analyst":
		agent_name = analytics_name
	else:
		agent_name = voice_agent_name

	sess = frappe.get_doc(
		{
			"doctype": "AI Session",
			"user": frappe.session.user,
			"template": template,
			"status": "Scheduled",
			"ref_doctype": ref_doctype,
			"ref_docname": ref_docname,
		}
	)
	sess.insert(ignore_permissions=True)
	frappe.db.commit()

	from frappe_ai_core.conversation_store import get_conversation_id_for_session

	conversation_id: str | None = None
	try:
		conv = frappe.get_doc(
			{
				"doctype": "AI Conversation",
				"user": frappe.session.user,
				"session": sess.name,
				"template": template,
				"status": "Active",
				"title": (template_doc.agent_name or "Conversation")[:140],
				"gemini_model": gemini_voice_model,
			}
		)
		conv.insert(ignore_permissions=True)
		frappe.db.commit()
		conversation_id = conv.name
	except Exception:
		frappe.db.rollback()
		frappe.log_error(frappe.get_traceback(), "frappe_ai_core AI Conversation create")
		conversation_id = get_conversation_id_for_session(sess.name)

	room_name = sess.name
	frappe.db.set_value("AI Session", sess.name, "livekit_room_name", room_name)
	frappe.db.commit()

	try:
		_run_async(_livekit_prepare_room_and_dispatch(http_url, api_key, api_secret, room_name, agent_name, sess.name))
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "frappe_ai_core agent dispatch")
		msg = str(e)
		if "401" in msg or "Unauthorized" in msg or "unauthenticated" in msg.lower():
			msg = f"{msg}\n\n{_LIVEKIT_AUTH_HINT}"
		frappe.throw(_("LiveKit dispatch failed: {0}").format(msg))

	identity = f"user-{frappe.session.user}"
	token = _mint_participant_token(
		api_key=api_key,
		api_secret=api_secret,
		room_name=room_name,
		identity=identity[:120],
		display_name=frappe.utils.get_fullname(frappe.session.user) or frappe.session.user,
	)

	public_ws = public_livekit_url(settings)
	lan_warnings = get_livekit_lan_warnings()

	return {
		"token": token,
		"room_name": room_name,
		"session_name": sess.name,
		"conversation_id": conversation_id,
		"livekit_url": public_ws,
		"lan_warnings": lan_warnings,
		"template": template,
		"persona_type": persona_type,
		"gemini_model": gemini_voice_model,
		"gemini_model_label": gemini_voice_model_label,
	}


_MANAGER_ROLES = frozenset({"AI Voice Manager", "System Manager"})


def _is_voice_manager() -> bool:
	return bool(_MANAGER_ROLES & set(frappe.get_roles()))


def _can_read_session(sess) -> bool:
	if sess.user == frappe.session.user:
		return True
	return _is_voice_manager() or frappe.has_permission("AI Session", "write", sess)


def _parse_evaluation_json(raw) -> dict[str, Any]:
	if isinstance(raw, dict):
		return raw
	if isinstance(raw, str):
		try:
			parsed = json.loads(raw)
			return parsed if isinstance(parsed, dict) else {}
		except json.JSONDecodeError:
			return {}
	return {}


def _handoff_for_session(session_name: str) -> dict[str, Any] | None:
	row = frappe.db.get_value(
		"AI Handoff Request",
		{"session": session_name},
		[
			"name",
			"status",
			"reason",
			"summary",
			"customer_request",
			"suggested_next_step",
			"assigned_agent",
			"accepted_at",
			"completed_at",
		],
		as_dict=True,
	)
	return row


def _session_review_payload(sess) -> dict[str, Any]:
	eval_json = _parse_evaluation_json(sess.evaluation_json)
	template_label = frappe.db.get_value("AI Agent Template", sess.template, "agent_name") if sess.template else None
	handoff = _handoff_for_session(sess.name)
	return {
		"name": sess.name,
		"status": sess.status,
		"score": sess.score,
		"evaluation": eval_json,
		"transcript": sess.transcript or "",
		"template": sess.template,
		"template_label": template_label,
		"user": sess.user,
		"started_at": sess.started_at,
		"ended_at": sess.ended_at,
		"total_tokens": int(sess.total_tokens or 0),
		"cost_usd": float(sess.cost_usd or 0),
		"cost_npr": float(sess.cost_npr or 0),
		"handoff": handoff,
		"is_manager": _is_voice_manager(),
	}


@frappe.whitelist()
def get_session_status(session_name: str) -> dict[str, Any]:
	"""Post-call review payload: transcript, score, evaluation, handoff, and cost rollups."""
	if not frappe.db.exists("AI Session", session_name):
		frappe.throw(_("Session not found"))
	sess = frappe.get_doc("AI Session", session_name)
	if not _can_read_session(sess):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	return _session_review_payload(sess)


@frappe.whitelist()
def list_session_reviews(limit: int | str | None = None, template: str | None = None) -> list[dict[str, Any]]:
	"""Manager queue: recent sessions with scores for the /support/reviews page."""
	if frappe.session.user == "Guest":
		frappe.throw(_("Login required"), frappe.PermissionError)
	if not _is_voice_manager():
		frappe.throw(_("You are not allowed to view session reviews"), frappe.PermissionError)

	lim = cint(limit) or 40
	if lim > 200:
		lim = 200
	filters: dict[str, Any] = {}
	if template:
		filters["template"] = template

	rows = frappe.get_all(
		"AI Session",
		filters=filters,
		fields=[
			"name",
			"user",
			"template",
			"status",
			"score",
			"started_at",
			"ended_at",
			"total_tokens",
			"cost_usd",
			"cost_npr",
			"transcript",
		],
		order_by="modified desc",
		limit_page_length=lim,
	)

	templates = {r.template for r in rows if r.template}
	labels: dict[str, str] = {}
	if templates:
		for t in frappe.get_all(
			"AI Agent Template", filters={"name": ["in", list(templates)]}, fields=["name", "agent_name"]
		):
			labels[t.name] = t.agent_name

	out: list[dict[str, Any]] = []
	for r in rows:
		preview = (r.transcript or "").replace("\n", " ").strip()[:140]
		out.append(
			{
				"name": r.name,
				"user": r.user,
				"template": r.template,
				"template_label": labels.get(r.template) or r.template,
				"status": r.status,
				"score": r.score,
				"started_at": r.started_at,
				"ended_at": r.ended_at,
				"total_tokens": int(r.total_tokens or 0),
				"cost_usd": float(r.cost_usd or 0),
				"cost_npr": float(r.cost_npr or 0),
				"transcript_preview": preview,
			}
		)
	return out


@frappe.whitelist()
def list_conversations(limit: int | str | None = None, offset: int | str | None = None) -> list[dict[str, Any]]:
	"""Sidebar: current user's conversations ordered by last activity."""
	if frappe.session.user == "Guest":
		frappe.throw(_("Login required"), frappe.PermissionError)

	lim = cint(limit) or 30
	off = cint(offset) or 0
	if lim > 200:
		lim = 200

	return frappe.get_all(
		"AI Conversation",
		filters={"user": frappe.session.user},
		fields=[
			"name",
			"title",
			"status",
			"message_count",
			"artifact_count",
			"last_message_at",
			"last_message_preview",
			"session",
			"template",
			"modified",
		],
		order_by="modified desc",
		limit_start=off,
		limit_page_length=lim,
	)


@frappe.whitelist()
def get_conversation_messages(
	conversation_id: str,
	limit: int | str | None = None,
	offset: int | str | None = None,
) -> list[dict[str, Any]]:
	if frappe.session.user == "Guest":
		frappe.throw(_("Login required"), frappe.PermissionError)
	if not frappe.db.exists("AI Conversation", conversation_id):
		frappe.throw(_("Conversation not found"))

	conv = frappe.get_doc("AI Conversation", conversation_id)
	if not frappe.has_permission("AI Conversation", "read", conv):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	lim = cint(limit) or 50
	off = cint(offset) or 0
	if lim > 500:
		lim = 500

	messages = frappe.get_all(
		"AI Message",
		filters={"conversation": conversation_id},
		fields=[
			"name",
			"role",
			"message_type",
			"content",
			"content_json",
			"sequence",
			"timestamp",
			"model_used",
		],
		order_by="sequence asc",
		limit_start=off,
		limit_page_length=lim,
	)
	names = [m.name for m in messages]
	by_parent: dict[str, list[dict[str, Any]]] = {}
	if names:
		arts = frappe.get_all(
			"AI Message Artifact",
			filters={"parent": ["in", names], "parenttype": "AI Message"},
			fields=["parent", "artifact_type", "title", "chart_type", "payload_json"],
		)
		for a in arts:
			pid = a.parent
			pj = a.get("payload_json")
			if isinstance(pj, str):
				try:
					a["payload_json"] = json.loads(pj)
				except json.JSONDecodeError:
					a["payload_json"] = {}
			row = {k: v for k, v in a.items() if k != "parent"}
			by_parent.setdefault(pid, []).append(row)

	for m in messages:
		cj = m.get("content_json")
		if isinstance(cj, str):
			try:
				m["content_json"] = json.loads(cj)
			except json.JSONDecodeError:
				m["content_json"] = None
		m["artifacts"] = by_parent.get(m.name, [])

	return messages


@frappe.whitelist()
def save_message(
	conversation_id: str,
	role: str,
	content: str | None = None,
	content_json: Any | None = None,
	message_type: str = "text",
	artifacts: Any | None = None,
) -> dict[str, Any]:
	"""Persist one message (+ optional artifacts) from the analytics UI."""
	if frappe.session.user == "Guest":
		frappe.throw(_("Login required"), frappe.PermissionError)
	if not frappe.db.exists("AI Conversation", conversation_id):
		frappe.throw(_("Conversation not found"))

	conv = frappe.get_doc("AI Conversation", conversation_id)
	if not frappe.has_permission("AI Conversation", "write", conv):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	def _coerce_json(val):
		if val is None or val == "":
			return None
		if isinstance(val, (dict, list)):
			return val
		return frappe.parse_json(val)

	parsed_json = _coerce_json(content_json)
	parsed_artifacts = _coerce_json(artifacts)
	if parsed_artifacts is None or not isinstance(parsed_artifacts, list):
		parsed_artifacts = []

	from frappe_ai_core.conversation_store import append_message_for_conversation

	name = append_message_for_conversation(
		conversation_id,
		role=role,
		content=content,
		content_json=parsed_json if isinstance(parsed_json, (dict, list)) else None,
		message_type=message_type or "text",
		model_used=None,
		artifacts=parsed_artifacts,
		update_title_from_user=role == "user",
		commit=True,
	)
	if not name:
		frappe.throw(_("Could not save message"))
	return {"name": name}


@frappe.whitelist()
def get_lan_access_urls() -> dict[str, Any]:
	"""URLs for opening the voice demo from other devices on the same LAN (192.168.x.x)."""
	if frappe.session.user == "Guest":
		frappe.throw(_("Login required"), frappe.PermissionError)
	return get_lan_access_info()


@frappe.whitelist()
def list_sessions(ref_doctype: str | None = None, ref_docname: str | None = None) -> list[dict[str, Any]]:
	filters: dict[str, Any] = {"user": frappe.session.user}
	if ref_doctype:
		filters["ref_doctype"] = ref_doctype
	if ref_docname:
		filters["ref_docname"] = ref_docname

	return frappe.get_all(
		"AI Session",
		filters=filters,
		fields=["name", "status", "score", "template", "modified", "ref_doctype", "ref_docname"],
		order_by="modified desc",
		limit=50,
	)


def build_agent_instructions(session_name: str, *, erpnext_mcp_hint: bool = False) -> tuple[str, str]:
	"""Used by voice worker: full system prompt + model name."""
	# Worker calls frappe.init + connect in _ensure_frappe; avoid frappe.connect() here (it replaces local.db).
	sess = frappe.get_doc("AI Session", session_name)
	template = frappe.get_doc("AI Agent Template", sess.template)
	settings = frappe.get_single("AI Global Settings")

	from frappe_ai_core.ai_engine.context_loader import load_context_from_template

	ctx = load_context_from_template(template, sess.ref_doctype, sess.ref_docname)
	ctx_text = format_context_for_prompt(ctx)
	base = template.system_prompt or ""
	lang_mode = template.language_mode or ""
	suffix = map_language_mode_to_instruction_suffix(lang_mode)
	stt_block = map_language_mode_to_stt_instruction_block(lang_mode)

	from frappe_ai_core.ai_engine.knowledge import build_kb_prompt_block

	_kb_block = build_kb_prompt_block(getattr(template, "knowledge_base", None))

	_handoff_block = ""
	if getattr(template, "enable_human_handoff", 0):
		_handoff_block = """

---
## Human handoff (transfer to a real person)
First always try to resolve the request yourself using the knowledge base and sensible general problem-solving. Transfer only when the request is genuinely beyond your scope or the knowledge base, needs account/document/identity action you cannot perform, or the user explicitly asks for a human.

When you do transfer, call the tool `transfer_to_human` exactly once. Before calling it, briefly tell the user you are connecting them. Fill in all of:
- `reason`: short why this needs a human.
- `summary`: what has happened so far and what you already tried (in English).
- `customer_request`: what the customer specifically wants done.
- `suggested_next_step`: a concrete first action the human should take to continue (the starting point).
After calling the tool, stop talking and let the human take over.
"""
	_mcp_block = ""
	if erpnext_mcp_hint:
		_mcp_block = """

---
## ERPNext tools (MCP)
You have live access to ERPNext through the tools listed in this session (sales, inventory, accounting, analytics, etc.). Use them whenever the user asks for numbers, lists, trends, or documents. Prefer the smallest tool call that answers the question. Never invent figures — always ground spoken answers in tool results. Summarize in Neplish for the user; do not read raw JSON aloud.
"""
	_voice_end = """

---
## Voice session completion (required)
When the scenario is finished (e.g. interview concluded, you thanked the participant, no further questions), you **must call the tool `end_voice_session` once** so the call ends for everyone. Do not tell the user to press a button to hang up. Give your closing words, then call the tool as the final action.
"""
	full = f"{base}{suffix}{stt_block}{_kb_block}{_handoff_block}{_mcp_block}\n\n---\nContext (JSON):\n{ctx_text}{_voice_end}"
	raw_model = settings.gemini_model or _DEFAULT_GEMINI_LIVE_MODEL
	model = normalize_gemini_live_model(raw_model)
	return full, model
