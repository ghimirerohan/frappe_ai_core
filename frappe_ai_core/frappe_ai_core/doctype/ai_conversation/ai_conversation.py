# Copyright (c) 2026, Frappe AI Core and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class AIConversation(Document):
	def validate(self):
		if not self.session:
			return
		existing_name = frappe.db.get_value("AI Conversation", {"session": self.session}, "name")
		if existing_name and existing_name != self.name:
			frappe.throw(_("A conversation already exists for this AI Session."))
