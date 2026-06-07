# Copyright (c) 2026, Frappe AI Core and contributors
# For license information, please see license.txt

"""Load dynamic context from AI Agent Template context_logic (restricted Python)."""

from __future__ import annotations

import json
from typing import Any

import frappe
from frappe import _

_SAFE_BUILTINS = {
	"False": False,
	"True": True,
	"None": None,
	"abs": abs,
	"bool": bool,
	"dict": dict,
	"enumerate": enumerate,
	"float": float,
	"int": int,
	"isinstance": isinstance,
	"len": len,
	"list": list,
	"max": max,
	"min": min,
	"range": range,
	"round": round,
	"set": set,
	"sorted": sorted,
	"str": str,
	"sum": sum,
	"tuple": tuple,
	"zip": zip,
}


def load_context_from_template(
	template_doc,
	ref_doctype: str | None,
	ref_docname: str | None,
) -> dict[str, Any]:
	"""Execute template.context_logic in a restricted namespace; expect `context` dict or return value."""
	code = (template_doc.context_logic or "").strip()
	if not code:
		return {}

	local: dict[str, Any] = {
		"frappe": frappe,
		"ref_doctype": ref_doctype,
		"ref_docname": ref_docname,
		"context": {},
		"get_doc": frappe.get_doc,
		"get_value": frappe.db.get_value,
		"get_all": frappe.get_all,
		"json": json,
	}
	global_ns = {"__builtins__": _SAFE_BUILTINS}
	try:
		exec(code, global_ns, local)  # noqa: S102 — intentional restricted template execution
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "frappe_ai_core context_logic")
		frappe.throw(_("Context logic error: {0}").format(str(e)))

	out = local.get("context")
	if out is None:
		# Allow last expression style: assign to `result`
		out = local.get("result", {})
	if not isinstance(out, dict):
		frappe.throw(_("Context logic must set dict variable `context` or `result`"))
	return out


def format_context_for_prompt(ctx: dict[str, Any]) -> str:
	try:
		return json.dumps(ctx, indent=2, default=str)
	except TypeError:
		return str(ctx)


def map_language_mode_to_instruction_suffix(language_mode: str) -> str:
	if language_mode == "Nepali Only":
		return "\n\nRespond only in Nepali. Use respectful forms (Hajur/Tapai) where appropriate."
	if language_mode == "English Only":
		return "\n\nRespond only in English."
	if language_mode == "Neplish Mixed":
		return "\n\nYou may mix Nepali and English naturally (Neplish). Prefer respectful Nepali honorifics when speaking Nepali."
	return ""
