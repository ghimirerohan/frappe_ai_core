# Copyright (c) 2026, Frappe AI Core and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class AIMessage(Document):
	def before_insert(self):
		if not self.timestamp:
			self.timestamp = frappe.utils.now()
		if not self.sequence and self.conversation:
			self.sequence = _next_sequence(self.conversation)


def _next_sequence(conversation: str) -> int:
	last = frappe.db.sql(
		"""SELECT MAX(`sequence`) FROM `tabAI Message` WHERE conversation=%s""",
		(conversation,),
	)
	if last and last[0] and last[0][0] is not None:
		return int(last[0][0]) + 1
	return 1
