"use client";

import { useState, useEffect, useCallback } from "react";

function Spinner() {
	return (
		<svg className="animate-spin h-5 w-5 text-muted" viewBox="0 0 24 24" fill="none">
			<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
			<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
		</svg>
	);
}

function EventTypeBadge({ type }: { type: string }) {
	const category = type.split(".")[0];
	const styles: Record<string, string> = {
		agent: "bg-gmail-blue/10 text-gmail-blue ring-1 ring-gmail-blue/20",
		host: "bg-purple-100 text-purple-600 ring-1 ring-purple-200",
		capability: "bg-gmail-yellow/15 text-gmail-yellow ring-1 ring-gmail-yellow/30",
		ciba: "bg-teal-50 text-teal-600 ring-1 ring-teal-200",
	};
	return (
		<span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${styles[category] ?? "bg-gray-100 text-gray-500 ring-1 ring-gray-200"}`}>
			{type}
		</span>
	);
}

interface LogEntry {
	id: number;
	type: string;
	actorId: string | null;
	actorType: string | null;
	agentId: string | null;
	hostId: string | null;
	data: Record<string, unknown> | null;
	createdAt: string;
}

const EVENT_CATEGORIES = [
	{ label: "All", value: "" },
	{ label: "Agent", prefix: "agent." },
	{ label: "Host", prefix: "host." },
	{ label: "Capability", prefix: "capability." },
	{ label: "CIBA", prefix: "ciba." },
];

function formatTimestamp(ts: string) {
	const d = new Date(ts + "Z");
	if (isNaN(d.getTime())) return ts;
	const now = Date.now();
	const diff = now - d.getTime();
	const seconds = Math.floor(diff / 1000);

	if (seconds < 60) return "just now";
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
	if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;

	return d.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

export default function LogsPage() {
	const [logs, setLogs] = useState<LogEntry[]>([]);
	const [total, setTotal] = useState(0);
	const [loading, setLoading] = useState(true);
	const [category, setCategory] = useState("");
	const [page, setPage] = useState(0);
	const [autoRefresh, setAutoRefresh] = useState(false);
	const [expandedLog, setExpandedLog] = useState<number | null>(null);
	const pageSize = 30;

	const fetchLogs = useCallback(async () => {
		try {
			const params = new URLSearchParams({
				limit: String(pageSize),
				offset: String(page * pageSize),
			});
			if (category) params.set("type", category);

			const res = await fetch(`/api/logs?${params}`);
			if (res.ok) {
				const data = await res.json();
				setLogs(data.logs ?? []);
				setTotal(data.total ?? 0);
			}
		} catch {
			/* ignore */
		} finally {
			setLoading(false);
		}
	}, [category, page]);

	useEffect(() => {
		setLoading(true);
		fetchLogs();
	}, [fetchLogs]);

	useEffect(() => {
		if (!autoRefresh) return;
		const interval = setInterval(fetchLogs, 3000);
		return () => clearInterval(interval);
	}, [autoRefresh, fetchLogs]);

	const totalPages = Math.ceil(total / pageSize);

	return (
		<div className="mx-auto w-full max-w-3xl px-6 py-8">
			<div className="flex flex-col gap-6">
				<div className="flex items-start justify-between">
					<div>
						<h1 className="text-[22px] font-normal text-foreground">Event Logs</h1>
						<p className="mt-1 text-sm text-muted">
							Audit trail of agent, host, and capability events.
						</p>
					</div>
					<div className="flex items-center gap-3">
						<button
							onClick={() => setAutoRefresh(!autoRefresh)}
							className={`cursor-pointer flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
								autoRefresh
									? "border-gmail-green/30 text-gmail-green bg-gmail-green/5"
									: "border-border text-muted hover:text-foreground hover:bg-surface"
							}`}
						>
							<span className={`h-1.5 w-1.5 rounded-full ${autoRefresh ? "bg-gmail-green animate-pulse" : "bg-muted/40"}`} />
							{autoRefresh ? "Live" : "Auto-refresh"}
						</button>
						<button
							onClick={() => { setLoading(true); fetchLogs(); }}
							className="cursor-pointer rounded-full border border-border px-3.5 py-1.5 text-xs font-medium text-muted transition-colors hover:text-foreground hover:bg-surface"
						>
							Refresh
						</button>
					</div>
				</div>

				<div className="flex gap-0.5 rounded-full border border-border bg-white p-0.5 shadow-sm">
					{EVENT_CATEGORIES.map((cat) => (
						<button
							key={cat.label}
							onClick={() => { setCategory(cat.prefix ?? ""); setPage(0); }}
							className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
								category === (cat.prefix ?? "")
									? "bg-accent text-white shadow-sm"
									: "text-muted hover:text-foreground hover:bg-surface"
							}`}
						>
							{cat.label}
						</button>
					))}
				</div>

				{loading ? (
					<div className="flex items-center justify-center py-20">
						<Spinner />
					</div>
				) : logs.length === 0 ? (
					<div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16">
						<div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-surface">
							<svg className="h-6 w-6 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
							</svg>
						</div>
						<p className="text-sm font-medium text-foreground">No events yet</p>
						<p className="mt-1 text-xs text-muted">Events will appear here as agents interact with the system.</p>
					</div>
				) : (
					<>
						<div className="flex flex-col gap-1.5">
							{logs.map((log) => {
								const isExpanded = expandedLog === log.id;
								return (
									<button
										key={log.id}
										onClick={() => setExpandedLog(isExpanded ? null : log.id)}
										className="cursor-pointer flex flex-col w-full rounded-2xl border border-border bg-white text-left shadow-sm transition-colors hover:bg-surface"
									>
									<div className="flex items-center gap-3 px-5 py-3">
										<EventTypeBadge type={log.type} />
										<div className="flex-1 min-w-0">
											<div className="flex items-center gap-3">
												{log.data?.capability && (
													<code className="text-xs font-mono text-foreground">{String(log.data.capability)}</code>
												)}
												{log.agentId && (
													<span className="text-xs text-muted truncate">
														agent: <code className="text-foreground">{log.agentId.slice(0, 8)}…</code>
													</span>
												)}
												{log.hostId && (
													<span className="text-xs text-muted truncate">
														host: <code className="text-foreground">{log.hostId.slice(0, 8)}…</code>
													</span>
												)}
												{log.actorId && (
													<span className="text-xs text-muted truncate">
														by <code className="text-foreground">{log.actorId.slice(0, 8)}…</code>
													</span>
												)}
											</div>
											{log.data?.reason && (
												<p className="text-[11px] text-muted italic mt-0.5 truncate">&ldquo;{String(log.data.reason)}&rdquo;</p>
											)}
										</div>
										<span className="text-[11px] text-muted shrink-0">
											{formatTimestamp(log.createdAt)}
										</span>
									</div>
									{isExpanded && log.data && (
										<div className="border-t border-border px-5 py-3">
											<pre className="text-xs font-mono text-muted whitespace-pre-wrap break-all">
												{JSON.stringify(log.data, null, 2)}
											</pre>
										</div>
									)}
									</button>
								);
							})}
						</div>

						{totalPages > 1 && (
							<div className="flex items-center justify-between">
								<p className="text-xs text-muted">{total} total events</p>
								<div className="flex items-center gap-2">
									<button
										onClick={() => setPage(Math.max(0, page - 1))}
										disabled={page === 0}
										className="cursor-pointer rounded-full border border-border px-3.5 py-1.5 text-xs font-medium text-muted transition-colors hover:text-foreground hover:bg-surface disabled:opacity-30 disabled:pointer-events-none"
									>
										Previous
									</button>
									<span className="text-xs text-muted">{page + 1} / {totalPages}</span>
									<button
										onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
										disabled={page >= totalPages - 1}
										className="cursor-pointer rounded-full border border-border px-3.5 py-1.5 text-xs font-medium text-muted transition-colors hover:text-foreground hover:bg-surface disabled:opacity-30 disabled:pointer-events-none"
									>
										Next
									</button>
								</div>
							</div>
						)}
					</>
				)}
			</div>
		</div>
	);
}
