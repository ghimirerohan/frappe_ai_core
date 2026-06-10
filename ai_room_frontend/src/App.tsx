import { useCallback, useEffect, useMemo, useState } from "react";
import AgentConsole from "./components/AgentConsole";
import AnalyticsLayout from "./components/AnalyticsLayout";
import CostDashboard from "./components/CostDashboard";
import { PortalGate } from "./components/PortalGate";
import SessionReview from "./components/SessionReview";
import SessionReviewList from "./components/SessionReviewList";
import VoiceRoom from "./components/VoiceRoom";
import { SupportAppShell } from "./components/layout/SupportAppShell";
import { Button } from "./components/ui/Button";
import { Card } from "./components/ui/Card";
import { canAccessMicrophone, getMicrophoneBlockMessage } from "./lib/mediaAccess";
import { apiGet, apiPost } from "./utils/api";

type AgentTemplateRow = {
	name: string;
	agent_name: string;
	persona_type: string;
	language_mode?: string;
};

const SUPPORT_DEFAULT_TEMPLATE = "eSewa Call Center Agent";

export default function App() {
	const qs = useMemo(() => new URLSearchParams(window.location.search), []);
	const refDoctype = qs.get("ref_doctype") || undefined;
	const refDocname = qs.get("ref_docname") || undefined;
	const templateFromUrl = qs.get("template") || undefined;
	const mode = qs.get("mode") || undefined;

	const path = useMemo(() => window.location.pathname.replace(/\/+$/, ""), []);
	const isAgentRoute = mode === "agent" || /\/agent$/.test(path);
	const isCostRoute = mode === "cost" || /\/cost$/.test(path);
	const isReviewRoute = /\/review$/.test(path);
	const isReviewsListRoute = /\/reviews$/.test(path);
	const isSupportPortal = path === "/support" || path.startsWith("/support");
	const reviewSessionFromUrl = qs.get("session") || undefined;

	const [token, setToken] = useState<string | null>(null);
	const [serverUrl, setServerUrl] = useState<string | null>(null);
	const [roomName, setRoomName] = useState<string | null>(null);
	const [geminiModelLabel, setGeminiModelLabel] = useState<string | null>(null);
	const [geminiModelId, setGeminiModelId] = useState<string | null>(null);
	const [personaType, setPersonaType] = useState<string | null>(null);
	const [conversationId, setConversationId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [mediaBlock, setMediaBlock] = useState<string | null>(() => getMicrophoneBlockMessage());
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
				const rows = await apiGet<AgentTemplateRow[]>("frappe_ai_core.api.session.list_agent_templates");
				if (cancelled) return;
				setTemplates(Array.isArray(rows) ? rows : []);
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

	useEffect(() => {
		setMediaBlock(getMicrophoneBlockMessage());
	}, []);

	const start = useCallback(async () => {
		setError(null);
		setLanWarning(null);
		const micBlock = getMicrophoneBlockMessage();
		if (micBlock) {
			setMediaBlock(micBlock);
			setError(micBlock);
			return;
		}
		setLoading(true);
		try {
			const params: Record<string, string> = {};
			if (refDoctype) params.ref_doctype = refDoctype;
			if (refDocname) params.ref_docname = refDocname;
			const t = selectedTemplateName || templateFromUrl;
			if (t) params.template_name = t;
			const msg = await apiPost<{
				token: string;
				livekit_url: string;
				room_name: string;
				gemini_model_label?: string;
				gemini_model?: string;
				persona_type?: string;
				conversation_id?: string;
				lan_warnings?: string[];
			}>("frappe_ai_core.api.session.get_session_token", params);
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

	const fullPath = path + window.location.search;

	if (isCostRoute) {
		return (
			<PortalGate path={fullPath}>
				<CostDashboard />
			</PortalGate>
		);
	}

	if (isReviewsListRoute) {
		return (
			<PortalGate path={fullPath}>
				<SessionReviewList />
			</PortalGate>
		);
	}

	if (reviewSession || (isReviewRoute && reviewSessionFromUrl)) {
		return (
			<PortalGate path={fullPath}>
				<SessionReview
					sessionName={reviewSession || reviewSessionFromUrl!}
					backHref="/support"
					backLabel="← Back to support"
				/>
			</PortalGate>
		);
	}

	if (isAgentRoute) {
		return (
			<PortalGate path={fullPath}>
				<AgentConsole />
			</PortalGate>
		);
	}

	if (token && serverUrl && roomName) {
		if (!canAccessMicrophone()) {
			return (
				<SupportAppShell>
					<div className="flex flex-1 items-center justify-center p-6">
						<p className="text-red-200 text-center max-w-md leading-relaxed">
							{mediaBlock || getMicrophoneBlockMessage()}
						</p>
					</div>
				</SupportAppShell>
			);
		}
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
					<div className="fixed top-0 left-0 right-0 z-50 px-4 py-2.5 bg-amber-950 border-b border-amber-800 text-amber-200 text-sm">
						{lanWarning}
					</div>
				) : null}
				<VoiceRoom
					token={token}
					serverUrl={serverUrl}
					roomName={roomName}
					isSupportPortal={isSupportPortal}
					onLeave={() => finishCall(isSupportPortal ? roomName : null)}
					showAnalyticsPanel={false}
				/>
			</>
		);
	}

	const selectDisabled = templatesLoading || templates.length === 0;
	const selectedMeta = templates.find((t) => t.name === selectedTemplateName);
	const startDisabled = loading || selectDisabled || !selectedTemplateName;
	const supportName = selectedMeta?.agent_name || "Sewa";

	if (isSupportPortal) {
		return (
			<PortalGate path={fullPath}>
				<SupportAppShell>
					<div className="flex flex-1 items-center justify-center p-6">
						<Card className="w-full max-w-md text-center">
							<p className="text-xs uppercase tracking-widest text-emerald-400/80 mb-2">eSewa customer care</p>
							<h1 className="text-2xl font-semibold text-slate-50 mb-2">{supportName}</h1>
							<p className="text-sm text-slate-400 leading-relaxed mb-6">
								Voice support powered by AI. Get instant answers to common questions, or speak with a
								human agent when you need personal assistance.
							</p>
							{templatesError ? (
								<p className="text-red-300 text-sm mb-4">{templatesError}</p>
							) : null}
							{mediaBlock ? (
								<p className="text-amber-200 text-sm mb-4 text-left leading-relaxed">{mediaBlock}</p>
							) : null}
							<Button variant="primary" size="lg" disabled={startDisabled} onClick={() => void start()}>
								{loading ? "Connecting…" : templatesLoading ? "Loading…" : "Start support call"}
							</Button>
							{error ? <p className="text-red-300 text-sm mt-4">{error}</p> : null}
							<p className="text-xs text-slate-500 mt-6">
								Secure voice channel · Your MPIN and OTP are never requested
							</p>
						</Card>
					</div>
				</SupportAppShell>
			</PortalGate>
		);
	}

	return (
		<PortalGate path={fullPath}>
			<div className="min-h-dvh flex flex-col items-center justify-center p-6 bg-gradient-to-br from-slate-900 to-indigo-950 text-slate-100 font-sans">
				<h1 className="text-xl font-semibold mb-2">AI Voice Room</h1>
				<p className="opacity-85 text-center max-w-md mb-4 text-sm">
					Low-latency voice session via LiveKit and Gemini. Choose a persona, then start.
				</p>
				<label htmlFor="ai-template-select" className="text-xs opacity-90 mb-1 self-stretch max-w-md">
					Persona / agent template
				</label>
				<select
					id="ai-template-select"
					value={selectedTemplateName}
					disabled={selectDisabled}
					onChange={(e) => onSelectTemplate(e.target.value)}
					className="self-stretch max-w-md mb-4 px-3 py-2.5 rounded-xl border border-white/10 bg-slate-900/80 text-slate-100"
				>
					{templatesLoading ? (
						<option value="">Loading templates…</option>
					) : templates.length === 0 ? (
						<option value="">No templates available</option>
					) : (
						templates.map((row) => (
							<option key={row.name} value={row.name}>
								{row.agent_name} ({row.persona_type})
							</option>
						))
					)}
				</select>
				{templatesError ? <p className="text-red-300 text-sm mb-3">{templatesError}</p> : null}
				{mediaBlock ? <p className="text-amber-200 text-sm mb-3 max-w-md">{mediaBlock}</p> : null}
				<Button variant="agent" disabled={startDisabled} onClick={() => void start()}>
					{loading ? "Connecting…" : "Start voice session"}
				</Button>
				{error ? <p className="text-red-300 text-sm mt-4">{error}</p> : null}
			</div>
		</PortalGate>
	);
}
