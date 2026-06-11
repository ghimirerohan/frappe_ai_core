# MCP child-table REST compat (Sales Invoice Item, etc.) — see mcp_compat.py
import frappe_ai_core.mcp_compat  # noqa: F401, E402

app_name = "frappe_ai_core"
app_title = "AI Voice Engine"
app_publisher = "Frappe AI Core"
app_description = "Centralized AI Voice Engine (LiveKit + Gemini + Deepgram)"
app_email = ""
app_license = "mit"

app_icon_url = "/assets/frappe_ai_core/images/frappe-ai-core.svg"
app_icon_title = "AI Voice Engine"
app_icon_route = "/app/ai-voice-engine"

# Apps
# ------------------

add_to_apps_screen = [
	{
		"name": "frappe_ai_core",
		"logo": "/assets/frappe_ai_core/images/frappe-ai-core.svg",
		"title": "AI Voice Engine",
		"route": "/app/ai-voice-engine",
		"has_permission": "frappe_ai_core.api.permission.check_app_permission",
	}
]

website_route_rules = [
	{"from_route": "/ai_room/<path:app_path>", "to_route": "ai_room"},
	{"from_route": "/ai_room", "to_route": "ai_room"},
	# Hyphen URL (common in marketing / bookmarks); same LiveKit SPA as /ai_room (Aura visualizer).
	{"from_route": "/ai-room/<path:app_path>", "to_route": "ai-room"},
	{"from_route": "/ai-room", "to_route": "ai-room"},
	# Customer support portal (customer starts a query) + human-rep console (continue after AI handoff).
	# Both serve the same SPA; App.tsx routes by pathname (/support/agent => agent console).
	{"from_route": "/support/agent", "to_route": "ai-room"},
	{"from_route": "/support/<path:app_path>", "to_route": "ai-room"},
	{"from_route": "/support", "to_route": "ai-room"},
	# Interview practice portal (pick a role, voice interview, instant evaluation). Same SPA.
	{"from_route": "/interview/<path:app_path>", "to_route": "ai-room"},
	{"from_route": "/interview", "to_route": "ai-room"},
]

# Includes in <head>
# ------------------

# Svg Icons (path is under assets/frappe_ai_core/, not .../public/)
# ------------------
app_include_icons = "frappe_ai_core/icons.svg"

app_include_css = ["/assets/frappe_ai_core/css/workspace_desk.css"]

# Installation
# ------------

before_install = "frappe_ai_core.install.before_install"
after_install = "frappe_ai_core.install.after_install"
after_migrate = ["frappe_ai_core.install.after_migrate"]

permission_query_conditions = {
	"AI Session": "frappe_ai_core.permissions.ai_session_query",
	"AI Conversation": "frappe_ai_core.permissions.ai_conversation_query",
	"AI Message": "frappe_ai_core.permissions.ai_message_query",
}

has_permission = {
	"AI Session": "frappe_ai_core.permissions.ai_session_has_permission",
	"AI Conversation": "frappe_ai_core.permissions.ai_conversation_has_permission",
	"AI Message": "frappe_ai_core.permissions.ai_message_has_permission",
}

