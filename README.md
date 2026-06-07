# Frappe AI Core

Centralized **AI Voice Engine** for Frappe: LiveKit WebRTC, Gemini Live (native audio), Deepgram transcription, and plug-in hooks for LMS / HR / Support.

## Install

```bash
cd frappe-bench
bench get-app /path/to/frappe_ai_core
bench --site <site> install-app frappe_ai_core
bench pip install -e apps/frappe_ai_core
# Optional MCP bridge for analytics agent:
bench pip install 'livekit-agents[google,mcp]>=1.4.0'
```

Configure **AI Global Settings** (Desk) with API keys and LiveKit URL.

For **Gemini Live Model**, use a documented **Live API** voice id. Default is **`gemini-2.5-flash-native-audio-preview-12-2025`** (matches `livekit-plugins-google`). You can try **`gemini-3.1-flash-live-preview`** if your key accepts it; WebSocket **1007** often means the model id is not valid for your API/SDK combo. Do not put **Flash-Lite** here (text only; use **Judge Model**). Unknown ids normalize to the default.

## Voice agent (worker)

Runs outside Gunicorn. **`FRAPPE_SITE` must be a site where `frappe_ai_core` is installed** (e.g. `learn.localhost`). Using another site (e.g. `development.localhost` without the app) causes SQL errors on `tabAI Session`.

```bash
cd frappe-bench
export LIVEKIT_URL=ws://livekit:7880
export LIVEKIT_API_KEY=devkey
export LIVEKIT_API_SECRET=secret
export FRAPPE_SITE=development.localhost
export FRAPPE_BENCH_ROOT=/workspace/development/frappe-bench
python -m frappe_ai_core.ai_engine.voice_agent dev
```

If `FRAPPE_BENCH_ROOT` is unset or a placeholder like `/path/to/frappe-bench`, the worker infers the bench from the app install path. Start the session in the browser on the **same site** so the LiveKit room name matches an **AI Session** document.

Use the same key/secret as **AI Global Settings** and `resources/livekit.yaml` / `LIVEKIT_KEYS`. Inside the devcontainer, `LIVEKIT_URL` must be `ws://livekit:7880` (not `localhost`).

The worker **changes directory to `sites/`** before connecting to Frappe so log files resolve to `../logs` under your bench (LiveKit job subprocesses otherwise default to a CWD like `/workspace/development` and break with missing `/workspace/logs`).

Docker: use the `voice-agent` service in `compose.yaml`.

### ERPNext analytics agent (MCP)

For **AI Agent Template** persona **Business Analyst** (e.g. **ERPNext Business Analyst**), LiveKit dispatches **`frappe-ai-analytics`** instead of the interview worker. Run a **second** terminal with the same env vars and:

```bash
python -m frappe_ai_core.ai_engine.analytics_agent dev
```

Requires **`livekit-agents[google,mcp]`** (see `pyproject.toml`), **Node 20+** with **`npx`** on the worker host for `@casys/mcp-erpnext`, and **AI Global Settings → ERPNext MCP**: URL, API Key, API Secret (and optional tool categories). The Voice Room shows transcript + status + chart cards when this persona is selected.

**MCP “permission error” (HTTP 403)?** If the voice agent says ERPNext tools failed with `PermissionError` while using an Administrator API key, the credentials are usually fine. `@casys/mcp-erpnext` lists child-table DocTypes (e.g. `Sales Invoice Item`) without Frappe’s required `parent` query param; Frappe then returns 403 for any user. `frappe_ai_core` ships `mcp_compat.py` to infer the parent DocType automatically. Restart `bench start` after upgrading the app. Also set **ERPNext MCP URL** to your real site (e.g. `http://development.localhost:8000`) — typos like `developlemt.localhost` still “work” in some setups but should be corrected.

## Frontend

Build the React SPA:

```bash
cd apps/frappe_ai_core/ai_room_frontend
npm ci && npm run build
bench --site <site> build --app frappe_ai_core
```

**Desk:** open **AI Voice Engine** from the app switcher (or `/app/ai-voice-engine`) for the workspace dashboard.

**Website:** open **`/ai-room`** or **`/ai_room`** after login (same LiveKit SPA, including the LiveKit **Aura** shader visualizer). Use `npm run build` in `ai_room_frontend`, then `bench --site <site> build --app frappe_ai_core` (or restart) so the site serves the latest JS/CSS. Hard-refresh the browser if you still see the old bar visualizer.

If a **Website > Web Page** uses the route `ai-room` with custom HTML, it can override the app page — remove or change that page so `/ai-room` serves the app template.

If the page shows **LiveKit room connected** but **Connecting…** / **Waiting for voice AI** forever, the browser is fine — the **voice agent worker** is not running or cannot reach LiveKit. Start it with the command in **Voice agent (worker)** above (`FRAPPE_SITE` must match your site, e.g. `learn.localhost`).

**First simulation (bank interview, Nepali + English):** after `bench migrate`, an **AI Agent Template** named **Bank Interview Simulation** is created. Open **`/ai-room?template=Bank%20Interview%20Simulation`** or **`/ai_room?template=Bank%20Interview%20Simulation`** (or use the link on the **AI Voice Engine** workspace). Start the **voice agent** worker, then click **Start voice session** in the room.

## eSewa call center demo

One-shot prep (idempotent — knowledge base, **eSewa Call Center Agent** template, demo users, checklist):

```bash
bench --site development.localhost execute frappe_ai_core.demo.esewa_demo_prep.run
```

Start the **voice agent** worker with `FRAPPE_SITE=development.localhost` (see **Voice agent (worker)** above) before starting a call.

### Demo credentials

| Role | Email | Password | Portal |
|------|-------|----------|--------|
| Customer | `esewa.customer@demo.local` | `esewa-demo-customer` | `/support` |
| Human rep | `esewa.rep@demo.local` | `esewa-demo-rep` | `/support/agent` |

**This machine**

- Customer: `http://development.localhost:8000/support`
- Human rep: `http://development.localhost:8000/support/agent`

**Other laptops / phones on the same Wi‑Fi** — use `http://192.168.x.x:8000/support` (not `development.localhost`). See **Same Wi‑Fi / LAN** below.

The rep user gets the **AI Human Agent** role automatically. For post-call review and tokenomics dashboards, log in as **Administrator** or a user with **AI Voice Manager** (`/support/reviews`, `/ai-room/cost`).

**≈5 min demo script:** customer logs in → **Start support call** → ask *“MPIN forgot”* (AI uses KB) → ask for a human → rep logs in on `/support/agent` → **Accept** handoff → live conversation (AI goes quiet).

## LiveKit server

Use Docker `livekit` service or run `setup_livekit.sh` on a bare-metal host.

## Site: `learn.localhost` (LMS + AI)

Example bench site with **Frappe LMS** and **frappe_ai_core**:

```bash
bench new-site learn.localhost --db-root-password <mariadb_root> --admin-password admin \
  --mariadb-user-host-login-scope=% \
  --install-app payments --install-app lms --install-app frappe_ai_core
bench use learn.localhost
```

Add `127.0.0.1 learn.localhost` to your machine’s hosts file if needed.

Voice worker for that site:

```bash
export FRAPPE_SITE=learn.localhost
```

## Where LiveKit runs (Docker / devcontainer)

Your Frappe app runs **inside** the `frappe-1` dev container. **Do not install LiveKit inside that same container** as the primary setup: WebRTC needs stable **published ports** (7880, 7881, UDP range) and a **dedicated process**.

Recommended:

1. **Sibling containers** on the **same Docker network** as `frappe-1`, `redis-queue-1`, and `mariadb-1`. The repo defines `livekit` in **`pwd.yml`** (production-style stack), **`compose.yaml`**, and **`devcontainer-example/docker-compose.yml`** — use the file your devcontainer actually starts; if you only ever run `pwd.yml`, LiveKit must be in **`pwd.yml`** (not only in `compose.yaml`). Optional **`voice-agent`** is in `compose.yaml`; otherwise run the worker manually inside the bench container. LiveKit uses **Redis** (`redis-queue:6379` in `resources/livekit.yaml`).
2. **Your laptop “host”** (Docker Desktop VM): map ports **7880/tcp**, **7881/tcp**, and the **UDP media range** so browsers reach LiveKit. In **AI Global Settings**, set **LiveKit URL (clients)** to what the **browser** uses (e.g. `ws://localhost:7880`). Set **LiveKit URL (server / API)** to what **Frappe inside Docker** uses to call LiveKit’s HTTP API — typically **`ws://livekit:7880`** (Compose service name). If you leave the server URL empty, Frappe uses the client URL for dispatch too, which fails when the client URL is `localhost` (inside the container, localhost is not LiveKit).

So: **Frappe in `frappe-1`**, **LiveKit + voice-agent as separate services** (or on the real Linux host with systemd via `setup_livekit.sh`), all sharing **Redis** and **network** with the stack.

## Same Wi‑Fi / LAN (second laptop, phone)

Other devices cannot resolve `development.localhost`. Use your machine’s **LAN IP** (e.g. `192.168.1.42`).

1. **Ports** — Docker must publish **8000** (Frappe) and **7880** (+ UDP **59100–59200**) on `0.0.0.0` (default in `.devcontainer/docker-compose.yml`).
2. **Open the site via IP** — e.g. `http://192.168.1.42:8000/support` (customer) and `http://192.168.1.42:8000/support/agent` (rep).
3. **LiveKit URL** — when the browser uses a LAN IP, session/handoff APIs **auto-rewrite** `ws://localhost:7880` → `ws://192.168.1.42:7880`. No Desk change needed.
4. **Print URLs** — `bench --site development.localhost execute frappe_ai_core.demo.esewa_demo_prep.run` lists LAN links, or call `frappe_ai_core.api.session.get_lan_access_urls` while logged in.
5. **Voice media across devices** — if WebRTC connects but has no audio, set on the host before starting Compose:
   ```bash
   export LIVEKIT_NODE_IP=192.168.1.42   # your LAN IP (ipconfig / ifconfig on the host)
   export LAN_IP=192.168.1.42            # optional: helps demo prep print correct URLs from inside Docker
   ```
   Then restart the `livekit` container. Optional override: `LIVEKIT_PUBLIC_URL=ws://192.168.1.42:7880`.

`serve_default_site` is already enabled, so any Host header (including a raw IP) serves the default site.

### LAN voice troubleshooting

| Symptom | Fix |
|---------|-----|
| Gemini `1007 invalid argument` in voice worker | Restart the worker after upgrading `frappe_ai_core` (do not pass `language=ne` to Gemini Live native audio — language hints are prompt-only). |
| Room connects but no AI greeting / timeout on LAN | Set **`LIVEKIT_NODE_IP`** to your host Wi‑Fi IP and restart LiveKit (see step 5 above). Without this, WebRTC advertises Docker-internal IPs (172.x) that phones cannot reach. |
| `development.localhost` works, `192.168.x.x` does not | Expected until `LIVEKIT_NODE_IP` is set — localhost uses loopback ICE paths; LAN devices need the real host IP. |

After starting a call from a LAN IP, the session API returns `lan_warnings` with the exact `export LIVEKIT_NODE_IP=…` command.
