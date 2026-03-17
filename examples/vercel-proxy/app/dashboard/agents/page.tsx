"use client";

import { useState, useEffect, useCallback } from "react";

const statusColors: Record<string, { dot: string; bg: string; text: string; ring: string; accent: string }> = {
	active: { dot: "bg-emerald-400", bg: "bg-emerald-500/10", text: "text-emerald-400", ring: "ring-emerald-500/20", accent: "border-l-emerald-500" },
	pending: { dot: "bg-amber-400", bg: "bg-amber-500/10", text: "text-amber-400", ring: "ring-amber-500/20", accent: "border-l-amber-500" },
	expired: { dot: "bg-zinc-500", bg: "bg-zinc-500/10", text: "text-zinc-400", ring: "ring-zinc-500/20", accent: "border-l-zinc-500" },
	revoked: { dot: "bg-red-400", bg: "bg-red-500/10", text: "text-red-400", ring: "ring-red-500/20", accent: "border-l-red-500" },
	rejected: { dot: "bg-red-400", bg: "bg-red-500/10", text: "text-red-400", ring: "ring-red-500/20", accent: "border-l-red-500" },
	claimed: { dot: "bg-sky-400", bg: "bg-sky-500/10", text: "text-sky-400", ring: "ring-sky-500/20", accent: "border-l-sky-500" },
	denied: { dot: "bg-rose-400", bg: "bg-rose-500/10", text: "text-rose-400", ring: "ring-rose-500/20", accent: "border-l-rose-500" },
};

const defaultStatusColor = { dot: "bg-zinc-500", bg: "bg-zinc-500/10", text: "text-zinc-400", ring: "ring-zinc-500/20", accent: "border-l-zinc-500" };

function StatusBadge({ status }: { status: string }) {
	const c = statusColors[status] ?? defaultStatusColor;
	return (
		<span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ${c.bg} ${c.text} ${c.ring}`}>
			<span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
			{status}
		</span>
	);
}

function Spinner() {
	return (
		<svg className="animate-spin h-4 w-4 text-muted" viewBox="0 0 24 24" fill="none">
			<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
			<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
		</svg>
	);
}

function AgentIcon({ name, status }: { name: string; status: string }) {
	const c = statusColors[status] ?? defaultStatusColor;
	return (
		<div className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${c.bg} ring-1 ${c.ring}`}>
			<svg className={`h-4 w-4 ${c.text}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
				<path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
			</svg>
		</div>
	);
}

interface GrantData {
	capability: string;
	status: string;
	granted_by?: string | null;
	expires_at?: string | null;
	constraints?: Record<string, unknown> | null;
}

interface AgentData {
	agent_id: string;
	name: string;
	status: string;
	mode: string;
	host_id: string;
	agent_capability_grants: GrantData[];
	created_at: string;
	last_used_at: string | null;
	expires_at: string | null;
}

function timeAgo(date: string | null) {
	if (!date) return "Never";
	const now = Date.now();
	const then = new Date(date).getTime();
	const diff = now - then;
	const seconds = Math.floor(diff / 1000);
	if (seconds < 60) return "just now";
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

const eventCategoryColors: Record<string, { dot: string; bg: string; text: string; ring: string }> = {
	agent: { dot: "bg-sky-400", bg: "bg-sky-500/10", text: "text-sky-400", ring: "ring-sky-500/20" },
	host: { dot: "bg-violet-400", bg: "bg-violet-500/10", text: "text-violet-400", ring: "ring-violet-500/20" },
	capability: { dot: "bg-amber-400", bg: "bg-amber-500/10", text: "text-amber-400", ring: "ring-amber-500/20" },
	ciba: { dot: "bg-teal-400", bg: "bg-teal-500/10", text: "text-teal-400", ring: "ring-teal-500/20" },
};

const defaultEventColor = { dot: "bg-zinc-500", bg: "bg-zinc-500/10", text: "text-zinc-400", ring: "ring-zinc-500/20" };

function EventTypeBadge({ type }: { type: string }) {
	const category = type.split(".")[0];
	const c = eventCategoryColors[category] ?? defaultEventColor;
	return (
		<span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${c.bg} ${c.text} ${c.ring}`}>
			<span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
			{type}
		</span>
	);
}

function formatEventMessage(log: LogEntry): string {
	const action = log.type.split(".").pop() ?? log.type;
	const capability = log.data && "capability" in log.data ? String(log.data.capability) : null;

	const messages: Record<string, string> = {
		registered: "Agent registered",
		connected: "Connected to host",
		revoked: "Agent access revoked",
		granted: capability ? `Granted "${capability}"` : "Capability granted",
		requested: capability ? `Requested "${capability}"` : "Capability requested",
		executed: capability ? `Executed "${capability}"` : "Capability executed",
		denied: capability ? `Denied "${capability}"` : "Capability denied",
		approved: capability ? `Approved "${capability}"` : "Capability approved",
	};

	return messages[action] ?? log.type.replace(/\./g, " ");
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

function AgentActivityLog({ agentId }: { agentId: string }) {
	const [logs, setLogs] = useState<LogEntry[]>([]);
	const [loading, setLoading] = useState(true);
	const [expandedLog, setExpandedLog] = useState<number | null>(null);

	const fetchLogs = useCallback(async () => {
		try {
			const params = new URLSearchParams({ agent_id: agentId, limit: "50" });
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
				<div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800/50 ring-1 ring-zinc-700/50">
					<svg className="h-4.5 w-4.5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
						<path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
				</div>
				<p className="text-xs text-muted">No activity recorded yet</p>
			</div>
		);
	}

	return (
		<div className="relative flex flex-col">
			<div className="absolute left-[15px] top-2 bottom-2 w-px bg-border/60" />
			{logs.map((log, i) => {
				const isExpanded = expandedLog === log.id;
				const category = log.type.split(".")[0];
				const c = eventCategoryColors[category] ?? defaultEventColor;
				return (
					<button
						key={log.id}
						onClick={() => setExpandedLog(isExpanded ? null : log.id)}
						className="cursor-pointer relative flex w-full text-left group"
					>
						<div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center">
							<span className={`h-2.5 w-2.5 rounded-full ring-[3px] ring-surface ${c.dot} transition-transform group-hover:scale-125`} />
						</div>
						<div className={`flex-1 ml-1 mb-1.5 rounded-lg border border-transparent transition-colors ${isExpanded ? "bg-white/3 border-border/50" : "group-hover:bg-white/2"}`}>
							<div className="flex items-center gap-2 px-3 py-2">
								<span className="flex-1 text-[12px] text-foreground/80">
									{formatEventMessage(log)}
								</span>
								<span className="text-[11px] text-muted/50 shrink-0 tabular-nums">
									{timeAgo(log.createdAt)}
								</span>
							</div>
							{isExpanded && log.data && (
								<div className="border-t border-border/30 px-3 py-2.5">
									<pre className="text-[11px] font-mono text-foreground/50 whitespace-pre-wrap break-all max-h-40 overflow-y-auto leading-relaxed">
										{JSON.stringify(log.data, null, 2)}
									</pre>
								</div>
							)}
						</div>
					</button>
				);
			})}
		</div>
	);
}

function MetaItem({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex flex-col gap-1 rounded-lg bg-white/3 px-3.5 py-2.5 ring-1 ring-white/4">
			<span className="text-[10px] uppercase tracking-wider text-muted/70 font-medium">{label}</span>
			<div className="text-[13px] text-foreground/90">{children}</div>
		</div>
	);
}

function formatConstraintValue(value: unknown): string {
	if (typeof value === "object" && value !== null && !Array.isArray(value)) {
		return Object.entries(value as Record<string, unknown>)
			.map(([op, v]) => `${op}=${JSON.stringify(v)}`)
			.join(", ");
	}
	return JSON.stringify(value);
}

function CapabilityRow({ grant }: { grant: GrantData }) {
	const c = statusColors[grant.status] ?? defaultStatusColor;
	const hasConstraints = grant.constraints && Object.keys(grant.constraints).length > 0;
	return (
		<div className="rounded-lg bg-white/3 px-3.5 py-2.5 ring-1 ring-white/4 group transition-colors hover:bg-white/5">
			<div className="flex items-center gap-3">
				<div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${c.bg}`}>
					<svg className={`h-3 w-3 ${c.text}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
						<path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
					</svg>
				</div>
				<code className="flex-1 text-[12px] font-mono text-foreground/80 truncate">{grant.capability}</code>
				<StatusBadge status={grant.status} />
			</div>
			{hasConstraints && (
				<div className="mt-1.5 ml-9 flex flex-wrap gap-1">
					{Object.entries(grant.constraints!).map(([field, value]) => (
						<span
							key={field}
							className="inline-flex items-center rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-mono text-blue-300 ring-1 ring-blue-500/20"
						>
							{field}: {formatConstraintValue(value)}
						</span>
					))}
				</div>
			)}
		</div>
	);
}

export default function AgentsPage() {
	const [agents, setAgents] = useState<AgentData[]>([]);
	const [loading, setLoading] = useState(true);
	const [filter, setFilter] = useState("active");
	const [expanded, setExpanded] = useState<string | null>(null);
	const [activeTab, setActiveTab] = useState<Record<string, "details" | "activity">>({});
	const [revoking, setRevoking] = useState<string | null>(null);
	const [editingAgent, setEditingAgent] = useState<string | null>(null);
	const [availableCaps, setAvailableCaps] = useState<{ name: string; description: string }[]>([]);
	const [selectedCaps, setSelectedCaps] = useState<Set<string>>(new Set());
	const [savingCaps, setSavingCaps] = useState(false);
	const [loadingCaps, setLoadingCaps] = useState(false);

	const startEditingCaps = async (agent: AgentData) => {
		setEditingAgent(agent.agent_id);
		setLoadingCaps(true);
		const activeGrants = new Set(
			agent.agent_capability_grants.filter((g) => g.status === "active").map((g) => g.capability),
		);
		setSelectedCaps(activeGrants);
		try {
			const res = await fetch("/api/auth/capability/list?limit=500");
			if (res.ok) {
				const data = await res.json();
				setAvailableCaps(data.capabilities ?? []);
			}
		} catch { /* ignore */ }
		setLoadingCaps(false);
	};

	const saveCaps = async (agentId: string) => {
		setSavingCaps(true);
		const agent = agents.find((a) => a.agent_id === agentId);
		const currentActive = new Set(
			agent?.agent_capability_grants.filter((g) => g.status === "active").map((g) => g.capability) ?? [],
		);
		const toGrant = [...selectedCaps].filter((c) => !currentActive.has(c));
		try {
			if (toGrant.length > 0) {
				await fetch("/api/auth/agent/grant-capability", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ agent_id: agentId, capabilities: toGrant }),
				});
			}
			const params = filter !== "all" ? `?status=${filter}` : "";
			const listRes = await fetch(`/api/auth/agent/list${params}`);
			if (listRes.ok) {
				const data = await listRes.json();
				setAgents(data.agents ?? []);
			}
		} catch { /* ignore */ }
		setSavingCaps(false);
		setEditingAgent(null);
	};

	useEffect(() => {
		setLoading(true);
		const params = filter !== "all" ? `?status=${filter}` : "";
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
						a.agent_id === agentId ? { ...a, status: "revoked" } : a,
					),
				);
			}
		} catch {
			/* ignore */
		} finally {
			setRevoking(null);
		}
	};

	const filters = ["all", "active", "pending", "rejected", "expired", "revoked"];
	const filteredCount = agents.length;

	return (
		<div className="mx-auto w-full max-w-3xl px-6 py-8">
			<div className="flex flex-col gap-6">
				<div className="flex items-start justify-between">
					<div>
						<h1 className="text-lg font-semibold text-white tracking-tight">Agents</h1>
						<p className="mt-1 text-sm text-muted">
							{loading ? "Loading agents..." : `${filteredCount} agent${filteredCount !== 1 ? "s" : ""} connected`}
						</p>
					</div>
					<div className="flex gap-0.5 rounded-lg border border-border bg-surface p-0.5">
						{filters.map((f) => (
							<button
								key={f}
								onClick={() => setFilter(f)}
								className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-all ${
									filter === f
										? "bg-white text-black shadow-sm"
										: "text-muted hover:text-foreground hover:bg-white/4"
								}`}
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
					<div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 py-20">
						<div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800/50 ring-1 ring-zinc-700/50">
							<svg className="h-5 w-5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
								<path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
							</svg>
						</div>
						<p className="text-sm font-medium text-foreground/80">No agents found</p>
						<p className="mt-1.5 text-xs text-muted/60">Agents will appear here once they connect.</p>
					</div>
				) : (
					<div className="flex flex-col gap-2">
						{agents.map((agent) => {
							const isExpanded = expanded === agent.agent_id;
							const activeGrants = agent.agent_capability_grants.filter((g) => g.status === "active");
							const pendingGrants = agent.agent_capability_grants.filter((g) => g.status === "pending");
							const sc = statusColors[agent.status] ?? defaultStatusColor;

							return (
								<div
									key={agent.agent_id}
									className={`rounded-xl border border-border/70 bg-surface transition-all ${isExpanded ? "ring-1 ring-white/6" : "hover:border-border"}`}
								>
									<button
										onClick={() => setExpanded(isExpanded ? null : agent.agent_id)}
										className="flex w-full cursor-pointer items-center gap-3.5 px-4 py-3.5 text-left"
									>
										<AgentIcon name={agent.name} status={agent.status} />
										<div className="flex-1 min-w-0">
											<div className="flex items-center gap-2.5">
												<span className="text-[13px] font-medium text-white truncate">{agent.name}</span>
												<StatusBadge status={agent.status} />
												{agent.mode && (
													<span className="hidden sm:inline-flex rounded-md bg-white/4 px-2 py-0.5 text-[10px] font-medium text-muted/70 ring-1 ring-white/6">
														{agent.mode}
													</span>
												)}
											</div>
											<div className="mt-1 flex items-center gap-2 text-[11px] text-muted/70">
												<span>{activeGrants.length} capability{activeGrants.length !== 1 ? "ies" : "y"}</span>
												{pendingGrants.length > 0 && (
													<>
														<span className="text-border">·</span>
														<span className="text-amber-400/70">{pendingGrants.length} pending</span>
													</>
												)}
												<span className="text-border">·</span>
												<span>{timeAgo(agent.created_at)}</span>
											</div>
										</div>
										<svg
											className={`h-4 w-4 shrink-0 text-muted/40 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
										>
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
										</svg>
									</button>

									{isExpanded && (
										<div className="border-t border-border/50">
											<div className="flex gap-0 border-b border-border/50 px-1">
												{(["details", "activity"] as const).map((tab) => {
													const isActive = (activeTab[agent.agent_id] ?? "details") === tab;
													return (
														<button
															key={tab}
															onClick={(e) => {
																e.stopPropagation();
																setActiveTab((prev) => ({ ...prev, [agent.agent_id]: tab }));
															}}
															className={`cursor-pointer relative px-4 py-2.5 text-xs font-medium capitalize transition-colors ${
																isActive ? "text-white" : "text-muted/60 hover:text-foreground"
															}`}
														>
															{tab}
															{isActive && (
																<span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-white" />
															)}
														</button>
													);
												})}
											</div>

											<div className="px-4 py-4 max-h-[420px] overflow-y-auto">
												{(activeTab[agent.agent_id] ?? "details") === "details" ? (
													<div className="flex flex-col gap-4">
														<div className="grid grid-cols-2 gap-2">
															<MetaItem label="Agent ID">
																<code className="text-[12px] font-mono break-all">{agent.agent_id}</code>
															</MetaItem>
															<MetaItem label="Host ID">
																<code className="text-[12px] font-mono break-all">{agent.host_id}</code>
															</MetaItem>
															<MetaItem label="Last Active">
																{timeAgo(agent.last_used_at)}
															</MetaItem>
															<MetaItem label="Expires">
																{agent.expires_at ? new Date(agent.expires_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "No expiration"}
															</MetaItem>
														</div>

														<div>
																<div className="flex items-center justify-between mb-2.5">
																	<span className="text-[11px] uppercase tracking-wider text-muted/60 font-medium">
																		Capabilities
																	</span>
																	{editingAgent === agent.agent_id ? (
																		<div className="flex gap-1.5">
																			<button
																				onClick={(e) => { e.stopPropagation(); saveCaps(agent.agent_id); }}
																				disabled={savingCaps}
																				className="cursor-pointer rounded-lg bg-white px-3 py-1 text-[11px] font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-50"
																			>
																				{savingCaps ? "Saving..." : "Save"}
																			</button>
																			<button
																				onClick={(e) => { e.stopPropagation(); setEditingAgent(null); }}
																				className="cursor-pointer rounded-lg border border-border px-3 py-1 text-[11px] font-medium text-muted transition-colors hover:text-foreground"
																			>
																				Cancel
																			</button>
																		</div>
																	) : (
																		<button
																			onClick={(e) => { e.stopPropagation(); startEditingCaps(agent); }}
																			className="cursor-pointer rounded-lg border border-border px-3 py-1 text-[11px] font-medium text-muted transition-colors hover:text-foreground hover:bg-white/4"
																		>
																			Edit
																		</button>
																	)}
																</div>
																{editingAgent === agent.agent_id ? (
																	loadingCaps ? (
																		<div className="flex justify-center py-6"><Spinner /></div>
																	) : (
																		<div className="flex flex-col gap-1.5 max-h-60 overflow-y-auto">
																			{availableCaps.map((cap) => {
																				const isSelected = selectedCaps.has(cap.name);
																				const isCurrentlyGranted = agent.agent_capability_grants.some(
																					(g) => g.capability === cap.name && g.status === "active",
																				);
																				return (
																					<label
																						key={cap.name}
																						onClick={(e) => e.stopPropagation()}
																						className={`flex items-center gap-3 rounded-lg px-3.5 py-2.5 cursor-pointer transition-colors ${
																							isSelected ? "bg-emerald-500/10 ring-1 ring-emerald-500/20" : "bg-white/3 ring-1 ring-white/4 hover:bg-white/5"
																						}`}
																					>
																						<input
																							type="checkbox"
																							checked={isSelected}
																							onChange={() => {
																								setSelectedCaps((prev) => {
																									const next = new Set(prev);
																									if (next.has(cap.name)) next.delete(cap.name);
																									else next.add(cap.name);
																									return next;
																								});
																							}}
																							className="h-3.5 w-3.5 rounded accent-emerald-500"
																						/>
																						<div className="flex-1 min-w-0">
																							<code className="text-[12px] font-mono text-foreground/80 truncate block">{cap.name}</code>
																							{cap.description && (
																								<p className="text-[11px] text-muted/50 truncate">{cap.description}</p>
																							)}
																						</div>
																						{isCurrentlyGranted && (
																							<span className="text-[10px] text-emerald-400 font-medium">granted</span>
																						)}
																					</label>
																				);
																			})}
																		</div>
																	)
																) : agent.agent_capability_grants.length > 0 ? (
																	<div className="flex flex-col gap-1.5">
																		{agent.agent_capability_grants.map((g, i) => (
																			<CapabilityRow key={i} grant={g} />
																		))}
																	</div>
																) : (
																	<p className="text-xs text-muted/50 py-2">No capabilities granted yet.</p>
																)}
															</div>

														{agent.status === "active" && (
															<div className="pt-1">
																<button
																	onClick={(e) => {
																		e.stopPropagation();
																		handleRevoke(agent.agent_id);
																	}}
																	disabled={revoking === agent.agent_id}
																	className="cursor-pointer rounded-lg border border-red-500/15 bg-red-500/5 px-4 py-2 text-xs font-medium text-red-400 transition-all hover:bg-red-500/10 hover:border-red-500/25 disabled:opacity-50"
																>
																	{revoking === agent.agent_id ? "Revoking..." : "Revoke Agent"}
																</button>
															</div>
														)}
													</div>
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
