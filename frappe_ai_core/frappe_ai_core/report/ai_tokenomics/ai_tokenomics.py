# Copyright (c) 2026, Frappe AI Core and contributors
# For license information, please see license.txt

"""AI Tokenomics: per-usage token + cost breakdown with daily-cost chart and summary."""

from __future__ import annotations

from collections import defaultdict
from typing import Any

import frappe
from frappe import _
from frappe.utils import add_days, flt, getdate


def execute(filters: dict | None = None) -> tuple:
	filters = frappe._dict(filters or {})
	columns = _get_columns()
	rows = _get_rows(filters)
	chart = _get_chart(rows)
	report_summary = _get_summary(rows)
	return columns, rows, None, chart, report_summary


def _get_columns() -> list[dict[str, Any]]:
	return [
		{"label": _("Date"), "fieldname": "date", "fieldtype": "Date", "width": 100},
		{
			"label": _("Session"),
			"fieldname": "session",
			"fieldtype": "Link",
			"options": "AI Session",
			"width": 150,
		},
		{
			"label": _("Template"),
			"fieldname": "template",
			"fieldtype": "Link",
			"options": "AI Agent Template",
			"width": 150,
		},
		{
			"label": _("User"),
			"fieldname": "user",
			"fieldtype": "Link",
			"options": "User",
			"width": 140,
		},
		{"label": _("Kind"), "fieldname": "usage_kind", "fieldtype": "Data", "width": 90},
		{"label": _("Model"), "fieldname": "model", "fieldtype": "Data", "width": 220},
		{"label": _("Total Tokens"), "fieldname": "total_tokens", "fieldtype": "Int", "width": 110},
		{"label": _("Cost (USD)"), "fieldname": "cost_usd", "fieldtype": "Float", "precision": 6, "width": 110},
		{"label": _("Cost (NPR)"), "fieldname": "cost_npr", "fieldtype": "Float", "precision": 2, "width": 110},
	]


def _get_rows(filters: frappe._dict) -> list[dict[str, Any]]:
	conditions: list[list] = []
	if filters.get("template"):
		conditions.append(["template", "=", filters.template])
	if filters.get("user"):
		conditions.append(["user", "=", filters.user])
	if filters.get("usage_kind"):
		conditions.append(["usage_kind", "=", filters.usage_kind])
	if filters.get("from_date") and filters.get("to_date"):
		start = getdate(filters.from_date)
		end = getdate(filters.to_date)
		conditions.append(["captured_at", ">=", f"{start} 00:00:00"])
		conditions.append(["captured_at", "<", f"{add_days(end, 1)} 00:00:00"])
	elif filters.get("from_date"):
		conditions.append(["captured_at", ">=", f"{getdate(filters.from_date)} 00:00:00"])
	elif filters.get("to_date"):
		conditions.append(["captured_at", "<", f"{add_days(getdate(filters.to_date), 1)} 00:00:00"])

	records = frappe.get_all(
		"AI Usage Record",
		filters=conditions or None,
		fields=[
			"captured_at",
			"session",
			"template",
			"user",
			"usage_kind",
			"model",
			"total_tokens",
			"cost_usd",
			"cost_npr",
		],
		order_by="captured_at desc",
		limit=5000,
	)
	rows: list[dict[str, Any]] = []
	for r in records:
		rows.append(
			{
				"date": r.captured_at,
				"session": r.session,
				"template": r.template,
				"user": r.user,
				"usage_kind": r.usage_kind,
				"model": r.model,
				"total_tokens": int(r.total_tokens or 0),
				"cost_usd": flt(r.cost_usd, 6),
				"cost_npr": flt(r.cost_npr, 2),
			}
		)
	return rows


def _get_chart(rows: list[dict[str, Any]]) -> dict[str, Any] | None:
	if not rows:
		return None
	by_day: dict[str, float] = defaultdict(float)
	for r in rows:
		day = str(r["date"])[:10] if r["date"] else "?"
		by_day[day] += flt(r["cost_usd"])
	labels = sorted(by_day.keys())
	values = [round(by_day[d], 6) for d in labels]
	return {
		"data": {
			"labels": labels,
			"datasets": [{"name": _("Cost (USD)"), "values": values}],
		},
		"type": "line",
		"colors": ["#22c55e"],
	}


def _get_summary(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
	total_usd = sum(flt(r["cost_usd"]) for r in rows)
	total_npr = sum(flt(r["cost_npr"]) for r in rows)
	total_tokens = sum(int(r["total_tokens"]) for r in rows)
	sessions = len({r["session"] for r in rows if r["session"]})
	avg_usd = total_usd / sessions if sessions else 0.0
	return [
		{"label": _("Total Cost (USD)"), "value": round(total_usd, 4), "indicator": "Green", "datatype": "Float"},
		{"label": _("Total Cost (NPR)"), "value": round(total_npr, 2), "indicator": "Blue", "datatype": "Float"},
		{"label": _("Total Tokens"), "value": total_tokens, "indicator": "Orange", "datatype": "Int"},
		{"label": _("Sessions"), "value": sessions, "indicator": "Grey", "datatype": "Int"},
		{"label": _("Avg Cost/Session (USD)"), "value": round(avg_usd, 4), "indicator": "Purple", "datatype": "Float"},
	]
