# Copyright (c) 2026, Frappe AI Core and contributors
# For license information, please see license.txt

"""LiveKit Agents worker: joins rooms dispatched for frappe_ai_core, runs Gemini Live."""

from __future__ import annotations

import json
import os
import sys


def _infer_bench_root_from_this_file() -> str | None:
	"""Resolve bench directory (contains ``sites/``) by walking up from this module."""
	p = os.path.abspath(os.path.dirname(__file__))
	for _ in range(14):
		if os.path.isdir(os.path.join(p, "sites")):
			return p
		parent = os.path.dirname(p)
		if parent == p:
			break
		p = parent
	return None


def _resolve_bench_root() -> str:
	"""Prefer a valid ``FRAPPE_BENCH_ROOT``; ignore placeholders like ``/path/to/frappe-bench``."""
	env = (os.environ.get("FRAPPE_BENCH_ROOT") or "").strip()
	if env and os.path.isdir(os.path.join(env, "sites")):
		return env
	inferred = _infer_bench_root_from_this_file()
	if inferred:
		return inferred
	return "/home/frappe/frappe-bench"


# Bench root (contains apps/ and sites/)
_BENCH_ROOT = _resolve_bench_root()
_apps = os.path.join(_BENCH_ROOT, "apps")
if _apps not in sys.path:
	sys.path.insert(0, _apps)

import frappe

# LiveKit imports at module level so `server` + entrypoint are picklable (dev mode spawns subprocess).
from livekit import agents
from livekit.agents import Agent, AgentServer, AgentSession, room_io
from livekit.agents.job import get_job_context
from livekit.agents.llm import ChatMessage, function_tool
from livekit.agents.voice.events import ConversationItemAddedEvent, RunContext, UserInputTranscribedEvent

_AGENT_NAME = os.environ.get("LIVEKIT_AGENT_NAME", "frappe-ai-voice")
_MAX_DATA_PACKET_BYTES = 12000


async def _publish_data(room, topic: str, payload: dict) -> None:
	try:
		lp = room.local_participant
		if lp is None:
			return
		raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
		if len(raw) > _MAX_DATA_PACKET_BYTES:
			raw = json.dumps(
				{"type": "truncated", "topic": topic, "message": "Payload too large for UI"},
				ensure_ascii=False,
			).encode("utf-8")
		await lp.publish_data(raw, topic=topic, reliable=True)
	except Exception:
		frappe.log_error(frappe.get_traceback(), "frappe_ai_core voice_agent publish_data")


@function_tool(
	description=(
		"Ends the voice session for everyone after the scenario is complete. "
		"Call this once after you have said your final goodbye. "
		"Do not ask the user to hang up manually."
	)
)
async def end_voice_session(context: RunContext) -> str:
	"""Wait for farewell audio, then shut down the session and disconnect the room."""
	await context.wait_for_playout()
	context.session.shutdown(drain=True)
	try:
		job_ctx = get_job_context()
		await job_ctx.room.disconnect()
	except Exception:
		pass
	return "Session ended."


def _current_room_name() -> str | None:
	try:
		return get_job_context().room.name
	except Exception:
		return None


@function_tool(
	description=(
		"Search the configured knowledge base for policies, guidelines, prices, or factual details. "
		"Pass a short natural-language query (e.g. 'refund window', 'late payment fee'). "
		"Returns matching article excerpts; ground your answer in them and never invent policy."
	)
)
async def search_knowledge_base(context: RunContext, query: str) -> str:
	"""Look up the session template's knowledge base and return matching article excerpts."""
	_ensure_frappe()
	room_name = _current_room_name()
	kb_name = None
	if room_name and frappe.db.exists("AI Session", room_name):
		template = frappe.db.get_value("AI Session", room_name, "template")
		if template:
			kb_name = frappe.db.get_value("AI Agent Template", template, "knowledge_base")
	if not kb_name:
		return "No knowledge base is configured for this session."
	from frappe_ai_core.ai_engine.knowledge import search_articles

	results = search_articles(kb_name, query, limit=5)
	if not results:
		return "No matching articles were found in the knowledge base."
	prefix = "Only cite this content; do not infer live account, KYC, or transaction status.\n"
	return prefix + json.dumps(results, ensure_ascii=False)


@function_tool(
	description=(
		"Transfer this call to a human agent immediately. Call once when the request is beyond the knowledge "
		"base, needs account action you cannot perform, or is out of scope. REQUIRED: `customer_name` (full "
		"name) and `esewa_phone` (10-digit registered mobile). Also provide `reason`, `summary` (what happened "
		"+ what you tried), `customer_request`, and `suggested_next_step`. Announce you are connecting them, "
		"then call this and stop talking. Do not wait for the customer to confirm."
	)
)
async def transfer_to_human(
	context: RunContext,
	customer_name: str = "",
	esewa_phone: str = "",
	reason: str = "",
	summary: str = "",
	customer_request: str = "",
	suggested_next_step: str = "",
) -> str:
	"""Create an AI Handoff Request and notify human agents; the AI stays connected but quiet."""
	await context.wait_for_playout()
	_ensure_frappe()
	room_name = _current_room_name()
	if not room_name or not frappe.db.exists("AI Session", room_name):
		return "Unable to start the transfer right now."

	sess = frappe.db.get_value("AI Session", room_name, ["user", "template"], as_dict=True)
	from frappe_ai_core.conversation_store import get_conversation_id_for_session

	conversation_id = get_conversation_id_for_session(room_name)

	handoff_name = None
	try:
		existing = frappe.db.get_value(
			"AI Handoff Request",
			{"session": room_name, "status": ["in", ["Requested", "Accepted"]]},
			"name",
		)
		if existing:
			handoff_name = existing
		else:
			doc = frappe.get_doc(
				{
					"doctype": "AI Handoff Request",
					"session": room_name,
					"conversation": conversation_id,
					"room_name": room_name,
					"requested_by": sess.user if sess else None,
					"customer_name": (customer_name or "")[:140],
					"esewa_phone": (esewa_phone or "")[:20],
					"reason": (reason or "")[:500],
					"summary": summary or "",
					"customer_request": customer_request or "",
					"suggested_next_step": suggested_next_step or "",
					"status": "Requested",
				}
			)
			doc.insert(ignore_permissions=True)
			frappe.db.commit()
			handoff_name = doc.name
	except Exception:
		frappe.db.rollback()
		frappe.log_error(frappe.get_traceback(), "frappe_ai_core transfer_to_human")
		return "Sorry, the transfer could not be started."

	try:
		frappe.publish_realtime(
			"ai_handoff_requested",
			{
				"handoff": handoff_name,
				"session": room_name,
				"customer_request": (customer_request or "")[:300],
			},
		)
	except Exception:
		pass

	try:
		job_ctx = get_job_context()
		await _publish_data(
			job_ctx.room,
			"handoff",
			{"status": "requested", "handoff": handoff_name, "message": "Connecting you to a human agent…"},
		)
	except Exception:
		pass

	return "A human agent has been requested and will join shortly."


def _frappe_db_alive() -> bool:
	try:
		loc = frappe.local
	except Exception:
		return False
	if not getattr(loc, "site", None):
		return False
	db = getattr(loc, "db", None)
	if not db:
		return False
	return getattr(db, "_conn", None) is not None


def _ensure_frappe() -> None:
	if _frappe_db_alive():
		return
	site = os.environ.get("FRAPPE_SITE", "development.localhost")
	sites_path = os.path.join(_BENCH_ROOT, "sites")
	# LiveKit runs each job in a subprocess whose CWD is often the shell cwd (e.g. /workspace/development).
	# Frappe's database logger uses path "../logs/database.log" relative to CWD, which then points at
	# /workspace/logs and crashes with FileNotFoundError. Match `bench` behaviour: CWD = bench/sites.
	bench_logs = os.path.join(_BENCH_ROOT, "logs")
	try:
		os.makedirs(bench_logs, exist_ok=True)
	except OSError:
		pass
	try:
		os.makedirs(os.path.join(sites_path, site, "logs"), exist_ok=True)
	except OSError:
		pass
	try:
		os.chdir(sites_path)
	except OSError:
		# Last resort: avoid RotatingFileHandler paths if we cannot chdir into sites/
		os.environ.setdefault("FRAPPE_STREAM_LOGGING", "1")
	frappe.init(site=site, sites_path=sites_path)
	frappe.connect()


def _persist_transcript(room_name: str, lines: list[str], *, language_mode: str = "") -> None:
	if not lines:
		return
	_ensure_frappe()
	from frappe_ai_core.ai_engine.transcript_cleanup import polish_transcript_lines

	final_lines = polish_transcript_lines(lines, language_mode or "Neplish Mixed")
	text = "\n".join(final_lines)
	try:
		frappe.db.set_value("AI Session", room_name, "transcript", text)
		frappe.db.commit()
	except Exception:
		frappe.log_error(frappe.get_traceback(), "frappe_ai_core transcript save")


def _record_usage(room_name: str, usage: object, usage_kind: str) -> None:
	"""Persist per-model token usage (tokenomics) for this session."""
	if usage is None:
		return
	model_usage = getattr(usage, "model_usage", None) or []
	if not model_usage:
		return
	try:
		_ensure_frappe()
		from frappe_ai_core.ai_engine import costing

		for mu in model_usage:
			costing.record_model_usage(room_name, usage_kind, mu)
	except Exception:
		frappe.log_error(frappe.get_traceback(), "frappe_ai_core record usage voice")


def _on_shutdown(
	room_name: str,
	transcript_lines: list[str],
	usage: object = None,
	*,
	language_mode: str = "",
) -> None:
	_ensure_frappe()
	try:
		from frappe_ai_core.conversation_store import mark_conversation_completed

		mark_conversation_completed(room_name)
	except Exception:
		frappe.log_error(frappe.get_traceback(), "frappe_ai_core mark_conversation_completed voice")
	_persist_transcript(room_name, transcript_lines, language_mode=language_mode)
	_record_usage(room_name, usage, "Live Voice")
	try:
		frappe.db.set_value(
			"AI Session",
			room_name,
			{
				"ended_at": frappe.utils.now(),
				"status": "Completed",
			},
		)
		frappe.db.commit()
	except Exception:
		frappe.log_error(frappe.get_traceback(), "frappe_ai_core session ended_at")

	try:
		from frappe_ai_core.ai_engine import judge_agent

		judge_agent.evaluate_session(room_name)
	except Exception:
		frappe.log_error(frappe.get_traceback(), "frappe_ai_core evaluate_session")
		try:
			frappe.db.set_value("AI Session", room_name, {"status": "Completed"})
			frappe.db.commit()
		except Exception:
			frappe.log_error(frappe.get_traceback(), "frappe_ai_core session complete fallback")


class FrappeVoiceAssistant(Agent):
	"""Module-level agent class (required for LiveKit CLI dev mode pickling).

	Carries the same scenario as RealtimeModel so the agent framework stays in-session
	instead of defaulting to a generic assistant persona.
	"""

	def __init__(self, instructions: str) -> None:
		super().__init__(
			instructions=instructions
			or "You are the session voice assistant. Follow the configured scenario and stay in character.",
		)


async def frappe_ai_voice_job(ctx: agents.JobContext):
	"""RTC entrypoint — must be top-level for `agents dev` subprocess / watchfiles."""
	_ensure_frappe()
	room_name = ctx.room.name

	if not frappe.db.table_exists("AI Session"):
		site = getattr(frappe.local, "site", os.environ.get("FRAPPE_SITE", ""))
		frappe.log_error(
			f"frappe_ai_core is not installed on site '{site}' (missing tabAI Session). "
			f"Set FRAPPE_SITE to a site with frappe_ai_core installed.",
			"frappe_ai_core voice_agent",
		)
		await ctx.connect()
		return

	if not frappe.db.exists("AI Session", room_name):
		await ctx.connect()
		return

	from frappe_ai_core.api.session import build_agent_instructions

	full_prompt, model_name = build_agent_instructions(room_name)
	settings = frappe.get_single("AI Global Settings")
	raw_model = (settings.gemini_model or "").strip()
	if raw_model and raw_model != model_name:
		frappe.logger("frappe_ai_core").info(
			"Gemini Live model normalized for voice worker: %s -> %s (session %s)",
			raw_model,
			model_name,
			room_name,
		)
	template_name = frappe.db.get_value("AI Session", room_name, "template")
	language_mode = ""
	if template_name:
		language_mode = frappe.db.get_value("AI Agent Template", template_name, "language_mode") or ""
	from frappe_ai_core.ai_engine.stt_config import build_voice_stt_config, build_realtime_model

	stt_cfg = build_voice_stt_config(language_mode)
	api_key = settings.get_password("gemini_api_key")
	if not api_key:
		frappe.log_error("Missing Gemini API key", "frappe_ai_core voice_agent")
		await ctx.connect()
		return

	os.environ["GOOGLE_API_KEY"] = api_key

	await ctx.connect()
	from frappe_ai_core.api.session import voice_model_ui_label

	await _publish_data(
		ctx.room,
		"status",
		{
			"ok": True,
			"message": "LiveKit connected — voice agent starting…",
			"live_voice_model_id": model_name,
			"live_voice_model_label": voice_model_ui_label(model_name),
			"stt_provider": stt_cfg.stt_provider_label,
		},
	)

	transcript_lines: list[str] = []

	def _on_user(ev: UserInputTranscribedEvent) -> None:
		if ev.is_final and (ev.transcript or "").strip():
			t = ev.transcript.strip()
			if stt_cfg.polish_user_utterances:
				try:
					_ensure_frappe()
					from frappe_ai_core.ai_engine.transcript_cleanup import polish_user_utterance

					t = polish_user_utterance(t, language_mode)
				except Exception:
					frappe.log_error(frappe.get_traceback(), "frappe_ai_core polish user utterance voice")
			transcript_lines.append(f"User: {t}")
			try:
				_ensure_frappe()
				from frappe_ai_core.conversation_store import append_message_for_session

				append_message_for_session(
					room_name,
					role="user",
					content=t,
					message_type="audio_transcript",
					model_used=model_name,
				)
			except Exception:
				frappe.log_error(frappe.get_traceback(), "frappe_ai_core persist user transcript voice")

	def _on_conversation_item(ev: ConversationItemAddedEvent) -> None:
		item = ev.item
		if not isinstance(item, ChatMessage):
			return
		if item.role != "assistant":
			return
		text = item.text_content
		if text and text.strip():
			transcript_lines.append(f"Agent: {text.strip()}")
			try:
				_ensure_frappe()
				from frappe_ai_core.conversation_store import append_message_for_session

				append_message_for_session(
					room_name,
					role="assistant",
					content=text.strip(),
					message_type="text",
					model_used=model_name,
				)
			except Exception:
				frappe.log_error(frappe.get_traceback(), "frappe_ai_core persist assistant voice")

	try:
		frappe.db.set_value(
			"AI Session",
			room_name,
			{"status": "Live", "started_at": frappe.utils.now()},
		)
		frappe.db.commit()
	except Exception:
		frappe.log_error(frappe.get_traceback(), "frappe_ai_core session live")

	realtime = build_realtime_model(
		full_prompt=full_prompt,
		model_name=model_name,
		api_key=api_key,
		stt_cfg=stt_cfg,
		temperature=0.8,
	)
	# Per-template tool wiring: knowledge-base search + human handoff.
	kb_name = None
	handoff_enabled = False
	if template_name:
		cfg = frappe.db.get_value(
			"AI Agent Template",
			template_name,
			["knowledge_base", "enable_human_handoff"],
			as_dict=True,
		)
		if cfg:
			kb_name = cfg.knowledge_base
			handoff_enabled = bool(cfg.enable_human_handoff)

	tools = [end_voice_session]
	if kb_name:
		tools.append(search_knowledge_base)
	if handoff_enabled:
		tools.append(transfer_to_human)

	session = AgentSession(llm=realtime, tools=tools)
	session.on("user_input_transcribed", _on_user)
	session.on("conversation_item_added", _on_conversation_item)

	def _on_participant_connected(participant) -> None:
		"""When a human agent joins, mute the AI worker (no listen/speak). Worker stays in room for lifecycle only."""
		identity = getattr(participant, "identity", "") or ""
		if not identity.startswith("agent-human-"):
			return
		try:
			session.interrupt()
		except Exception:
			pass
		try:
			session.input.set_audio_enabled(False)
			session.output.set_audio_enabled(False)
		except Exception:
			frappe.log_error(frappe.get_traceback(), "frappe_ai_core handoff go-quiet")
		agent_name = getattr(participant, "name", None) or identity.replace("agent-human-", "")
		try:
			import asyncio

			job_ctx = get_job_context()
			loop = asyncio.get_running_loop()
			loop.create_task(
				_publish_data(
					job_ctx.room,
					"handoff",
					{
						"status": "human_joined",
						"agent_name": agent_name,
						"message": "A human agent is now live on the call.",
					},
				)
			)
		except Exception:
			pass
		try:
			_ensure_frappe()
			frappe.db.set_value(
				"AI Handoff Request",
				{"session": room_name, "status": "Requested"},
				"status",
				"Accepted",
			)
			frappe.db.commit()
		except Exception:
			frappe.log_error(frappe.get_traceback(), "frappe_ai_core handoff accept on join")

	if handoff_enabled:
		ctx.room.on("participant_connected", _on_participant_connected)

	async def _shutdown_cb(_reason: str = "") -> None:
		try:
			usage = session.usage
		except Exception:
			usage = None
		_on_shutdown(room_name, transcript_lines, usage, language_mode=language_mode)

	ctx.add_shutdown_callback(_shutdown_cb)

	await session.start(
		room=ctx.room,
		agent=FrappeVoiceAssistant(full_prompt),
		room_options=room_io.RoomOptions(),
	)

	await session.generate_reply(
		instructions=(
			"Give a brief greeting **in character** for this session (use the system instructions: role, language, goals). "
			"Invite the user to begin; do not sound like a generic demo assistant."
		),
	)


server = AgentServer()
server.rtc_session(frappe_ai_voice_job, agent_name=_AGENT_NAME)

if __name__ == "__main__":
	agents.cli.run_app(server)
