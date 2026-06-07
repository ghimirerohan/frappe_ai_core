# Copyright (c) 2026, Frappe AI Core and contributors
# For license information, please see license.txt

"""One-shot eSewa call-center demo prep: seed data, demo users, service checks, checklist.

Run before a live demo:

    bench --site development.localhost execute frappe_ai_core.demo.esewa_demo_prep.run

Idempotent — safe to re-run.
"""

from __future__ import annotations

import socket
import urllib.error
import urllib.request

import frappe

from frappe_ai_core.demo.esewa_seed import KB_NAME, TEMPLATE_NAME, run as seed_run, verify as seed_verify
from frappe_ai_core.utils.network import get_lan_access_info

# Demo accounts (website login). Change passwords after the demo if needed.
HUMAN_REP_EMAIL = "esewa.rep@demo.local"
HUMAN_REP_PASSWORD = "esewa-demo-rep"
CUSTOMER_EMAIL = "esewa.customer@demo.local"
CUSTOMER_PASSWORD = "esewa-demo-customer"

SITE_HOST = "development.localhost"
CUSTOMER_PORTAL = f"http://{SITE_HOST}:8000/support"
AGENT_PORTAL = f"http://{SITE_HOST}:8000/support/agent"


def _ensure_demo_user(
	email: str,
	password: str,
	first_name: str,
	last_name: str,
	roles: list[str] | None = None,
) -> str:
	roles = roles or []
	if frappe.db.exists("User", email):
		user = frappe.get_doc("User", email)
		changed = False
		for role in roles:
			if role not in {r.role for r in user.roles}:
				user.append("roles", {"role": role})
				changed = True
		if changed:
			user.save(ignore_permissions=True)
			frappe.db.commit()
		return email

	user = frappe.get_doc(
		{
			"doctype": "User",
			"email": email,
			"first_name": first_name,
			"last_name": last_name,
			"send_welcome_email": 0,
			"user_type": "System User",
		}
	)
	for role in roles:
		user.append("roles", {"role": role})
	user.new_password = password
	user.insert(ignore_permissions=True)
	frappe.db.commit()
	return email


def ensure_demo_users() -> dict[str, str]:
	"""Create human-rep and customer demo users (idempotent)."""
	rep = _ensure_demo_user(
		HUMAN_REP_EMAIL,
		HUMAN_REP_PASSWORD,
		"Ramesh",
		"Support",
		roles=["AI Human Agent"],
	)
	customer = _ensure_demo_user(
		CUSTOMER_EMAIL,
		CUSTOMER_PASSWORD,
		"Sita",
		"Customer",
		roles=[],
	)
	return {"human_rep": rep, "customer": customer}


def _tcp_reachable(host: str, port: int, timeout: float = 2.0) -> bool:
	try:
		with socket.create_connection((host, port), timeout=timeout):
			return True
	except OSError:
		return False


def _livekit_http_ok(base_url: str) -> bool:
	"""LiveKit exposes HTTP on the same port as the WebSocket URL."""
	url = base_url.replace("ws://", "http://").replace("wss://", "https://").rstrip("/")
	try:
		with urllib.request.urlopen(f"{url}/", timeout=2) as resp:
			return 200 <= resp.status < 500
	except (urllib.error.URLError, TimeoutError, OSError):
		return False


def check_services() -> list[dict[str, str]]:
	"""Return a list of {name, status, detail} checks for the demo environment."""
	checks: list[dict[str, str]] = []

	# AI Global Settings
	try:
		settings = frappe.get_single("AI Global Settings")
		has_gemini = bool(settings.get_password("gemini_api_key"))
		has_lk_key = bool((settings.livekit_api_key or "").strip())
		has_lk_secret = bool(settings.get_password("livekit_api_secret"))
		lk_url = (settings.livekit_url or "").strip() or "ws://localhost:7880"
		if has_gemini and has_lk_key and has_lk_secret:
			checks.append({"name": "AI Global Settings", "status": "ok", "detail": f"Keys set · LiveKit URL {lk_url}"})
		else:
			missing = []
			if not has_gemini:
				missing.append("Gemini API key")
			if not has_lk_key:
				missing.append("LiveKit API key")
			if not has_lk_secret:
				missing.append("LiveKit API secret")
			checks.append({"name": "AI Global Settings", "status": "fail", "detail": f"Missing: {', '.join(missing)}"})
	except Exception as exc:
		checks.append({"name": "AI Global Settings", "status": "fail", "detail": str(exc)})
		lk_url = "ws://localhost:7880"

	# eSewa demo data
	kb_ok = frappe.db.exists("AI Knowledge Base", KB_NAME)
	tmpl = frappe.db.get_value(
		"AI Agent Template",
		TEMPLATE_NAME,
		["name", "knowledge_base", "enable_human_handoff"],
		as_dict=True,
	)
	if kb_ok and tmpl and tmpl.enable_human_handoff:
		articles = frappe.db.count("AI Knowledge Article", {"knowledge_base": KB_NAME})
		checks.append(
			{
				"name": "eSewa demo data",
				"status": "ok",
				"detail": f"KB + template ready · {articles} articles · handoff enabled",
			}
		)
	else:
		checks.append({"name": "eSewa demo data", "status": "fail", "detail": "Run esewa_seed.run first"})

	# Human rep user
	if frappe.db.exists("User", HUMAN_REP_EMAIL):
		has_role = frappe.db.exists(
			"Has Role", {"parent": HUMAN_REP_EMAIL, "role": "AI Human Agent", "parenttype": "User"}
		)
		if has_role:
			checks.append({"name": "Human rep user", "status": "ok", "detail": HUMAN_REP_EMAIL})
		else:
			checks.append({"name": "Human rep user", "status": "warn", "detail": f"{HUMAN_REP_EMAIL} missing AI Human Agent role"})
	else:
		checks.append({"name": "Human rep user", "status": "fail", "detail": f"{HUMAN_REP_EMAIL} not created"})

	# Customer demo user
	if frappe.db.exists("User", CUSTOMER_EMAIL):
		checks.append({"name": "Customer demo user", "status": "ok", "detail": CUSTOMER_EMAIL})
	else:
		checks.append({"name": "Customer demo user", "status": "fail", "detail": f"{CUSTOMER_EMAIL} not created"})

	# LiveKit reachability (try common hosts)
	lk_hosts = []
	for candidate in (lk_url.replace("ws://", "").replace("wss://", "").split("/")[0], "localhost:7880", "livekit:7880"):
		host, _, port_s = candidate.partition(":")
		port = int(port_s or "7880")
		if (host, port) not in lk_hosts:
			lk_hosts.append((host, port))

	lk_reachable = False
	lk_detail = ""
	for host, port in lk_hosts:
		if _tcp_reachable(host, port):
			lk_reachable = True
			http_ok = _livekit_http_ok(f"ws://{host}:{port}")
			lk_detail = f"{host}:{port} reachable" + (" · HTTP ok" if http_ok else "")
			break
	if lk_reachable:
		checks.append({"name": "LiveKit server", "status": "ok", "detail": lk_detail})
	else:
		checks.append(
			{
				"name": "LiveKit server",
				"status": "fail",
				"detail": "Not reachable on localhost:7880 or livekit:7880 — start the livekit container",
			}
		)

	# Voice worker cannot be detected reliably from Frappe; remind operator.
	checks.append(
		{
			"name": "Voice agent worker",
			"status": "manual",
			"detail": "Must be running: python -m frappe_ai_core.ai_engine.voice_agent dev (FRAPPE_SITE=development.localhost)",
		}
	)

	return checks


def print_checklist(users: dict[str, str] | None = None) -> None:
	users = users or {}
	sep = "=" * 72
	print(sep)
	print("eSewa Call Center — LIVE DEMO CHECKLIST")
	print(sep)
	print()
	print("DEVICES (human-to-human voice at the end)")
	print("  • Two laptops is the BEST demo (customer laptop + rep laptop).")
	print("  • One laptop also works: normal browser = customer, incognito = rep.")
	print("  • Both sides need a microphone. Customer stays on /support; rep uses /support/agent.")
	print()
	print("BEFORE YOU START")
	print("  1. bench start   (or bench serve --port 8000)")
	print("  2. LiveKit running (Docker service livekit, port 7880)")
	print("  3. Voice worker:")
	print("       export FRAPPE_SITE=development.localhost")
	print("       export FRAPPE_BENCH_ROOT=/workspace/development/frappe-bench")
	print("       export LIVEKIT_URL=ws://livekit:7880   # or ws://localhost:7880 on host")
	print("       python -m frappe_ai_core.ai_engine.voice_agent dev")
	print()
	print("LOGINS (this machine)")
	print(f"  Customer  → {CUSTOMER_PORTAL}")
	print(f"             email: {CUSTOMER_EMAIL}  password: {CUSTOMER_PASSWORD}")
	print(f"  Human rep → {AGENT_PORTAL}")
	print(f"             email: {HUMAN_REP_EMAIL}  password: {HUMAN_REP_PASSWORD}")
	lan = get_lan_access_info()
	if lan.get("lan_ip"):
		print()
		print("SAME Wi‑Fi / LAN (other laptop or phone — use these, NOT development.localhost)")
		print(f"  Site        → {lan['site_base_lan']}")
		print(f"  Customer    → {lan['support_customer_lan']}")
		print(f"  Human rep   → {lan['support_agent_lan']}")
		print(f"  LiveKit WS  → {lan['livekit_url_lan']}  (auto when browsing via LAN IP)")
		print("  REQUIRED for LAN voice:")
		print(f"    {lan.get('livekit_node_ip_command', 'export LIVEKIT_NODE_IP=<wifi-ip> && docker compose restart livekit')}")
	else:
		print()
		print("LAN IP not detected — run demo prep on the host machine to print 192.168.x.x URLs.")
	print()
	print("DEMO SCRIPT (≈5 min)")
	print("  1. Customer: open /support → Start support call")
	print("  2. Ask: \"MPIN forgot\" → AI answers from knowledge base")
	print("  3. Ask: \"I want to talk to a real person\" → AI escalates")
	print("  4. Rep: open /support/agent → Accept handoff (read summary + starting point)")
	print("  5. Customer and rep talk live (AI goes quiet automatically)")
	print()
	print("SERVICE CHECKS")
	for row in check_services():
		icon = {"ok": "✓", "fail": "✗", "warn": "!", "manual": "→"}.get(row["status"], "?")
		print(f"  [{icon}] {row['name']}: {row['detail']}")
	print()
	print("KB SEARCH SANITY (sample queries)")
	seed_verify()
	print(sep)


def run() -> None:
	"""Full demo prep: seed eSewa data, create users, print checklist."""
	print("Seeding eSewa knowledge base + agent template…")
	seed_run()
	print("Creating demo users…")
	users = ensure_demo_users()
	print(f"  Human rep: {users['human_rep']}")
	print(f"  Customer:  {users['customer']}")
	print()
	print_checklist(users)
