# Copyright (c) 2026, Frappe AI Core and contributors
# For license information, please see license.txt

import ast

import frappe
from frappe import _
from frappe.model.document import Document


class AIAgentTemplate(Document):
	def validate(self):
		self.validate_context_logic_syntax()

	def validate_context_logic_syntax(self):
		if not (self.context_logic or "").strip():
			return
		try:
			ast.parse(self.context_logic)
		except SyntaxError as e:
			frappe.throw(_("Invalid Python in Context Logic: {0}").format(str(e)))
