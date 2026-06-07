# Copyright (c) 2026, Frappe AI Core and contributors
# For license information, please see license.txt

"""LiveKit worker: ERPNext analytics voice agent (Gemini Live + @casys/mcp-erpnext via stdio MCP)."""

from __future__ import annotations

import asyncio
import json
import os
import sys


def _infer_bench_root_from_this_file() -> str | None:
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
	env = (os.environ.get("FRAPPE_BENCH_ROOT") or "").strip()
	if env and os.path.isdir(os.path.join(env, "sites")):
		return env
	inferred = _infer_bench_root_from_this_file()
	if inferred:
		return inferred
	return "/home/frappe/frappe-bench"


_BENCH_ROOT = _resolve_bench_root()
_apps = os.path.join(_BENCH_ROOT, "apps")
if _apps not in sys.path:
	sys.path.insert(0, _apps)

import frappe

from livekit import agents
from livekit.agents import NOT_GIVEN, Agent, AgentServer, AgentSession, mcp, room_io
from livekit.agents.job import get_job_context
from livekit.agents.llm import ChatMessage, function_tool
from livekit.agents.llm.mcp import MCPToolResultContext
from livekit.agents.voice.events import ConversationItemAddedEvent, RunContext, UserInputTranscribedEvent

_AGENT_NAME = os.environ.get("LIVEKIT_AGENT_NAME", "frappe-ai-analytics")

_MAX_DATA_PACKET_BYTES = 12000
_MAX_LLM_TOOL_CHARS = 8000


@function_tool(
	description=(
		"Ends the voice session for everyone when the user is done or the analysis is complete. "
		"Call once after your closing words. Do not ask the user to hang up manually."
	)
)
async def end_voice_session(context: RunContext) -> str:
	await context.wait_for_playout()
	context.session.shutdown(drain=True)
	try:
		job_ctx = get_job_context()
		await job_ctx.room.disconnect()
	except Exception:
		pass
	return "Session ended."


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
		frappe.log_error(frappe.get_traceback(), "frappe_ai_core record usage analytics")


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
		frappe.log_error(frappe.get_traceback(), "frappe_ai_core mark_conversation_completed analytics")
	_persist_transcript(room_name, transcript_lines, language_mode=language_mode)
	_record_usage(room_name, usage, "Analytics")
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
		frappe.log_error(frappe.get_traceback(), "frappe_ai_core analytics publish_data")


def _combined_tool_text(ctx: MCPToolResultContext) -> str:
	parts: list[str] = []
	for item in ctx.result.content:
		txt = getattr(item, "text", None)
		if txt:
			parts.append(txt)
		else:
			parts.append(item.model_dump_json() if hasattr(item, "model_dump_json") else str(item))
	return "\n".join(parts)


def _try_parse_json_object(text: str) -> dict | None:
	text = text.strip()
	if not text:
		return None
	try:
		out = json.loads(text)
		return out if isinstance(out, dict) else None
	except json.JSONDecodeError:
		pass
	for line in text.splitlines():
		line = line.strip()
		if line.startswith("{") and line.endswith("}"):
			try:
				out = json.loads(line)
				return out if isinstance(out, dict) else None
			except json.JSONDecodeError:
				continue
	return None


def _make_tool_result_resolver(room, room_name: str, model_name: str):
	async def _resolver(ctx: MCPToolResultContext) -> str:
		combined = _combined_tool_text(ctx)
		data_obj = _try_parse_json_object(combined)
		forward_keys = (
			"viewer",
			"chart",
			"kpi",
			"data",
			"rows",
			"series",
			"meta",
			"_rowAction",
			"_sendMessageHints",
			"_drillDown",
			"content",
			"result",
		)
		should_forward = ctx.tool_name.startswith("analytics") or (
			isinstance(data_obj, dict) and any(k in data_obj for k in forward_keys)
		)
		if isinstance(data_obj, dict) and should_forward:
			await _publish_data(
				room,
				"analytics",
				{
					"type": "analytics_tool_result",
					"tool": ctx.tool_name,
					"ts": frappe.utils.now(),
					"payload": data_obj,
				},
			)
			try:
				_ensure_frappe()
				from frappe_ai_core.conversation_store import append_message_for_session, build_artifacts_from_payload

				arts = build_artifacts_from_payload(ctx.tool_name, data_obj)
				append_message_for_session(
					room_name,
					role="tool_result",
					content=ctx.tool_name,
					content_json={"tool": ctx.tool_name, "payload": data_obj},
					message_type="tool_result",
					model_used=model_name,
					artifacts=arts,
				)
			except Exception:
				frappe.log_error(frappe.get_traceback(), "frappe_ai_core persist analytics tool_result")
		if len(combined) > _MAX_LLM_TOOL_CHARS:
			return combined[:_MAX_LLM_TOOL_CHARS] + "\n... [truncated for voice context]"
		return combined if combined else "(empty tool result)"

	return _resolver


class FrappeAnalyticsAssistant(Agent):
	def __init__(self, instructions: str) -> None:
		super().__init__(
			instructions=instructions
			or "You are the ERPNext voice business analyst. Use tools for data; explain in Neplish.",
		)


async def frappe_ai_analytics_job(ctx: agents.JobContext):
	_ensure_frappe()
	room_name = ctx.room.name

	if not frappe.db.exists("AI Session", room_name):
		await ctx.connect()
		return

	from frappe_ai_core.api.session import build_agent_instructions, voice_model_ui_label

	full_prompt, model_name = build_agent_instructions(room_name, erpnext_mcp_hint=True)
	settings = frappe.get_single("AI Global Settings")
	template_name = frappe.db.get_value("AI Session", room_name, "template")
	language_mode = ""
	if template_name:
		language_mode = frappe.db.get_value("AI Agent Template", template_name, "language_mode") or ""
	from frappe_ai_core.ai_engine.stt_config import build_voice_stt_config, build_realtime_model

	stt_cfg = build_voice_stt_config(language_mode)
	api_key = settings.get_password("gemini_api_key")
	if not api_key:
		frappe.log_error("Missing Gemini API key", "frappe_ai_core analytics_agent")
		await ctx.connect()
		return

	os.environ["GOOGLE_API_KEY"] = api_key

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
					frappe.log_error(frappe.get_traceback(), "frappe_ai_core polish user utterance analytics")
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
				frappe.log_error(frappe.get_traceback(), "frappe_ai_core persist user transcript analytics")

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
				frappe.log_error(frappe.get_traceback(), "frappe_ai_core persist assistant analytics")

	await ctx.connect()

	await _publish_data(
		ctx.room,
		"status",
		{
			"ok": True,
			"message": "LiveKit connected — starting ERPNext bridge…",
			"live_voice_model_id": model_name,
			"live_voice_model_label": voice_model_ui_label(model_name),
			"stt_provider": stt_cfg.stt_provider_label,
		},
	)

	mcp_servers: list[mcp.MCPServerStdio] = []
	url = (getattr(settings, "erpnext_mcp_url", None) or "").strip()
	api_k = (getattr(settings, "erpnext_mcp_api_key", None) or "").strip()
	api_sec = (settings.get_password("erpnext_mcp_api_secret") or "").strip()

	if url and api_k and api_sec:
		cats = (getattr(settings, "erpnext_mcp_categories", None) or "sales,inventory,accounting,analytics").strip()
		args = ["-y", "@casys/mcp-erpnext"]
		if cats:
			args.append(f"--categories={cats}")
		env = {**os.environ, "ERPNEXT_URL": url.rstrip("/"), "ERPNEXT_API_KEY": api_k, "ERPNEXT_API_SECRET": api_sec}
		server = mcp.MCPServerStdio(
			command="npx",
			args=args,
			env=env,
			client_session_timeout_seconds=180.0,
			tool_result_resolver=_make_tool_result_resolver(ctx.room, room_name, model_name),
		)
		try:
			await server.initialize()
			mcp_servers = [server]
			await _publish_data(
				ctx.room,
				"status",
				{
					"ok": True,
					"message": "ERPNext MCP connected — you can ask about sales, stock, and reports.",
					"live_voice_model_id": model_name,
					"live_voice_model_label": voice_model_ui_label(model_name),
				},
			)
		except Exception as e:
			frappe.log_error(frappe.get_traceback(), "frappe_ai_core analytics MCP init")
			await _publish_data(
				ctx.room,
				"error",
				{"ok": False, "message": f"ERPNext MCP failed to start: {e!s}"},
			)
			try:
				await server.aclose()
			except Exception:
				pass
	else:
		await _publish_data(
			ctx.room,
			"error",
			{
				"ok": False,
				"message": "ERPNext MCP not configured: set ERPNext URL, API Key, and API Secret in AI Global Settings.",
			},
		)

	try:
		frappe.db.set_value(
			"AI Session",
			room_name,
			{"status": "Live", "started_at": frappe.utils.now()},
		)
		frappe.db.commit()
	except Exception:
		frappe.log_error(frappe.get_traceback(), "frappe_ai_core analytics session live")

	realtime = build_realtime_model(
		full_prompt=full_prompt,
		model_name=model_name,
		api_key=api_key,
		stt_cfg=stt_cfg,
		temperature=0.7,
	)
	session = AgentSession(
		llm=realtime,
		tools=[end_voice_session],
		mcp_servers=mcp_servers if mcp_servers else NOT_GIVEN,
		max_tool_steps=12,
	)
	session.on("user_input_transcribed", _on_user)
	session.on("conversation_item_added", _on_conversation_item)

	async def _shutdown_cb(_reason: str = "") -> None:
		try:
			usage = session.usage
		except Exception:
			usage = None
		_on_shutdown(room_name, transcript_lines, usage, language_mode=language_mode)
		for s in mcp_servers:
			try:
				await s.aclose()
			except Exception:
				pass

	ctx.add_shutdown_callback(_shutdown_cb)

	await session.start(
		room=ctx.room,
		agent=FrappeAnalyticsAssistant(full_prompt),
		room_options=room_io.RoomOptions(),
	)

	await session.generate_reply(
		instructions=(
			"Give a short greeting in Neplish as the business analyst. "
			"Mention you can answer questions about sales, margins, top customers, and items using ERPNext. "
			"Ask what they want to know first."
		),
	)


server = AgentServer()
server.rtc_session(frappe_ai_analytics_job, agent_name=_AGENT_NAME)

if __name__ == "__main__":
	agents.cli.run_app(server)
