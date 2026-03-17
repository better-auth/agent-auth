"use client";

import { useCallback, useEffect, useState } from "react";

function StatusBadge({ status }: { status: string }) {
	const styles: Record<string, string> = {
		active: "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30",
		pending: "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30",
		expired: "bg-zinc-500/15 text-zinc-400 ring-1 ring-zinc-500/25",
		revoked: "bg-red-500/15 text-red-400 ring-1 ring-red-500/30",
		rejected: "bg-red-500/15 text-red-400 ring-1 ring-red-500/30",
		claimed: "bg-sky-500/15 text-sky-400 ring-1 ring-sky-500/30",
		denied: "bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/30",
	};
	return (
		<span
			className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium text-[11px] ${styles[status] ?? "bg-zinc-500/15 text-zinc-400 ring-1 ring-zinc-500/25"}`}
		>
			{status}
		</span>
	);
}

function Spinner() {
	return (
		<svg
			className="h-4 w-4 animate-spin text-muted"
			fill="none"
			viewBox="0 0 24 24"
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
				d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
				fill="currentColor"
			/>
		</svg>
	);
}

interface GrantData {
	capability: string;
	expires_at?: string | null;
	granted_by?: string | null;
	status: string;
}

interface AgentData {
	agent_capability_grants: GrantData[];
	agent_id: string;
	created_at: string;
	expires_at: string | null;
	host_id: string;
	last_used_at: string | null;
	mode: string;
	name: string;
	status: string;
}

function timeAgo(date: string | null) {
	if (!date) {
		return "Never";
	}
	const now = Date.now();
	const then = new Date(date).getTime();
	const diff = now - then;
	const seconds = Math.floor(diff / 1000);
	if (seconds < 60) {
		return "just now";
	}
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) {
		return `${minutes}m ago`;
	}
	const hours = Math.floor(minutes / 60);
	if (hours < 24) {
		return `${hours}h ago`;
	}
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

function EventTypeBadge({ type }: { type: string }) {
	const category = type.split(".")[0];
	const styles: Record<string, string> = {
		agent: "bg-sky-500/15 text-sky-400 ring-1 ring-sky-500/30",
		host: "bg-violet-500/15 text-violet-400 ring-1 ring-violet-500/30",
		capability: "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30",
		ciba: "bg-teal-500/15 text-teal-400 ring-1 ring-teal-500/30",
	};
	return (
		<span
			className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium text-[11px] ${styles[category] ?? "bg-zinc-500/15 text-zinc-400 ring-1 ring-zinc-500/25"}`}
		>
			{type}
		</span>
	);
}

interface LogEntry {
	actorId: string | null;
	actorType: string | null;
	agentId: string | null;
	createdAt: string;
	data: Record<string, unknown> | null;
	hostId: string | null;
	id: number;
	type: string;
}

function AgentActivityLog({ agentId }: { agentId: string }) {
	const [logs, setLogs] = useState<LogEntry[]>([]);
	const [loading, setLoading] = useState(true);
	const [expandedLog, setExpandedLog] = useState<number | null>(null);

	const fetchLogs = useCallback(async () => {
		try {
			const params = new URLSearchParams({
				agent_id: agentId,
				limit: "50",
			});
			const res = await fetch(`/api/logs?${params}`);
			if (res.ok) {
				const data = await res.json();
				setLogs(data.logs ?? []);
			}
		} catch {
			/* ignore */
		} finally {
			setLoading(false);
		}
	}, [agentId]);

	useEffect(() => {
		fetchLogs();
	}, [fetchLogs]);

	if (loading) {
		return (
			<div className="flex items-center justify-center py-10">
				<Spinner />
			</div>
		);
	}

	if (logs.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-10">
				<p className="text-muted text-xs">No activity yet</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-1">
			{logs.map((log) => {
				const isExpanded = expandedLog === log.id;
				return (
					<button
						className="flex w-full cursor-pointer flex-col rounded-md border border-border/50 bg-background text-left transition-colors hover:bg-surface-hover"
						key={log.id}
						onClick={() => setExpandedLog(isExpanded ? null : log.id)}
					>
						<div className="flex items-center gap-2 px-3 py-2">
							<EventTypeBadge type={log.type} />
							<span className="flex-1 truncate text-[11px] text-muted">
								{log.data && "capability" in log.data
									? String(log.data.capability)
									: ""}
							</span>
							<span className="shrink-0 text-[11px] text-muted/60">
								{timeAgo(log.createdAt)}
							</span>
						</div>
						{isExpanded && log.data && (
							<div className="border-border/50 border-t px-3 py-2">
								<pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-all font-mono text-[11px] text-foreground/70">
									{JSON.stringify(log.data, null, 2)}
								</pre>
							</div>
						)}
					</button>
				);
			})}
		</div>
	);
}

export default function AgentsPage() {
	const [agents, setAgents] = useState<AgentData[]>([]);
	const [loading, setLoading] = useState(true);
	const [filter, setFilter] = useState("all");
	const [expanded, setExpanded] = useState<string | null>(null);
	const [activeTab, setActiveTab] = useState<
		Record<string, "details" | "activity">
	>({});
	const [revoking, setRevoking] = useState<string | null>(null);

	useEffect(() => {
		setLoading(true);
		const params = filter === "all" ? "" : `?status=${filter}`;
		fetch(`/api/auth/agent/list${params}`)
			.then((r) => (r.ok ? r.json() : { agents: [] }))
			.then((data) => setAgents(data.agents ?? []))
			.catch(() => {})
			.finally(() => setLoading(false));
	}, [filter]);

	const handleRevoke = async (agentId: string) => {
		setRevoking(agentId);
		try {
			const res = await fetch("/api/auth/agent/revoke", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ agent_id: agentId }),
			});
			if (res.ok) {
				setAgents((prev) =>
					prev.map((a) =>
						a.agent_id === agentId ? { ...a, status: "revoked" } : a
					)
				);
			}
		} catch {
			/* ignore */
		} finally {
			setRevoking(null);
		}
	};

	const filters = ["all", "active", "pending", "expired", "revoked"];

	return (
		<div className="mx-auto w-full max-w-3xl px-6 py-8">
			<div className="flex flex-col gap-6">
				<div className="flex items-start justify-between">
					<div>
						<h1 className="font-semibold text-lg text-white">Agents</h1>
						<p className="mt-1 text-muted text-sm">
							Connected AI agents and their capability grants.
						</p>
					</div>
					<div className="flex gap-1 rounded-lg border border-border bg-surface p-1">
						{filters.map((f) => (
							<button
								className={`cursor-pointer rounded-md px-3 py-1 font-medium text-xs capitalize transition-colors ${
									filter === f
										? "bg-white text-black"
										: "text-muted hover:text-foreground"
								}`}
								key={f}
								onClick={() => setFilter(f)}
							>
								{f}
							</button>
						))}
					</div>
				</div>

				{loading ? (
					<div className="flex items-center justify-center py-20">
						<Spinner />
					</div>
				) : agents.length === 0 ? (
					<div className="flex flex-col items-center justify-center rounded-lg border border-border border-dashed py-16">
						<svg
							className="mb-3 h-8 w-8 text-muted/30"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={1.5}
							/>
						</svg>
						<p className="text-muted text-sm">No agents found</p>
						<p className="mt-1 text-muted/60 text-xs">
							Agents will appear here once they connect.
						</p>
					</div>
				) : (
					<div className="flex flex-col gap-2">
						{agents.map((agent) => {
							const isExpanded = expanded === agent.agent_id;
							const activeGrants = agent.agent_capability_grants.filter(
								(g) => g.status === "active"
							);
							const pendingGrants = agent.agent_capability_grants.filter(
								(g) => g.status === "pending"
							);

							return (
								<div
									className="rounded-lg border border-border bg-surface"
									key={agent.agent_id}
								>
									<button
										className="flex w-full cursor-pointer items-center gap-4 px-4 py-3 text-left"
										onClick={() =>
											setExpanded(isExpanded ? null : agent.agent_id)
										}
									>
										<div className="min-w-0 flex-1">
											<div className="flex items-center gap-2">
												<span className="truncate font-medium text-sm text-white">
													{agent.name}
												</span>
												<StatusBadge status={agent.status} />
											</div>
											<p className="mt-0.5 text-muted text-xs">
												{activeGrants.length} active
												{pendingGrants.length > 0 &&
													` · ${pendingGrants.length} pending`}
												{" · "}
												{timeAgo(agent.created_at)}
											</p>
										</div>
										<svg
											className={`h-4 w-4 shrink-0 text-muted transition-transform ${isExpanded ? "rotate-180" : ""}`}
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
										>
											<path
												d="M19 9l-7 7-7-7"
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={2}
											/>
										</svg>
									</button>

									{isExpanded && (
										<div className="border-border border-t">
											<div className="flex gap-0 border-border border-b">
												{(["details", "activity"] as const).map((tab) => (
													<button
														className={`cursor-pointer px-4 py-2 font-medium text-xs capitalize transition-colors ${
															(activeTab[agent.agent_id] ?? "details") === tab
																? "-mb-px border-white border-b-2 text-white"
																: "text-muted hover:text-foreground"
														}`}
														key={tab}
														onClick={(e) => {
															e.stopPropagation();
															setActiveTab((prev) => ({
																...prev,
																[agent.agent_id]: tab,
															}));
														}}
													>
														{tab}
													</button>
												))}
											</div>

											<div className="max-h-80 overflow-y-auto px-4 py-4">
												{(activeTab[agent.agent_id] ?? "details") ===
												"details" ? (
													<>
														<div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-3">
															<div>
																<p className="text-[10px] text-muted uppercase tracking-widest">
																	Agent ID
																</p>
																<code className="break-all font-mono text-foreground text-xs">
																	{agent.agent_id}
																</code>
															</div>
															<div>
																<p className="text-[10px] text-muted uppercase tracking-widest">
																	Host ID
																</p>
																<code className="break-all font-mono text-foreground text-xs">
																	{agent.host_id}
																</code>
															</div>
															<div>
																<p className="text-[10px] text-muted uppercase tracking-widest">
																	Last Used
																</p>
																<p className="text-foreground text-xs">
																	{timeAgo(agent.last_used_at)}
																</p>
															</div>
															<div>
																<p className="text-[10px] text-muted uppercase tracking-widest">
																	Expires
																</p>
																<p className="text-foreground text-xs">
																	{agent.expires_at
																		? new Date(
																				agent.expires_at
																			).toLocaleString()
																		: "Never"}
																</p>
															</div>
														</div>

														{agent.agent_capability_grants.length > 0 && (
															<div className="mb-4">
																<p className="mb-2 text-[10px] text-muted uppercase tracking-widest">
																	Capabilities
																</p>
																<div className="space-y-1">
																	{agent.agent_capability_grants.map((g, i) => (
																		<div
																			className="flex items-center justify-between rounded bg-background px-3 py-2"
																			key={i}
																		>
																			<code className="mr-2 truncate font-mono text-foreground text-xs">
																				{g.capability}
																			</code>
																			<StatusBadge status={g.status} />
																		</div>
																	))}
																</div>
															</div>
														)}

														{agent.status === "active" && (
															<button
																className="cursor-pointer rounded-md border border-red-500/20 px-3 py-1.5 text-red-400 text-xs transition-colors hover:bg-red-500/10 disabled:opacity-50"
																disabled={revoking === agent.agent_id}
																onClick={(e) => {
																	e.stopPropagation();
																	handleRevoke(agent.agent_id);
																}}
															>
																{revoking === agent.agent_id
																	? "Revoking…"
																	: "Revoke Agent"}
															</button>
														)}
													</>
												) : (
													<AgentActivityLog agentId={agent.agent_id} />
												)}
											</div>
										</div>
									)}
								</div>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
}
