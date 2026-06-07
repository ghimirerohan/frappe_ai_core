# Copyright (c) 2026, Frappe AI Core and contributors
# For license information, please see license.txt

"""Desk app switcher visibility (mirrors ERPNext-style desk vs website users)."""

import frappe
from frappe.utils.user import is_website_user


def check_app_permission() -> bool:
	if frappe.session.user == "Administrator":
		return True
	if frappe.session.user == "Guest":
		return False
	if is_website_user():
		return False
	return True
