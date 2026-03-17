"use client";

import { useState, useEffect, useCallback } from "react";

function Spinner() {
	return (
		<svg
			className="animate-spin h-4 w-4 text-muted"
			viewBox="0 0 24 24"
			fill="none"
		>
			<circle
				className="opacity-25"
				cx="12"
				cy="12"
				r="10"
				stroke="currentColor"
				strokeWidth="4"
			/>
			<path
				className="opacity-75"
				fill="currentColor"
				d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
			/>
		</svg>
	);
}

function EventTypeBadge({ type }: { type: string }) {
	const category = type.split(".")[0];
	const styles: Record<string, string> = {
		agent: "bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30",
		host: "bg-purple-500/15 text-purple-400 ring-1 ring-purple-500/30",
		capability: "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30",
		ciba: "bg-cyan-500/15 text-cyan-400 ring-1 ring-cyan-500/30",
	};
	return (
		<span
			className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${styles[category] ?? "bg-zinc-500/15 text-zinc-400 ring-1 ring-zinc-500/25"}`}
		>
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
						<h1 className="text-lg font-semibold text-white">
							Event Logs
						</h1>
						<p className="mt-1 text-sm text-muted">
							Audit trail of agent, host, and capability events.
						</p>
					</div>
					<div className="flex items-center gap-3">
						<button
							onClick={() => setAutoRefresh(!autoRefresh)}
							className={`cursor-pointer flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors ${
								autoRefresh
									? "border-emerald-500/30 text-emerald-400"
									: "border-border text-muted hover:text-foreground"
							}`}
						>
							<span
								className={`h-1.5 w-1.5 rounded-full ${autoRefresh ? "bg-emerald-400 animate-pulse" : "bg-muted/50"}`}
							/>
							{autoRefresh ? "Live" : "Auto-refresh"}
						</button>
						<button
							onClick={() => {
								setLoading(true);
								fetchLogs();
							}}
							className="cursor-pointer rounded-md border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
						>
							Refresh
						</button>
					</div>
				</div>

				<div className="flex gap-1 rounded-lg border border-border bg-surface p-1">
					{EVENT_CATEGORIES.map((cat) => (
						<button
							key={cat.label}
							onClick={() => {
								setCategory(cat.prefix ?? "");
								setPage(0);
							}}
							className={`cursor-pointer rounded-md px-3 py-1 text-xs font-medium transition-colors ${
								category === (cat.prefix ?? "")
									? "bg-white text-black"
									: "text-muted hover:text-foreground"
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
					<div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16">
						<svg
							className="h-8 w-8 text-muted/30 mb-3"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={1.5}
								d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
							/>
						</svg>
						<p className="text-sm text-muted">No events yet</p>
						<p className="mt-1 text-xs text-muted/60">
							Events will appear here as agents interact with the
							system.
						</p>
					</div>
				) : (
					<>
						<div className="flex flex-col gap-1">
							{logs.map((log) => {
								const isExpanded = expandedLog === log.id;
								return (
									<button
										key={log.id}
										onClick={() =>
											setExpandedLog(
												isExpanded ? null : log.id,
											)
										}
										className="cursor-pointer flex flex-col w-full rounded-lg border border-border bg-surface text-left transition-colors hover:bg-surface-hover"
									>
										<div className="flex items-center gap-3 px-4 py-2.5">
											<EventTypeBadge type={log.type} />
											<div className="flex-1 min-w-0 flex items-center gap-3">
												{log.agentId && (
													<span className="text-xs text-muted truncate">
														agent:{" "}
														<code className="text-foreground/70">
															{log.agentId.slice(
																0,
																8,
															)}
															…
														</code>
													</span>
												)}
												{log.hostId && (
													<span className="text-xs text-muted truncate">
														host:{" "}
														<code className="text-foreground/70">
															{log.hostId.slice(
																0,
																8,
															)}
															…
														</code>
													</span>
												)}
												{log.actorId && (
													<span className="text-xs text-muted truncate">
														by{" "}
														<code className="text-foreground/70">
															{log.actorId.slice(
																0,
																8,
															)}
															…
														</code>
													</span>
												)}
											</div>
											<span className="text-[11px] text-muted/60 shrink-0">
												{formatTimestamp(log.createdAt)}
											</span>
										</div>
										{isExpanded && log.data && (
											<div className="border-t border-border px-4 py-3">
												<pre className="text-xs font-mono text-foreground/70 whitespace-pre-wrap break-all">
													{JSON.stringify(
														log.data,
														null,
														2,
													)}
												</pre>
											</div>
										)}
									</button>
								);
							})}
						</div>

						{totalPages > 1 && (
							<div className="flex items-center justify-between">
								<p className="text-xs text-muted">
									{total} total events
								</p>
								<div className="flex items-center gap-2">
									<button
										onClick={() =>
											setPage(Math.max(0, page - 1))
										}
										disabled={page === 0}
										className="cursor-pointer rounded-md border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
									>
										Previous
									</button>
									<span className="text-xs text-muted">
										{page + 1} / {totalPages}
									</span>
									<button
										onClick={() =>
											setPage(
												Math.min(
													totalPages - 1,
													page + 1,
												),
											)
										}
										disabled={page >= totalPages - 1}
										className="cursor-pointer rounded-md border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
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
