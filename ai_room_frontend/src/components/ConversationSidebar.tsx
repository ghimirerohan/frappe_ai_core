import { useCallback, useEffect, useMemo, useState } from "react";

export type ConversationRow = {
	name: string;
	title?: string;
	status?: string;
	message_count?: number;
	last_message_preview?: string;
	last_message_at?: string;
	modified?: string;
	session?: string;
};

export default function ConversationSidebar({
	activeConversationId,
	selectedConversationId,
	onSelectConversation,
	onNewChat,
}: {
	activeConversationId: string | null;
	selectedConversationId: string;
	onSelectConversation: (id: string) => void;
	onNewChat: () => void;
}) {
	const [items, setItems] = useState<ConversationRow[]>([]);
	const [search, setSearch] = useState("");
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const res = await fetch("/api/method/frappe_ai_core.api.session.list_conversations?limit=60");
			const json = (await res.json()) as { message?: ConversationRow[]; exc?: string };
			if (!res.ok || json.exc) {
				throw new Error(typeof json.exc === "string" ? json.exc : res.statusText);
			}
			setItems(Array.isArray(json.message) ? json.message : []);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
			setItems([]);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return items;
		return items.filter(
			(c) =>
				(c.title ?? "").toLowerCase().includes(q) ||
				(c.last_message_preview ?? "").toLowerCase().includes(q) ||
				c.name.toLowerCase().includes(q),
		);
	}, [items, search]);

	return (
		<div className="flex h-full w-[240px] shrink-0 flex-col border-r border-slate-700/50 bg-slate-900/95">
			<div className="border-b border-slate-700/40 p-3">
				<h2 className="text-xs font-semibold uppercase tracking-wider text-indigo-300">Conversations</h2>
				<input
					type="search"
					placeholder="Search…"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					className="mt-2 w-full rounded-lg border border-slate-600/50 bg-slate-950/60 px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-indigo-500/50 focus:outline-none"
				/>
				<button
					type="button"
					onClick={onNewChat}
					className="mt-2 w-full rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-500"
				>
					New chat
				</button>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto p-2">
				{loading ? (
					<p className="px-2 text-xs text-slate-500">Loading…</p>
				) : error ? (
					<p className="px-2 text-xs text-red-400">{error}</p>
				) : filtered.length === 0 ? (
					<p className="px-2 text-xs text-slate-500">No conversations</p>
				) : (
					<ul className="space-y-1">
						{filtered.map((c) => {
							const selected = c.name === selectedConversationId;
							const isLive = c.name === activeConversationId;
							return (
								<li key={c.name}>
									<button
										type="button"
										onClick={() => onSelectConversation(c.name)}
										className={`w-full rounded-lg border px-2.5 py-2 text-left transition ${
											selected
												? "border-indigo-500/50 bg-indigo-950/40"
												: "border-transparent bg-transparent hover:bg-slate-800/60"
										}`}
									>
										<div className="flex items-center gap-1.5">
											<span className="line-clamp-1 text-xs font-medium text-slate-100">
												{c.title || c.name.slice(0, 8)}
											</span>
											{isLive ? (
												<span className="shrink-0 rounded bg-emerald-500/20 px-1 py-0.5 text-[0.55rem] font-semibold uppercase text-emerald-300">
													Live
												</span>
											) : null}
										</div>
										{c.last_message_preview ? (
											<p className="mt-0.5 line-clamp-2 text-[0.65rem] text-slate-500">{c.last_message_preview}</p>
										) : null}
									</button>
								</li>
							);
						})}
					</ul>
				)}
			</div>
		</div>
	);
}
