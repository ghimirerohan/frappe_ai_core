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
_SCOPE = "/"

_MANIFEST_CUSTOMER = {
	"name": "eSewa Support",
	"short_name": "Support",
	"description": "Talk to the eSewa support assistant and get connected to a human when you need one.",
	"start_url": "/support",
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

_MANIFEST_AGENT = {
	"name": "eSewa Agent Console",
	"short_name": "Agent",
	"description": "Human agent console for eSewa voice support handoffs.",
	"start_url": "/support/agent",
	"scope": _SCOPE,
	"display": "standalone",
	"orientation": "portrait",
	"background_color": "#0f172a",
	"theme_color": "#1e3a5f",
	"icons": [
		{"src": _ICON, "sizes": "any", "type": "image/svg+xml", "purpose": "any"},
		{"src": _ICON, "sizes": "any", "type": "image/svg+xml", "purpose": "maskable"},
	],
}

_MANIFEST_INTERVIEW = {
	"name": "Interview Practice",
	"short_name": "Interview",
	"description": "Practice voice interviews with an AI interviewer and get instant feedback.",
	"start_url": "/interview",
	"scope": _SCOPE,
	"display": "standalone",
	"orientation": "portrait",
	"background_color": "#0f172a",
	"theme_color": "#312e81",
	"icons": [
		{"src": _ICON, "sizes": "any", "type": "image/svg+xml", "purpose": "any"},
		{"src": _ICON, "sizes": "any", "type": "image/svg+xml", "purpose": "maskable"},
	],
}

_SERVICE_WORKER = """// AI Voice Room service worker (served by frappe_ai_core.api.pwa.service_worker)
const CACHE = 'ai-voice-room-v5';
const SHELL = ['/support', '/support/agent', '/interview', '/ai-room'];
const APP_ROUTES = ['/support', '/interview', '/ai-room', '/ai_room'];

function isAppRoute(pathname) {
  return APP_ROUTES.some((r) => pathname === r || pathname.startsWith(r + '/'));
}
function shellFor(pathname) {
  if (pathname.startsWith('/support/agent')) return '/support/agent';
  if (pathname.startsWith('/interview')) return '/interview';
  if (pathname.startsWith('/ai-room') || pathname.startsWith('/ai_room')) return '/ai-room';
  return '/support';
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
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io')) return;

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

// Handoff notification relay: tapping the notification focuses an open agent
// console (and tells it which handoff to confirm) or opens a fresh one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const url = data.url || '/support/agent';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const win of wins) {
        try {
          if (new URL(win.url).pathname.startsWith('/support/agent')) {
            win.postMessage({ type: 'handoff-notification-click', handoff: data.handoff || null });
            return win.focus();
          }
        } catch (e) { /* ignore */ }
      }
      return self.clients.openWindow(url);
    })
  );
});
"""


@frappe.whitelist(allow_guest=True)
def manifest() -> Response:
	resp = Response(json.dumps(_MANIFEST_CUSTOMER), content_type="application/manifest+json")
	resp.headers["Cache-Control"] = "public, max-age=3600"
	return resp


@frappe.whitelist(allow_guest=True)
def manifest_agent() -> Response:
	resp = Response(json.dumps(_MANIFEST_AGENT), content_type="application/manifest+json")
	resp.headers["Cache-Control"] = "public, max-age=3600"
	return resp


@frappe.whitelist(allow_guest=True)
def manifest_interview() -> Response:
	resp = Response(json.dumps(_MANIFEST_INTERVIEW), content_type="application/manifest+json")
	resp.headers["Cache-Control"] = "public, max-age=3600"
	return resp


@frappe.whitelist(allow_guest=True)
def service_worker() -> Response:
	resp = Response(_SERVICE_WORKER, content_type="application/javascript")
	resp.headers["Service-Worker-Allowed"] = _SCOPE
	resp.headers["Cache-Control"] = "no-cache"
	return resp
