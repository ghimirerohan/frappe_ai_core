import { useCallback, useEffect, useMemo, useState } from "react";
import AgentConsole from "./components/AgentConsole";
import AnalyticsLayout from "./components/AnalyticsLayout";
import CostDashboard from "./components/CostDashboard";
import { PortalGate } from "./components/PortalGate";
import SessionReview from "./components/SessionReview";
import SessionReviewList from "./components/SessionReviewList";
import VoiceRoom from "./components/VoiceRoom";
import { InterviewAppShell } from "./components/layout/InterviewAppShell";
import { SupportAppShell } from "./components/layout/SupportAppShell";
import { Button } from "./components/ui/Button";
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
	const isInterviewPortal = path === "/interview" || path.startsWith("/interview");
	const isSupportPortal = !isInterviewPortal && (path === "/support" || path.startsWith("/support"));
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
			if (sessionId && (isSupportPortal || isInterviewPortal)) {
				setReviewSession(sessionId);
				const u = new URL(window.location.href);
				u.pathname = isInterviewPortal ? "/interview/review" : "/support/review";
				u.searchParams.set("session", sessionId);
				window.history.replaceState({}, "", u);
			}
		},
		[isSupportPortal, isInterviewPortal],
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
		} else if (isInterviewPortal) {
			// Interview portal: the candidate picks a role explicitly — never auto-select.
			return;
		} else if (isSupportPortal && templates.some((t) => t.name === SUPPORT_DEFAULT_TEMPLATE)) {
			pick = SUPPORT_DEFAULT_TEMPLATE;
		} else {
			pick = templates[0]!.name;
		}
		setSelectedTemplateName(pick);
	}, [templatesLoading, templates, templateFromUrl, selectedTemplateName, isSupportPortal, isInterviewPortal]);

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
			}>("frappe_ai_core.api.session.get_session_token", params);
			setToken(msg.token);
			setServerUrl(msg.livekit_url);
			setRoomName(msg.room_name);
			setGeminiModelLabel(typeof msg.gemini_model_label === "string" ? msg.gemini_model_label : null);
			setGeminiModelId(typeof msg.gemini_model === "string" ? msg.gemini_model : null);
			setPersonaType(typeof msg.persona_type === "string" ? msg.persona_type : null);
			setConversationId(typeof msg.conversation_id === "string" ? msg.conversation_id : null);
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
					backHref={isInterviewPortal ? "/interview" : "/support"}
					backLabel={isInterviewPortal ? "← Back to interviews" : "← Back to support"}
					heading={isInterviewPortal ? "Your interview feedback" : "Call summary"}
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
			const BlockShell = isInterviewPortal ? InterviewAppShell : SupportAppShell;
			return (
				<BlockShell>
					<div className="flex flex-1 items-center justify-center p-6">
						<p className="text-red-200 text-center max-w-md leading-relaxed">
							{mediaBlock || getMicrophoneBlockMessage()}
						</p>
					</div>
				</BlockShell>
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
		const activeMeta = templates.find((t) => t.name === selectedTemplateName);
		return (
			<VoiceRoom
				token={token}
				serverUrl={serverUrl}
				roomName={roomName}
				variant={isInterviewPortal ? "interview" : isSupportPortal ? "support" : "plain"}
				assistantName={activeMeta?.agent_name || (isInterviewPortal ? "Interviewer" : "Sewa")}
				onLeave={() => finishCall(isSupportPortal || isInterviewPortal ? roomName : null)}
				showAnalyticsPanel={false}
			/>
		);
	}

	const selectDisabled = templatesLoading || templates.length === 0;
	const selectedMeta = templates.find((t) => t.name === selectedTemplateName);
	const startDisabled = loading || selectDisabled || !selectedTemplateName;
	const supportName = selectedMeta?.agent_name || "Sewa";

	if (isInterviewPortal) {
		const roles = templates.filter((t) => t.persona_type === "Interviewer");
		const canBegin = !loading && !templatesLoading && Boolean(selectedTemplateName);
		return (
			<PortalGate path={fullPath}>
				<InterviewAppShell>
					<div className="flex flex-1 flex-col items-center px-6 pb-10 pt-6">
						<div className="w-full max-w-md">
							<h1 className="text-[1.55rem] font-semibold leading-tight text-slate-50">
								Ready to practice?
							</h1>
							<p className="mt-2 text-sm leading-relaxed text-slate-400">
								Pick a role, talk through a real interview, and get your feedback the moment you finish.
							</p>

							{templatesError ? <p className="mt-5 text-sm text-red-300">{templatesError}</p> : null}
							{mediaBlock ? (
								<p className="mt-5 text-sm leading-relaxed text-amber-200">{mediaBlock}</p>
							) : null}

							<div className="mt-7 space-y-3" role="radiogroup" aria-label="Interview role">
								{templatesLoading ? (
									<div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 text-sm text-slate-400">
										Loading roles…
									</div>
								) : roles.length === 0 ? (
									<div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 text-sm text-slate-400">
										No interviews are available right now — please check back soon.
									</div>
								) : (
									roles.map((r) => {
										const selected = r.name === selectedTemplateName;
										return (
											<button
												key={r.name}
												type="button"
												role="radio"
												aria-checked={selected}
												onClick={() => onSelectTemplate(r.name)}
												className={`flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-all ${
													selected
														? "border-indigo-400/60 bg-indigo-500/10"
														: "border-white/[0.07] bg-white/[0.03] hover:border-white/20"
												}`}
											>
												<span
													className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-semibold ${
														selected ? "bg-indigo-500/25 text-indigo-200" : "bg-white/[0.06] text-slate-300"
													}`}
												>
													{(r.agent_name || "?").charAt(0).toUpperCase()}
												</span>
												<span className="min-w-0 flex-1">
													<span className="block truncate font-medium text-slate-100">{r.agent_name}</span>
													{r.language_mode ? (
														<span className="mt-0.5 block text-xs text-slate-400">{r.language_mode}</span>
													) : null}
												</span>
												<span
													className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
														selected ? "border-indigo-400 bg-indigo-500" : "border-slate-600"
													}`}
												>
													{selected ? (
														<svg className="h-3 w-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
															<polyline points="20 6 9 17 4 12" />
														</svg>
													) : null}
												</span>
											</button>
										);
									})
								)}
							</div>

							{roles.length > 0 ? (
								<Button
									variant="interview"
									size="lg"
									className="mt-8"
									disabled={!canBegin}
									onClick={() => void start()}
								>
									{loading ? "Connecting…" : "Begin interview"}
								</Button>
							) : null}
							{error ? <p className="mt-4 text-center text-sm text-red-300">{error}</p> : null}
							<p className="mt-8 text-center text-xs leading-relaxed text-slate-500">
								Voice only · Takes 10–15 minutes · You'll see your evaluation right after
							</p>
						</div>
					</div>
				</InterviewAppShell>
			</PortalGate>
		);
	}

	if (isSupportPortal) {
		return (
			<PortalGate path={fullPath}>
				<SupportAppShell>
					<div className="flex flex-1 flex-col items-center justify-center px-6 pb-10 text-center">
						<div className="w-full max-w-sm">
							<h1 className="text-[1.65rem] font-semibold leading-tight text-slate-50">
								Hi — how can we help?
							</h1>
							<p className="mt-3 text-sm leading-relaxed text-slate-400">
								Start a call and {supportName} will help you right away. If you'd rather talk to a
								person, just say so — we'll bring one onto the same call.
							</p>

							{templatesError ? <p className="mt-5 text-sm text-red-300">{templatesError}</p> : null}
							{mediaBlock ? (
								<p className="mt-5 text-left text-sm leading-relaxed text-amber-200">{mediaBlock}</p>
							) : null}

							<button
								type="button"
								disabled={startDisabled}
								onClick={() => void start()}
								aria-label="Start support call"
								className="group mx-auto mt-10 flex h-24 w-24 items-center justify-center rounded-full bg-emerald-500 text-emerald-950 shadow-lg shadow-emerald-500/25 transition-all hover:bg-emerald-400 hover:shadow-emerald-400/30 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-500/40 disabled:pointer-events-none disabled:opacity-40"
							>
								{loading || templatesLoading ? (
									<span className="h-7 w-7 animate-spin rounded-full border-[3px] border-emerald-900/30 border-t-emerald-950" />
								) : (
									<svg className="h-9 w-9" viewBox="0 0 24 24" fill="currentColor">
										<path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.61 21 3 13.39 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1.02l-2.2 2.2z" />
									</svg>
								)}
							</button>
							<p className="mt-4 text-sm font-medium text-slate-300">
								{loading ? "Connecting…" : "Tap to call"}
							</p>

							{error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}

							<p className="mt-10 text-xs leading-relaxed text-slate-500">
								Free in-app call · We will never ask for your MPIN or OTP
							</p>
						</div>
					</div>
				</SupportAppShell>
			</PortalGate>
		);
	}

	return (
		<PortalGate path={fullPath}>
			<div className="min-h-dvh flex flex-col items-center justify-center p-6 bg-slate-950 text-slate-100 font-sans">
				<h1 className="text-xl font-semibold mb-2">Voice Room</h1>
				<p className="opacity-85 text-center max-w-md mb-4 text-sm">
					Choose who you'd like to talk to, then start the conversation.
				</p>
				<label htmlFor="ai-template-select" className="text-xs opacity-90 mb-1 self-stretch max-w-md">
					Assistant
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
					{loading ? "Connecting…" : "Start conversation"}
				</Button>
				{error ? <p className="text-red-300 text-sm mt-4">{error}</p> : null}
			</div>
		</PortalGate>
	);
}
