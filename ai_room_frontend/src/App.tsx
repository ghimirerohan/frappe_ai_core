import { useCallback, useEffect, useMemo, useState } from "react";
import AgentConsole from "./components/AgentConsole";
import AnalyticsLayout from "./components/AnalyticsLayout";
import CostDashboard from "./components/CostDashboard";
import SessionReview from "./components/SessionReview";
import SessionReviewList from "./components/SessionReviewList";
import VoiceRoom from "./components/VoiceRoom";

declare global {
	interface Window {
		csrf_token?: string;
	}
}

type AgentTemplateRow = {
	name: string;
	agent_name: string;
	persona_type: string;
	language_mode?: string;
};

// Default agent template for the customer support portal (/support). Overridable via ?template=.
const SUPPORT_DEFAULT_TEMPLATE = "eSewa Call Center Agent";

export default function App() {
	const qs = useMemo(() => new URLSearchParams(window.location.search), []);
	const refDoctype = qs.get("ref_doctype") || undefined;
	const refDocname = qs.get("ref_docname") || undefined;
	const templateFromUrl = qs.get("template") || undefined;
	const mode = qs.get("mode") || undefined;

	// Route by pathname so customer and human rep get clean, distinct "portal" URLs:
	//   /support        -> customer starts a support query
	//   /support/agent  -> human rep picks up handoffs (same as ?mode=agent)
	const path = useMemo(() => window.location.pathname.replace(/\/+$/, ""), []);
	const isAgentRoute = mode === "agent" || /\/agent$/.test(path);
	const isCostRoute = mode === "cost" || /\/cost$/.test(path);
	const isReviewRoute = /\/review$/.test(path);
	const isReviewsListRoute = /\/reviews$/.test(path);
	const isSupportPortal = path === "/support" || path.startsWith("/support");
	const agentConsoleHref = isSupportPortal ? "/support/agent" : "/ai-room?mode=agent";
	const reviewSessionFromUrl = qs.get("session") || undefined;

	const [token, setToken] = useState<string | null>(null);
	const [serverUrl, setServerUrl] = useState<string | null>(null);
	const [roomName, setRoomName] = useState<string | null>(null);
	const [geminiModelLabel, setGeminiModelLabel] = useState<string | null>(null);
	const [geminiModelId, setGeminiModelId] = useState<string | null>(null);
	const [personaType, setPersonaType] = useState<string | null>(null);
	const [conversationId, setConversationId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [lanWarning, setLanWarning] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	const [templates, setTemplates] = useState<AgentTemplateRow[]>([]);
	const [templatesLoading, setTemplatesLoading] = useState(true);
	const [templatesError, setTemplatesError] = useState<string | null>(null);
	const [selectedTemplateName, setSelectedTemplateName] = useState<string>("");
	const [reviewSession, setReviewSession] = useState<string | null>(null);

	const finishCall = useCallback(
		(sessionId: string | null) => {
			setToken(null);
			setServerUrl(null);
			setRoomName(null);
			setGeminiModelLabel(null);
			setGeminiModelId(null);
			setPersonaType(null);
			setConversationId(null);
			if (sessionId && isSupportPortal) {
				setReviewSession(sessionId);
				const u = new URL(window.location.href);
				u.pathname = "/support/review";
				u.searchParams.set("session", sessionId);
				window.history.replaceState({}, "", u);
			}
		},
		[isSupportPortal],
	);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			setTemplatesLoading(true);
			setTemplatesError(null);
			try {
				const res = await fetch("/api/method/frappe_ai_core.api.session.list_agent_templates");
				const json = (await res.json()) as { message?: AgentTemplateRow[]; exc?: string };
				if (cancelled) return;
				if (!res.ok || json.exc) {
					setTemplatesError(typeof json.exc === "string" ? json.exc : res.statusText);
					setTemplates([]);
					return;
				}
				const rows = Array.isArray(json.message) ? json.message : [];
				setTemplates(rows);
			} catch (e) {
				if (!cancelled) {
					setTemplatesError(e instanceof Error ? e.message : String(e));
					setTemplates([]);
				}
			} finally {
				if (!cancelled) setTemplatesLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		if (templatesLoading || templates.length === 0 || selectedTemplateName) return;
		const fromUrl = templateFromUrl;
		const validUrl = fromUrl && templates.some((t) => t.name === fromUrl);
		let pick: string;
		if (validUrl) {
			pick = fromUrl!;
		} else if (isSupportPortal && templates.some((t) => t.name === SUPPORT_DEFAULT_TEMPLATE)) {
			pick = SUPPORT_DEFAULT_TEMPLATE;
		} else {
			pick = templates[0]!.name;
		}
		setSelectedTemplateName(pick);
	}, [templatesLoading, templates, templateFromUrl, selectedTemplateName, isSupportPortal]);

	const applyTemplateToUrl = useCallback((name: string) => {
		const u = new URL(window.location.href);
		if (name) u.searchParams.set("template", name);
		else u.searchParams.delete("template");
		window.history.replaceState({}, "", u);
	}, []);

	const onSelectTemplate = useCallback(
		(name: string) => {
			setSelectedTemplateName(name);
			applyTemplateToUrl(name);
		},
		[applyTemplateToUrl],
	);

	const start = useCallback(async () => {
		setError(null);
		setLanWarning(null);
		setLoading(true);
		try {
			const params = new URLSearchParams();
			if (refDoctype) params.set("ref_doctype", refDoctype);
			if (refDocname) params.set("ref_docname", refDocname);
			const t = selectedTemplateName || templateFromUrl;
			if (t) params.set("template_name", t);
			const res = await fetch(
				`/api/method/frappe_ai_core.api.session.get_session_token?${params.toString()}`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"X-Frappe-CSRF-Token": window.csrf_token || "",
					},
				},
			);
			const json = await res.json();
			if (!res.ok || json.exc) {
				throw new Error(json.exc || json.message || res.statusText);
			}
			const msg = json.message;
			setToken(msg.token);
			setServerUrl(msg.livekit_url);
			setRoomName(msg.room_name);
			setGeminiModelLabel(typeof msg.gemini_model_label === "string" ? msg.gemini_model_label : null);
			setGeminiModelId(typeof msg.gemini_model === "string" ? msg.gemini_model : null);
			setPersonaType(typeof msg.persona_type === "string" ? msg.persona_type : null);
			setConversationId(typeof msg.conversation_id === "string" ? msg.conversation_id : null);
			if (Array.isArray(msg.lan_warnings) && msg.lan_warnings.length > 0) {
				setLanWarning(msg.lan_warnings.join(" "));
			}
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setLoading(false);
		}
	}, [refDoctype, refDocname, selectedTemplateName, templateFromUrl]);

	if (isCostRoute) {
		return <CostDashboard />;
	}

	if (isReviewsListRoute) {
		return <SessionReviewList />;
	}

	if (reviewSession || (isReviewRoute && reviewSessionFromUrl)) {
		return (
			<SessionReview
				sessionName={reviewSession || reviewSessionFromUrl!}
				backHref="/support"
				backLabel="← Back to support"
			/>
		);
	}

	if (isAgentRoute) {
		return <AgentConsole />;
	}

	if (token && serverUrl && roomName) {
		if (personaType === "Business Analyst") {
			return (
				<AnalyticsLayout
					token={token}
					serverUrl={serverUrl}
					roomName={roomName}
					conversationId={conversationId}
					geminiModelLabel={geminiModelLabel ?? undefined}
					geminiModelId={geminiModelId ?? undefined}
					onLeave={() => finishCall(roomName)}
				/>
			);
		}
		return (
			<>
				{lanWarning ? (
					<div
						style={{
							position: "fixed",
							top: 0,
							left: 0,
							right: 0,
							zIndex: 50,
							padding: "10px 14px",
							background: "#422006",
							color: "#fde68a",
							fontSize: "0.82rem",
							lineHeight: 1.45,
							borderBottom: "1px solid #92400e",
						}}
					>
						{lanWarning}
					</div>
				) : null}
				<VoiceRoom
					token={token}
					serverUrl={serverUrl}
					roomName={roomName}
					geminiModelLabel={geminiModelLabel ?? undefined}
					geminiModelId={geminiModelId ?? undefined}
					onLeave={() => finishCall(isSupportPortal ? roomName : null)}
					showAnalyticsPanel={false}
				/>
			</>
		);
	}

	const selectDisabled = templatesLoading || templates.length === 0;
	const selectedMeta = templates.find((t) => t.name === selectedTemplateName);
	const startDisabled = loading || selectDisabled || !selectedTemplateName;
	const supportName = selectedMeta?.agent_name || "Customer Support";

	const agentConsoleLink = (
		<a
			href={agentConsoleHref}
			style={{ color: "#a5b4fc", fontSize: "0.8rem", textDecoration: "none", opacity: 0.85 }}
		>
			Support agent? Open the agent console →
		</a>
	);

	if (isSupportPortal) {
		return (
			<div
				style={{
					minHeight: "100dvh",
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					justifyContent: "center",
					padding: "1.5rem",
					fontFamily: "system-ui, sans-serif",
					background: "linear-gradient(160deg, #0f172a, #14532d)",
					color: "#e2e8f0",
				}}
			>
				<div
					style={{
						width: "100%",
						maxWidth: 440,
						textAlign: "center",
						background: "rgba(15, 23, 42, 0.55)",
						border: "1px solid rgba(148, 163, 184, 0.25)",
						borderRadius: 18,
						padding: "2rem 1.5rem",
					}}
				>
					<div style={{ fontSize: "2.25rem", marginBottom: "0.5rem" }}>🎧</div>
					<h1 style={{ fontSize: "1.5rem", margin: "0 0 0.5rem" }}>{supportName}</h1>
					<p style={{ opacity: 0.85, margin: "0 0 1.5rem", lineHeight: 1.5 }}>
						Start a voice call with our support assistant. It can answer common questions instantly and
						connect you to a human agent whenever you need one.
					</p>
					{templatesError ? (
						<p style={{ color: "#fca5a5", marginBottom: "0.75rem", fontSize: "0.9rem" }}>{templatesError}</p>
					) : null}
					<button
						type="button"
						onClick={() => void start()}
						disabled={startDisabled}
						style={{
							padding: "16px 28px",
							fontSize: "1.1rem",
							fontWeight: 600,
							borderRadius: 12,
							border: "none",
							background: "#22c55e",
							color: "#052e16",
							cursor: startDisabled ? "not-allowed" : "pointer",
							width: "100%",
							opacity: startDisabled ? 0.6 : 1,
						}}
					>
						{loading ? "Connecting…" : templatesLoading ? "Loading…" : "Start support call"}
					</button>
					{error ? (
						<p style={{ color: "#fca5a5", marginTop: "1rem", textAlign: "center" }}>{error}</p>
					) : null}
				</div>
				<div style={{ marginTop: "1.25rem", display: "flex", flexDirection: "column", gap: "0.5rem", alignItems: "center" }}>
					{agentConsoleLink}
					<a
						href="/support/reviews"
						style={{ color: "#a5b4fc", fontSize: "0.8rem", textDecoration: "none", opacity: 0.85 }}
					>
						Manager: session reviews & ratings →
					</a>
				</div>
			</div>
		);
	}

	return (
		<div
			style={{
				minHeight: "100dvh",
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				padding: "1.5rem",
				fontFamily: "system-ui, sans-serif",
				background: "linear-gradient(160deg, #0f172a, #1e1b4b)",
				color: "#e2e8f0",
			}}
		>
			<h1 style={{ fontSize: "1.35rem", marginBottom: "0.5rem" }}>AI Voice Room</h1>
			<p style={{ opacity: 0.85, textAlign: "center", maxWidth: 400, marginBottom: "1rem" }}>
				Low-latency voice session via LiveKit and Gemini. Log in on this site, choose an interview persona,
				then start.
			</p>

			<label
				htmlFor="ai-template-select"
				style={{ alignSelf: "stretch", maxWidth: 400, marginBottom: "0.35rem", fontSize: "0.8rem", opacity: 0.9 }}
			>
				Persona / agent template
			</label>
			<select
				id="ai-template-select"
				value={selectedTemplateName}
				disabled={selectDisabled}
				onChange={(e) => onSelectTemplate(e.target.value)}
				style={{
					alignSelf: "stretch",
					maxWidth: 400,
					marginBottom: "0.5rem",
					padding: "10px 12px",
					fontSize: "1rem",
					borderRadius: 10,
					border: "1px solid rgba(148, 163, 184, 0.35)",
					background: "rgba(15, 23, 42, 0.85)",
					color: "#e2e8f0",
					cursor: selectDisabled ? "not-allowed" : "pointer",
				}}
			>
				{templatesLoading ? (
					<option value="">Loading templates…</option>
				) : templates.length === 0 ? (
					<option value="">No templates — create one in AI Agent Template</option>
				) : (
					templates.map((row) => (
						<option key={row.name} value={row.name}>
							{row.agent_name} ({row.persona_type}
							{row.language_mode ? ` · ${row.language_mode}` : ""})
						</option>
					))
				)}
			</select>
			{selectedMeta ? (
				<p style={{ fontSize: "0.8rem", opacity: 0.75, maxWidth: 400, marginBottom: "1rem", textAlign: "center" }}>
					Session uses template <strong>{selectedMeta.agent_name}</strong>
				</p>
			) : null}
			{templatesError ? (
				<p style={{ color: "#fca5a5", marginBottom: "0.75rem", maxWidth: 400, textAlign: "center", fontSize: "0.9rem" }}>
					{templatesError}
				</p>
			) : null}

			<button
				type="button"
				onClick={() => void start()}
				disabled={startDisabled}
				style={{
					padding: "14px 28px",
					fontSize: "1.05rem",
					borderRadius: 12,
					border: "none",
					background: "#6366f1",
					color: "#fff",
					cursor: startDisabled ? "not-allowed" : "pointer",
					minWidth: 200,
					opacity: selectDisabled || !selectedTemplateName ? 0.6 : 1,
				}}
			>
				{loading ? "Connecting…" : "Start voice session"}
			</button>
			{error ? (
				<p style={{ color: "#fca5a5", marginTop: "1rem", maxWidth: 400, textAlign: "center" }}>{error}</p>
			) : null}
			<div style={{ marginTop: "1.5rem" }}>{agentConsoleLink}</div>
		</div>
	);
}
