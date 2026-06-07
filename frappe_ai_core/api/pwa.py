# Copyright (c) 2026, Frappe AI Core and contributors
# For license information, please see license.txt

"""PWA endpoints for the AI Voice Room SPA.

Frappe's StaticPage renderer refuses to serve .js / .json / text files from www/, so the
manifest and service worker are served from whitelisted methods. The service worker response
sets `Service-Worker-Allowed: /` so it can control both portal routes (/support and /ai-room)
even though it is served from /api/method/...; its fetch handler only intercepts those routes
and the SPA asset bundle, so the rest of the site (e.g. /app) is untouched.
"""

from __future__ import annotations

import json

import frappe
from werkzeug.wrappers import Response

_ICON = "/assets/frappe_ai_core/images/frappe-ai-core.svg"
# Customer support portal is the primary install/launch surface.
_START_URL = "/support"
_SCOPE = "/"

_MANIFEST = {
	"name": "Customer Support",
	"short_name": "Support",
	"description": "Talk to the AI support agent and get connected to a human when you need one.",
	"start_url": _START_URL,
	"scope": _SCOPE,
	"display": "standalone",
	"orientation": "portrait",
	"background_color": "#0f172a",
	"theme_color": "#14532d",
	"icons": [
		{"src": _ICON, "sizes": "any", "type": "image/svg+xml", "purpose": "any"},
		{"src": _ICON, "sizes": "any", "type": "image/svg+xml", "purpose": "maskable"},
	],
}

_SERVICE_WORKER = """// AI Voice Room service worker (served by frappe_ai_core.api.pwa.service_worker)
const CACHE = 'ai-voice-room-v2';
const SHELL = ['/support', '/ai-room'];
// Routes this SW is allowed to control; everything else falls through to the network.
const APP_ROUTES = ['/support', '/ai-room', '/ai_room'];

function isAppRoute(pathname) {
  return APP_ROUTES.some((r) => pathname === r || pathname.startsWith(r + '/'));
}
function shellFor(pathname) {
  return pathname.startsWith('/ai-room') || pathname.startsWith('/ai_room') ? '/ai-room' : '/support';
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => undefined)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Never cache LiveKit, websockets, or API calls — they must hit the network.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io')) return;

  // App shell assets: cache-first (hashed Vite bundles are immutable).
  if (url.pathname.startsWith('/assets/frappe_ai_core/ai_room/')) {
    event.respondWith(
      caches.open(CACHE).then((cache) =>
        cache.match(req).then((hit) => hit || fetch(req).then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        }))
      )
    );
    return;
  }

  // SPA navigation (only our portal routes): network-first, fall back to cached shell when offline.
  if (req.mode === 'navigate' && isAppRoute(url.pathname)) {
    const shell = shellFor(url.pathname);
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(shell, copy)).catch(() => undefined);
        return res;
      }).catch(() => caches.match(shell))
    );
  }
});
"""


@frappe.whitelist(allow_guest=True)
def manifest() -> Response:
	resp = Response(json.dumps(_MANIFEST), content_type="application/manifest+json")
	resp.headers["Cache-Control"] = "public, max-age=3600"
	return resp


@frappe.whitelist(allow_guest=True)
def service_worker() -> Response:
	resp = Response(_SERVICE_WORKER, content_type="application/javascript")
	resp.headers["Service-Worker-Allowed"] = _SCOPE
	resp.headers["Cache-Control"] = "no-cache"
	return resp
