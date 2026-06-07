# Copyright (c) 2026, Frappe AI Core and contributors
# For license information, please see license.txt

"""Compatibility shims for @casys/mcp-erpnext REST calls.

The MCP server lists ERPNext child-table DocTypes (e.g. Sales Invoice Item) via
``GET /api/resource/<child>`` without the ``parent`` query param. Frappe's API
always raises PermissionError for child tables when parent is missing — even for
Administrator API keys. This is expected Frappe behaviour, not bad credentials.

We infer the parent DocType when the REST list endpoint is used for a child table
and the caller already has read permission on that parent.
"""

from __future__ import annotations

import frappe

_PATCHED = False


def _parent_doctype_for_child(child_doctype: str) -> str | None:
	if not child_doctype or not frappe.db.exists("DocType", child_doctype):
		return None
	if not frappe.get_meta(child_doctype).istable:
		return None
	parent = frappe.db.get_value(
		"DocField",
		{"fieldtype": "Table", "options": child_doctype},
		"parent",
	)
	if parent:
		return parent
	return frappe.db.get_value(
		"Custom Field",
		{"fieldtype": "Table", "options": child_doctype},
		"dt",
	)


def apply_mcp_child_table_compat() -> None:
	"""Patch Frappe child-table permission check once per process."""
	global _PATCHED
	if _PATCHED:
		return

	from frappe.model import db_query

	original = db_query.check_parent_permission

	def _patched(parent, child_doctype):
		if not parent and child_doctype:
			parent = _parent_doctype_for_child(child_doctype)
		return original(parent, child_doctype)

	db_query.check_parent_permission = _patched
	# frappe.client imports check_parent_permission by value at module load.
	import frappe.client as frappe_client

	frappe_client.check_parent_permission = _patched
	_PATCHED = True


apply_mcp_child_table_compat()
