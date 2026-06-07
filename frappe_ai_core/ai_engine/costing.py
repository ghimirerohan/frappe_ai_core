# Copyright (c) 2026, Frappe AI Core and contributors
# For license information, please see license.txt

"""Tokenomics: price model usage and persist AI Usage Record rows.

Rates live in the editable `AI Model Pricing` master (USD per 1,000,000 tokens).
Unknown models are recorded with cost 0 and ``pricing_found = 0`` so dashboards can
flag unpriced usage rather than guessing.
"""

from __future__ import annotations

from typing import Any

import frappe

_PER_MILLION = 1_000_000.0
_DEFAULT_USD_TO_NPR = 141.0


def _get_pricing(model: str) -> dict[str, Any] | None:
	if not model or not frappe.db.exists("AI Model Pricing", model):
		return None
	row = frappe.db.get_value(
		"AI Model Pricing",
		model,
		[
			"enabled",
			"input_text_rate",
			"input_audio_rate",
			"cached_input_rate",
			"output_text_rate",
			"output_audio_rate",
		],
		as_dict=True,
	)
	if not row or not row.enabled:
		return None
	return row


def get_usd_to_npr_rate() -> float:
	try:
		rate = frappe.db.get_single_value("AI Global Settings", "usd_to_npr_rate")
		return float(rate) if rate else _DEFAULT_USD_TO_NPR
	except Exception:
		return _DEFAULT_USD_TO_NPR


def price_usage(
	model: str,
	*,
	in_text: int = 0,
	in_audio: int = 0,
	in_cached: int = 0,
	out_text: int = 0,
	out_audio: int = 0,
) -> dict[str, Any]:
	"""Compute USD + NPR cost for a token breakdown against AI Model Pricing.

	Returns ``{cost_usd, cost_npr, pricing_found}``. Cached input tokens are billed at the
	cached rate when one is set, otherwise they are treated as normal input text tokens.
	"""
	pricing = _get_pricing(model)
	if not pricing:
		return {"cost_usd": 0.0, "cost_npr": 0.0, "pricing_found": 0}

	cached_rate = float(pricing.cached_input_rate or 0)
	in_text_rate = float(pricing.input_text_rate or 0)
	cost_usd = (
		in_text * in_text_rate
		+ in_audio * float(pricing.input_audio_rate or 0)
		+ in_cached * (cached_rate if cached_rate else in_text_rate)
		+ out_text * float(pricing.output_text_rate or 0)
		+ out_audio * float(pricing.output_audio_rate or 0)
	) / _PER_MILLION

	cost_npr = cost_usd * get_usd_to_npr_rate()
	return {"cost_usd": cost_usd, "cost_npr": cost_npr, "pricing_found": 1}


def record_session_usage(
	session_name: str,
	*,
	usage_kind: str,
	provider: str,
	model: str,
	in_text: int = 0,
	in_audio: int = 0,
	in_cached: int = 0,
	out_text: int = 0,
	out_audio: int = 0,
) -> str | None:
	"""Create an AI Usage Record for one model use and bump the AI Session cost rollup.

	Skips writing a row when there are no tokens (nothing billable to record).
	"""
	total_tokens = int(in_text + in_audio + in_cached + out_text + out_audio)
	if total_tokens <= 0:
		return None

	template = None
	user = None
	if session_name and frappe.db.exists("AI Session", session_name):
		sess = frappe.db.get_value("AI Session", session_name, ["template", "user"], as_dict=True)
		if sess:
			template = sess.template
			user = sess.user

	priced = price_usage(
		model,
		in_text=in_text,
		in_audio=in_audio,
		in_cached=in_cached,
		out_text=out_text,
		out_audio=out_audio,
	)

	try:
		doc = frappe.get_doc(
			{
				"doctype": "AI Usage Record",
				"session": session_name,
				"template": template,
				"user": user,
				"usage_kind": usage_kind,
				"provider": provider or "",
				"model": model or "",
				"captured_at": frappe.utils.now(),
				"input_text_tokens": int(in_text),
				"input_audio_tokens": int(in_audio),
				"input_cached_tokens": int(in_cached),
				"output_text_tokens": int(out_text),
				"output_audio_tokens": int(out_audio),
				"total_tokens": total_tokens,
				"cost_usd": priced["cost_usd"],
				"cost_npr": priced["cost_npr"],
				"pricing_found": priced["pricing_found"],
			}
		)
		doc.insert(ignore_permissions=True)
		_bump_session_rollup(session_name)
		frappe.db.commit()
		return doc.name
	except Exception:
		frappe.db.rollback()
		frappe.log_error(frappe.get_traceback(), "frappe_ai_core record_session_usage")
		return None


def record_model_usage(session_name: str, usage_kind: str, mu: Any) -> str | None:
	"""Record usage from a LiveKit ``LLMModelUsage`` (duck-typed; no livekit import needed).

	Falls back to treating untyped input/output tokens as text when the provider did not
	break tokens down into text/audio details, so totals are never undercounted.
	"""
	in_text = int(getattr(mu, "input_text_tokens", 0) or 0)
	in_audio = int(getattr(mu, "input_audio_tokens", 0) or 0)
	in_cached = int(getattr(mu, "input_cached_tokens", 0) or 0)
	in_total = int(getattr(mu, "input_tokens", 0) or 0)
	if (in_text + in_audio + in_cached) == 0 and in_total > 0:
		in_text = in_total

	out_text = int(getattr(mu, "output_text_tokens", 0) or 0)
	out_audio = int(getattr(mu, "output_audio_tokens", 0) or 0)
	out_total = int(getattr(mu, "output_tokens", 0) or 0)
	if (out_text + out_audio) == 0 and out_total > 0:
		out_text = out_total

	return record_session_usage(
		session_name,
		usage_kind=usage_kind,
		provider=str(getattr(mu, "provider", "") or ""),
		model=str(getattr(mu, "model", "") or ""),
		in_text=in_text,
		in_audio=in_audio,
		in_cached=in_cached,
		out_text=out_text,
		out_audio=out_audio,
	)


def _bump_session_rollup(session_name: str) -> None:
	"""Recompute AI Session cost rollup from its usage records."""
	if not session_name or not frappe.db.exists("AI Session", session_name):
		return
	rows = frappe.get_all(
		"AI Usage Record",
		filters={"session": session_name},
		fields=["total_tokens", "cost_usd", "cost_npr"],
	)
	total_tokens = sum(int(r.total_tokens or 0) for r in rows)
	cost_usd = sum(float(r.cost_usd or 0) for r in rows)
	cost_npr = sum(float(r.cost_npr or 0) for r in rows)
	frappe.db.set_value(
		"AI Session",
		session_name,
		{"total_tokens": total_tokens, "cost_usd": cost_usd, "cost_npr": cost_npr},
		update_modified=False,
	)
