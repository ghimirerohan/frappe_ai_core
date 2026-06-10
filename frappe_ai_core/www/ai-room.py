import frappe

from frappe_ai_core.www._portal_context import apply_portal_context

no_cache = 1


def get_context(context):
	apply_portal_context(context)
