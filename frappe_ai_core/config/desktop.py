from frappe import _


def get_data():
	return [
		{
			"module_name": "Frappe AI Core",
			"color": "#6366f1",
			"icon": "octicon octicon-pulse",
			"type": "module",
			"label": _("AI Voice Engine"),
			"description": _("Voice sessions, agent templates, and LiveKit integration."),
		}
	]
