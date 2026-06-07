# Copyright (c) 2026, Frappe AI Core and contributors
# For license information, please see license.txt

import frappe


def ai_session_query(user: str | None = None) -> str | None:
	"""Non-managers only see their own AI Sessions in list/report views."""
	if not user:
		user = frappe.session.user
	if user == "Administrator" or "System Manager" in frappe.get_roles(user):
		return None
	return f"`tabAI Session`.`user` = {frappe.db.escape(user, percent=False)}"


def ai_session_has_permission(doc, ptype, user) -> bool | None:
	"""Allow owners to read their session documents."""
	if user == "Administrator" or "System Manager" in frappe.get_roles(user):
		return True
	if doc.user == user and ptype in ("read", "write"):
		return True
	if doc.user == user and ptype == "create":
		return True
	return None


def ai_conversation_query(user: str | None = None) -> str | None:
	if not user:
		user = frappe.session.user
	if user == "Administrator" or "System Manager" in frappe.get_roles(user):
		return None
	return f"`tabAI Conversation`.`user` = {frappe.db.escape(user, percent=False)}"


def ai_conversation_has_permission(doc, ptype, user) -> bool | None:
	if user == "Administrator" or "System Manager" in frappe.get_roles(user):
		return True
	if getattr(doc, "user", None) == user and ptype in ("read", "write", "create"):
		return True
	return None


def ai_message_query(user: str | None = None) -> str | None:
	if not user:
		user = frappe.session.user
	if user == "Administrator" or "System Manager" in frappe.get_roles(user):
		return None
	u = frappe.db.escape(user, percent=False)
	return (
		"`tabAI Message`.`conversation` IN ("
		f"SELECT `name` FROM `tabAI Conversation` WHERE `user` = {u}"
		")"
	)


def ai_message_has_permission(doc, ptype, user) -> bool | None:
	if user == "Administrator" or "System Manager" in frappe.get_roles(user):
		return True
	conv = getattr(doc, "conversation", None)
	if not conv:
		return None
	owner = frappe.db.get_value("AI Conversation", conv, "user")
	if owner == user and ptype in ("read", "write", "create"):
		return True
	return None
