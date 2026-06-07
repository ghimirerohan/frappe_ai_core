# Copyright (c) 2026, Frappe AI Core and contributors
# For license information, please see license.txt

"""LAN / local-network URL helpers for multi-device demos (phones, second laptops)."""

from __future__ import annotations

import os
import socket
from typing import Any
from urllib.parse import urlparse, urlunparse

import frappe

# Hostnames that only work on the dev machine — rewrite for LAN clients.
_LOOPBACK_OR_LOCAL_SITE_HOSTS = frozenset(
	{
		"localhost",
		"127.0.0.1",
		"0.0.0.0",
		"::1",
		"development.localhost",
		"learn.localhost",
		"dist.localhost",
		"frontend",
	}
)


def is_loopback_or_local_site_host(host: str | None) -> bool:
	if not host:
		return True
	h = host.lower().strip()
	if h in _LOOPBACK_OR_LOCAL_SITE_HOSTS:
		return True
	return h.endswith(".localhost")


def _is_docker_or_loopback_ip(ip: str) -> bool:
	if not ip or ip.startswith("127."):
		return True
	parts = ip.split(".")
	if len(parts) != 4:
		return True
	try:
		a, b = int(parts[0]), int(parts[1])
	except ValueError:
		return True
	# Docker default bridge 172.17–172.31
	if a == 172 and 16 <= b <= 31:
		return True
	return False


def _candidate_lan_ips() -> list[str]:
	"""Collect local IPv4 addresses, preferring real LAN (192.168.x.x) over Docker bridges."""
	seen: set[str] = set()
	out: list[str] = []

	def add(ip: str | None) -> None:
		ip = (ip or "").strip()
		if not ip or ip in seen or _is_docker_or_loopback_ip(ip):
			return
		seen.add(ip)
		out.append(ip)

	env_ip = (os.environ.get("LAN_IP") or os.environ.get("LIVEKIT_NODE_IP") or "").strip()
	if env_ip:
		add(env_ip)

	try:
		for ip in socket.gethostbyname_ex(socket.gethostname())[2]:
			add(ip)
	except OSError:
		pass

	try:
		import subprocess

		hi = subprocess.check_output(["hostname", "-I"], text=True, timeout=2).strip()
		for ip in hi.split():
			add(ip)
	except Exception:
		pass

	try:
		sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
		try:
			sock.connect(("8.8.8.8", 80))
			add(sock.getsockname()[0])
		finally:
			sock.close()
	except OSError:
		pass

	# Prefer typical home/office LAN ranges first
	def sort_key(ip: str) -> tuple[int, str]:
		if ip.startswith("192.168."):
			return (0, ip)
		if ip.startswith("10."):
			return (1, ip)
		return (2, ip)

	out.sort(key=sort_key)
	return out


def get_primary_lan_ip() -> str | None:
	"""Best-effort LAN IPv4 (e.g. 192.168.1.42). Set env LAN_IP when running inside Docker."""
	candidates = _candidate_lan_ips()
	return candidates[0] if candidates else None


def get_request_host() -> str | None:
	"""Hostname the browser used (no port), or None outside a web request."""
	try:
		if not getattr(frappe.local, "request", None):
			return None
		req = frappe.request
		forwarded = (req.headers.get("X-Forwarded-Host") or "").strip()
		raw = forwarded.split(",")[0].strip() if forwarded else (req.host or "")
		if not raw:
			return None
		return raw.split(":")[0].strip() or None
	except Exception:
		return None


def get_webserver_port() -> int:
	try:
		return int(frappe.conf.get("webserver_port") or 8000)
	except (TypeError, ValueError):
		return 8000


def resolve_client_facing_host(*, fallback: str | None = None) -> str:
	"""Host other devices on the LAN should use to reach this bench."""
	req_host = get_request_host()
	if req_host and not is_loopback_or_local_site_host(req_host):
		return req_host
	lan = get_primary_lan_ip()
	if lan:
		return lan
	return fallback or "development.localhost"


def rewrite_url_host(url: str, new_host: str, *, default_scheme: str | None = None) -> str:
	"""Replace URL hostname with *new_host*; keep port/path unless host was local-only."""
	u = (url or "").strip()
	if not u or not new_host:
		return u
	parsed = urlparse(u if "://" in u else f"{default_scheme or 'http'}://{u}")
	if not parsed.hostname:
		return u
	if not is_loopback_or_local_site_host(parsed.hostname):
		return u
	rebuilt = parsed._replace(netloc=f"{new_host}:{parsed.port}" if parsed.port else new_host)
	return urlunparse(rebuilt)


def public_site_base_url(*, path: str = "") -> str:
	"""HTTP origin for links shared with LAN devices (e.g. http://192.168.1.5:8000)."""
	host = resolve_client_facing_host()
	port = get_webserver_port()
	base = f"http://{host}:{port}"
	p = (path or "").strip()
	if not p:
		return base
	return f"{base}/{p.lstrip('/')}"


def public_livekit_url(settings) -> str:
	"""WebSocket URL browsers should use — rewritten when the site is opened via LAN IP."""
	lk_url = (getattr(settings, "livekit_url", None) or "").strip() or "ws://localhost:7880"
	env_override = (os.environ.get("LIVEKIT_PUBLIC_URL") or "").strip()
	if env_override:
		return env_override

	req_host = get_request_host()
	if req_host and not is_loopback_or_local_site_host(req_host):
		return rewrite_url_host(lk_url, req_host, default_scheme="ws")

	return lk_url


def get_livekit_lan_warnings() -> list[str]:
	"""Hints when the browser opened the site via a LAN IP (WebRTC needs LIVEKIT_NODE_IP)."""
	req_host = get_request_host()
	if not req_host or is_loopback_or_local_site_host(req_host):
		return []
	return [
		f"Voice over LAN requires LiveKit to advertise your host IP. "
		f"On the machine running Docker, run: export LIVEKIT_NODE_IP={req_host} "
		f"then restart the livekit container.",
		f"Browsers on other devices should use ws://{req_host}:7880 "
		f"(auto-rewritten when you open http://{req_host}:{get_webserver_port()}).",
	]


def get_lan_access_info() -> dict[str, Any]:
	"""URLs and hints for opening the demo from phones / other laptops on the same Wi‑Fi."""
	lan_ip = get_primary_lan_ip()
	port = get_webserver_port()
	settings = frappe.get_single("AI Global Settings")
	lk_configured = (settings.livekit_url or "ws://localhost:7880").strip()
	lk_lan = rewrite_url_host(lk_configured, lan_ip or "YOUR_LAN_IP", default_scheme="ws") if lan_ip else lk_configured

	return {
		"lan_ip": lan_ip,
		"web_port": port,
		"site_base_localhost": f"http://development.localhost:{port}",
		"site_base_lan": f"http://{lan_ip}:{port}" if lan_ip else None,
		"support_customer_lan": f"http://{lan_ip}:{port}/support" if lan_ip else None,
		"support_agent_lan": f"http://{lan_ip}:{port}/support/agent" if lan_ip else None,
		"ai_room_lan": f"http://{lan_ip}:{port}/ai-room" if lan_ip else None,
		"livekit_url_configured": lk_configured,
		"livekit_url_lan": lk_lan,
		"livekit_internal_url": (getattr(settings, "livekit_internal_url", None) or "").strip() or None,
		"livekit_node_ip_command": (
			f"export LIVEKIT_NODE_IP={lan_ip} && docker compose restart livekit"
			if lan_ip
			else "export LIVEKIT_NODE_IP=<your-wifi-ip> && docker compose restart livekit"
		),
		"notes": [
			"Open links using the LAN IP from other devices on the same network (not development.localhost).",
			"LiveKit WebSocket is auto-rewritten to the browser host when you open the site via 192.168.x.x.",
			"Ensure Docker publishes ports 8000 and 7880 (and LiveKit UDP 59100–59200) on 0.0.0.0.",
			"REQUIRED for LAN voice: set LIVEKIT_NODE_IP to the host Wi‑Fi IP and restart livekit (see livekit_node_ip_command).",
			"Inside Docker, set env LAN_IP to the host Wi‑Fi IP if demo prep auto-detect shows 172.x.",
		],
	}
