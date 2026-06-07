# Copyright (c) 2026, Frappe AI Core and contributors
# For license information, please see license.txt

"""Post-call evaluation: transcript + rubric -> Gemini judge -> AI Session fields."""

from __future__ import annotations

import json
import re
from typing import Any

import frappe


def _evaluation_json_db_value(data: dict[str, Any]) -> str:
	"""Frappe ``db.set_value`` does not serialize dicts for JSON columns; pass a JSON string."""
	return json.dumps(data, ensure_ascii=False)


def _record_judge_usage(session_name: str, model: str, usage_metadata: Any) -> None:
	"""Persist token usage from the judge model's generate_content response (tokenomics)."""
	if not usage_metadata:
		return
	try:
		from frappe_ai_core.ai_engine import costing

		in_tokens = int(getattr(usage_metadata, "prompt_token_count", 0) or 0)
		out_tokens = int(getattr(usage_metadata, "candidates_token_count", 0) or 0)
		costing.record_session_usage(
			session_name,
			usage_kind="Judge",
			provider="google",
			model=model,
			in_text=in_tokens,
			out_text=out_tokens,
		)
	except Exception:
		frappe.log_error(frappe.get_traceback(), "frappe_ai_core record judge usage")


def evaluate_session(session_name: str) -> None:
	"""Score session from transcript and template rubric; updates AI Session (status Evaluated, score, JSON).

	Called synchronously from the voice worker on shutdown (no RQ/long-queue worker required).
	"""
	try:
		_run_evaluation(session_name)
	except Exception:
		frappe.log_error(frappe.get_traceback(), "frappe_ai_core judge_agent")
		frappe.db.set_value("AI Session", session_name, "status", "Completed")
		frappe.db.commit()


def _run_evaluation(session_name: str) -> None:
	session = frappe.get_doc("AI Session", session_name)
	template = frappe.get_doc("AI Agent Template", session.template)
	settings = frappe.get_single("AI Global Settings")

	api_key = settings.get_password("gemini_api_key")
	if not api_key:
		frappe.throw("Gemini API key missing in AI Global Settings")

	transcript = (session.transcript or "").strip()
	if not transcript:
		frappe.db.set_value(
			"AI Session",
			session_name,
			{
				"status": "Completed",
				"evaluation_json": _evaluation_json_db_value({"error": "no_transcript"}),
			},
		)
		frappe.db.commit()
		return

	rubric = template.grading_rubric
	if isinstance(rubric, str):
		try:
			rubric = json.loads(rubric)
		except json.JSONDecodeError:
			rubric = {}
	if not rubric:
		rubric = {"criteria": "General quality and relevance of the conversation."}

	prompt = f"""You are an evaluation judge. Score the following voice-session transcript against the rubric.
Return ONLY valid JSON with keys: score (number 0-100), summary (string), highlights (array of strings), weaknesses (array of strings).

Rubric (JSON):
{json.dumps(rubric, indent=2)}

Transcript:
{transcript}
"""

	try:
		from google import genai
	except ImportError:
		frappe.log_error("google-genai not installed", "frappe_ai_core judge_agent")
		frappe.db.set_value(
			"AI Session",
			session_name,
			{
				"evaluation_json": _evaluation_json_db_value({"error": "google_genai_not_installed"}),
				"status": "Completed",
			},
		)
		frappe.db.commit()
		return

	client = genai.Client(api_key=api_key)
	model = (settings.judge_model or "").strip()
	if not model:
		model = "gemini-3.1-flash-lite-preview"
	resp = client.models.generate_content(model=model, contents=prompt)
	text = (resp.text or "").strip()
	_record_judge_usage(session_name, model, getattr(resp, "usage_metadata", None))

	eval_json: dict[str, Any] = {"raw": text}
	score = None
	try:
		json_match = re.search(r"\{[\s\S]*\}", text)
		if json_match:
			parsed = json.loads(json_match.group())
			eval_json = parsed
			score = float(parsed.get("score", 0))
	except (json.JSONDecodeError, TypeError, ValueError):
		pass

	update: dict[str, Any] = {
		"evaluation_json": _evaluation_json_db_value(eval_json),
		"status": "Evaluated",
	}
	if score is not None:
		update["score"] = score

	frappe.db.set_value("AI Session", session_name, update)
	frappe.db.commit()
