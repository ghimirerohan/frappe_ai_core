# Copyright (c) 2026, Frappe AI Core and contributors
# For license information, please see license.txt

"""Tokenomics API: cost summary for the React analytics dashboard (manager-gated)."""

from __future__ import annotations

from typing import Any

import frappe
from frappe import _
from frappe.utils import add_days, flt, getdate, today


def _captured_at_filters(from_date: str, to_date: str) -> list[list]:
	"""Inclusive date range on Datetime field (timezone-safe upper bound)."""
	start = getdate(from_date)
	end = getdate(to_date)
	return [
		["captured_at", ">=", f"{start} 00:00:00"],
		["captured_at", "<", f"{add_days(end, 1)} 00:00:00"],
	]

_MANAGER_ROLES = {"AI Voice Manager", "System Manager"}


def _require_manager() -> None:
	if frappe.session.user == "Guest":
		frappe.throw(_("Login required"), frappe.PermissionError)
	if not (_MANAGER_ROLES & set(frappe.get_roles())):
		frappe.throw(_("You are not allowed to view cost analytics"), frappe.PermissionError)


@frappe.whitelist()
def get_cost_summary(from_date: str | None = None, to_date: str | None = None) -> dict[str, Any]:
	"""Aggregated tokenomics for the dashboard: totals, daily series, and breakdowns.

	Defaults to the last 30 days. Restricted to AI Voice Manager / System Manager.
	"""
	_require_manager()

	to_date = to_date or today()
	from_date = from_date or add_days(to_date, -30)

	records = frappe.get_all(
		"AI Usage Record",
		filters=_captured_at_filters(from_date, to_date),
		fields=[
			"captured_at",
			"session",
			"template",
			"usage_kind",
			"model",
			"provider",
			"total_tokens",
			"input_text_tokens",
			"input_audio_tokens",
			"output_text_tokens",
			"output_audio_tokens",
			"cost_usd",
			"cost_npr",
			"pricing_found",
		],
		order_by="captured_at asc",
		limit=20000,
	)

	usd_to_npr = frappe.db.get_single_value("AI Global Settings", "usd_to_npr_rate") or 141.0

	totals = {
		"cost_usd": 0.0,
		"cost_npr": 0.0,
		"total_tokens": 0,
		"input_audio_tokens": 0,
		"output_audio_tokens": 0,
		"input_text_tokens": 0,
		"output_text_tokens": 0,
		"records": len(records),
		"unpriced_records": 0,
	}
	by_day: dict[str, dict[str, float]] = {}
	by_model: dict[str, dict[str, float]] = {}
	by_kind: dict[str, dict[str, float]] = {}
	by_template: dict[str, dict[str, float]] = {}
	sessions: set[str] = set()

	def _bump(bucket: dict[str, dict[str, float]], key: str, usd: float, npr: float, tokens: int) -> None:
		slot = bucket.setdefault(key, {"cost_usd": 0.0, "cost_npr": 0.0, "total_tokens": 0})
		slot["cost_usd"] += usd
		slot["cost_npr"] += npr
		slot["total_tokens"] += tokens

	for r in records:
		usd = flt(r.cost_usd)
		npr = flt(r.cost_npr)
		tokens = int(r.total_tokens or 0)
		totals["cost_usd"] += usd
		totals["cost_npr"] += npr
		totals["total_tokens"] += tokens
		totals["input_audio_tokens"] += int(r.input_audio_tokens or 0)
		totals["output_audio_tokens"] += int(r.output_audio_tokens or 0)
		totals["input_text_tokens"] += int(r.input_text_tokens or 0)
		totals["output_text_tokens"] += int(r.output_text_tokens or 0)
		if not r.pricing_found:
			totals["unpriced_records"] += 1
		if r.session:
			sessions.add(r.session)
		day = str(getdate(r.captured_at)) if r.captured_at else "?"
		_bump(by_day, day, usd, npr, tokens)
		_bump(by_model, r.model or "(unknown)", usd, npr, tokens)
		_bump(by_kind, r.usage_kind or "(unknown)", usd, npr, tokens)
		_bump(by_template, r.template or "(none)", usd, npr, tokens)

	session_count = len(sessions)
	totals["sessions"] = session_count
	totals["avg_cost_usd_per_session"] = (totals["cost_usd"] / session_count) if session_count else 0.0

	def _series(bucket: dict[str, dict[str, float]], sort_by_cost: bool = False) -> list[dict[str, Any]]:
		items = [
			{
				"key": k,
				"cost_usd": round(v["cost_usd"], 6),
				"cost_npr": round(v["cost_npr"], 4),
				"total_tokens": int(v["total_tokens"]),
			}
			for k, v in bucket.items()
		]
		if sort_by_cost:
			items.sort(key=lambda x: x["cost_usd"], reverse=True)
		else:
			items.sort(key=lambda x: x["key"])
		return items

	return {
		"from_date": str(from_date),
		"to_date": str(to_date),
		"usd_to_npr_rate": flt(usd_to_npr),
		"totals": {
			"cost_usd": round(totals["cost_usd"], 6),
			"cost_npr": round(totals["cost_npr"], 4),
			"total_tokens": totals["total_tokens"],
			"input_audio_tokens": totals["input_audio_tokens"],
			"output_audio_tokens": totals["output_audio_tokens"],
			"input_text_tokens": totals["input_text_tokens"],
			"output_text_tokens": totals["output_text_tokens"],
			"sessions": session_count,
			"records": totals["records"],
			"unpriced_records": totals["unpriced_records"],
			"avg_cost_usd_per_session": round(totals["avg_cost_usd_per_session"], 6),
		},
		"daily": _series(by_day),
		"by_model": _series(by_model, sort_by_cost=True),
		"by_kind": _series(by_kind, sort_by_cost=True),
		"by_template": _series(by_template, sort_by_cost=True),
	}
