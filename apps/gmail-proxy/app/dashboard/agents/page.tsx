"use client";

import { useCallback, useEffect, useState } from "react";

const statusColors: Record<
	string,
	{ dot: string; bg: string; text: string; ring: string }
> = {
	active: {
		dot: "bg-gmail-green",
		bg: "bg-gmail-green/10",
		text: "text-gmail-green",
		ring: "ring-gmail-green/20",
	},
	pending: {
		dot: "bg-gmail-yellow",
		bg: "bg-gmail-yellow/15",
		text: "text-gmail-yellow",
		ring: "ring-gmail-yellow/30",
	},
	expired: {
		dot: "bg-gray-400",
		bg: "bg-gray-100",
		text: "text-gray-500",
		ring: "ring-gray-200",
	},
	revoked: {
		dot: "bg-gmail-red",
		bg: "bg-gmail-red/10",
		text: "text-gmail-red",
		ring: "ring-gmail-red/20",
	},
	rejected: {
		dot: "bg-gmail-red",
		bg: "bg-gmail-red/10",
		text: "text-gmail-red",
		ring: "ring-gmail-red/20",
	},
	claimed: {
		dot: "bg-gmail-blue",
		bg: "bg-gmail-blue/10",
		text: "text-gmail-blue",
		ring: "ring-gmail-blue/20",
	},
	denied: {
		dot: "bg-gmail-red",
		bg: "bg-gmail-red/10",
		text: "text-gmail-red",
		ring: "ring-gmail-red/20",
	},
};

const defaultStatusColor = {
	dot: "bg-gray-400",
	bg: "bg-gray-100",
	text: "text-gray-500",
	ring: "ring-gray-200",
};

function StatusBadge({ status }: { status: string }) {
	const c = statusColors[status] ?? defaultStatusColor;
	return (
		<span
			className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-medium text-[11px] ring-1 ${c.bg} ${c.text} ${c.ring}`}
		>
			<span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
			{status}
		</span>
	);
}

function Spinner() {
	return (
		<svg
			className="h-5 w-5 animate-spin text-muted"
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

function AgentIcon({ status }: { name: string; status: string }) {
	const c = statusColors[status] ?? defaultStatusColor;
	return (
		<div
			className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${c.bg}`}
		>
			<svg
				className={`h-5 w-5 ${c.text}`}
				fill="none"
				stroke="currentColor"
				strokeWidth={1.5}
				viewBox="0 0 24 24"
			>
				<path
					d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</svg>
		</div>
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
	host_name: string | null;
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

const eventCategoryColors: Record<string, { dot: string; text: string }> = {
	agent: { dot: "bg-gmail-blue", text: "text-gmail-blue" },
	host: { dot: "bg-purple-500", text: "text-purple-600" },
	capability: { dot: "bg-gmail-yellow", text: "text-gmail-yellow" },
	ciba: { dot: "bg-teal-500", text: "text-teal-600" },
};

const defaultEventColor = { dot: "bg-gray-400", text: "text-gray-500" };

function formatEventMessage(log: LogEntry): string {
	const action = log.type.split(".").pop() ?? log.type;
	const capability =
		log.data && "capability" in log.data ? String(log.data.capability) : null;

	const messages: Record<string, string> = {
		registered: "Agent registered",
		connected: "Connected to host",
		revoked: "Agent access revoked",
		granted: capability ? `Granted "${capability}"` : "Capability granted",
		requested: capability
			? `Requested "${capability}"`
			: "Capability requested",
		executed: capability ? `Executed "${capability}"` : "Capability executed",
		denied: capability ? `Denied "${capability}"` : "Capability denied",
		approved: capability ? `Approved "${capability}"` : "Capability approved",
	};

	return messages[action] ?? log.type.replace(/\./g, " ");
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
				<div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface">
					<svg
						className="h-5 w-5 text-muted"
						fill="none"
						stroke="currentColor"
						strokeWidth={1.5}
						viewBox="0 0 24 24"
					>
						<path
							d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</svg>
				</div>
				<p className="text-muted text-sm">No activity recorded yet</p>
			</div>
		);
	}

	return (
		<div className="relative flex flex-col">
			<div className="absolute top-2 bottom-2 left-[15px] w-px bg-border" />
			{logs.map((log) => {
				const isExpanded = expandedLog === log.id;
				const category = log.type.split(".")[0];
				const c = eventCategoryColors[category] ?? defaultEventColor;
				return (
					<button
						className="group relative flex w-full cursor-pointer text-left"
						key={log.id}
						onClick={() => setExpandedLog(isExpanded ? null : log.id)}
					>
						<div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center">
							<span
								className={`h-2.5 w-2.5 rounded-full ring-[3px] ring-white ${c.dot} transition-transform group-hover:scale-125`}
							/>
						</div>
						<div
							className={`mb-1.5 ml-1 flex-1 rounded-xl border border-transparent transition-colors ${isExpanded ? "border-border bg-surface" : "group-hover:bg-surface/70"}`}
						>
							<div className="flex items-center gap-2 px-3 py-2">
								<span className="flex-1 text-[13px] text-foreground">
									{formatEventMessage(log)}
								</span>
								<span className="shrink-0 text-[11px] text-muted tabular-nums">
									{timeAgo(log.createdAt)}
								</span>
							</div>
							{isExpanded && log.data && (
								<div className="border-border border-t px-3 py-2.5">
									<pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-all font-mono text-[11px] text-muted leading-relaxed">
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

function MetaItem({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-1 rounded-xl bg-surface px-3.5 py-2.5">
			<span className="font-medium text-[10px] text-muted uppercase tracking-wider">
				{label}
			</span>
			<div className="text-[13px] text-foreground">{children}</div>
		</div>
	);
}

function CapabilityRow({ grant }: { grant: GrantData }) {
	const c = statusColors[grant.status] ?? defaultStatusColor;
	return (
		<div className="group flex items-center gap-3 rounded-xl bg-surface px-3.5 py-2.5 transition-colors hover:bg-surface-hover">
			<div
				className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${c.bg}`}
			>
				<svg
					className={`h-3.5 w-3.5 ${c.text}`}
					fill="none"
					stroke="currentColor"
					strokeWidth={2}
					viewBox="0 0 24 24"
				>
					<path
						d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			</div>
			<code className="flex-1 truncate font-mono text-[12px] text-foreground">
				{grant.capability}
			</code>
			<StatusBadge status={grant.status} />
		</div>
	);
}

export default function AgentsPage() {
	const [agents, setAgents] = useState<AgentData[]>([]);
	const [loading, setLoading] = useState(true);
	const [filter, setFilter] = useState("active");
	const [expanded, setExpanded] = useState<string | null>(null);
	const [activeTab, setActiveTab] = useState<
		Record<string, "details" | "activity">
	>({});
	const [revoking, setRevoking] = useState<string | null>(null);
	const [editingAgent, setEditingAgent] = useState<string | null>(null);
	const [availableCaps, setAvailableCaps] = useState<
		{ name: string; description: string }[]
	>([]);
	const [selectedCaps, setSelectedCaps] = useState<Set<string>>(new Set());
	const [savingCaps, setSavingCaps] = useState(false);
	const [loadingCaps, setLoadingCaps] = useState(false);

	const startEditingCaps = async (agent: AgentData) => {
		setEditingAgent(agent.agent_id);
		setLoadingCaps(true);
		const activeGrants = new Set(
			agent.agent_capability_grants
				.filter((g) => g.status === "active")
				.map((g) => g.capability)
		);
		setSelectedCaps(activeGrants);
		try {
			const res = await fetch("/api/auth/capability/list?limit=500");
			if (res.ok) {
				const data = await res.json();
				setAvailableCaps(data.capabilities ?? []);
			}
		} catch {
			/* ignore */
		}
		setLoadingCaps(false);
	};

	const saveCaps = async (agentId: string) => {
		setSavingCaps(true);
		const agent = agents.find((a) => a.agent_id === agentId);
		const currentActive = new Set(
			agent?.agent_capability_grants
				.filter((g) => g.status === "active")
				.map((g) => g.capability) ?? []
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
			const params = filter === "all" ? "" : `?status=${filter}`;
			const listRes = await fetch(`/api/auth/agent/list${params}`);
			if (listRes.ok) {
				const data = await listRes.json();
				setAgents(data.agents ?? []);
			}
		} catch {
			/* ignore */
		}
		setSavingCaps(false);
		setEditingAgent(null);
	};

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
	const filteredCount = agents.length;

	return (
		<div className="mx-auto w-full max-w-3xl px-6 py-8">
			<div className="flex flex-col gap-6">
				<div className="flex items-start justify-between">
					<div>
						<h1 className="font-normal text-[22px] text-foreground">Agents</h1>
						<p className="mt-1 text-muted text-sm">
							{loading
								? "Loading agents..."
								: `${filteredCount} agent${filteredCount === 1 ? "" : "s"} connected`}
						</p>
					</div>
					<div className="flex gap-0.5 rounded-full border border-border bg-white p-0.5 shadow-sm">
						{filters.map((f) => (
							<button
								className={`cursor-pointer rounded-full px-3.5 py-1.5 font-medium text-xs capitalize transition-all ${
									filter === f
										? "bg-accent text-white shadow-sm"
										: "text-muted hover:bg-surface hover:text-foreground"
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
					<div className="flex flex-col items-center justify-center rounded-2xl border border-border border-dashed py-20">
						<div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-surface">
							<svg
								className="h-6 w-6 text-muted"
								fill="none"
								stroke="currentColor"
								strokeWidth={1.5}
								viewBox="0 0 24 24"
							>
								<path
									d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
									strokeLinecap="round"
									strokeLinejoin="round"
								/>
							</svg>
						</div>
						<p className="font-medium text-foreground text-sm">
							No agents found
						</p>
						<p className="mt-1.5 text-muted text-xs">
							Agents will appear here once they connect.
						</p>
					</div>
				) : (
					<div className="flex flex-col gap-2.5">
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
									className={`rounded-2xl border border-border bg-white shadow-sm transition-all ${isExpanded ? "ring-1 ring-accent/20" : ""}`}
									key={agent.agent_id}
								>
									<button
										className="flex w-full cursor-pointer items-center gap-3.5 px-5 py-4 text-left"
										onClick={() =>
											setExpanded(isExpanded ? null : agent.agent_id)
										}
									>
										<AgentIcon name={agent.name} status={agent.status} />
										<div className="min-w-0 flex-1">
											<div className="flex items-center gap-2.5">
												<span className="truncate font-medium text-foreground text-sm">
													{agent.name}
												</span>
												<StatusBadge status={agent.status} />
												{agent.mode && (
													<span className="hidden rounded-full bg-surface px-2 py-0.5 font-medium text-[10px] text-muted sm:inline-flex">
														{agent.mode}
													</span>
												)}
											</div>
											<div className="mt-1 flex items-center gap-2 text-[11px] text-muted">
												<span>
													{activeGrants.length} capability
													{activeGrants.length === 1 ? "y" : "ies"}
												</span>
												{pendingGrants.length > 0 && (
													<>
														<span>·</span>
														<span className="text-gmail-yellow">
															{pendingGrants.length} pending
														</span>
													</>
												)}
												<span>·</span>
												<span>{timeAgo(agent.created_at)}</span>
											</div>
										</div>
										<svg
											className={`h-4 w-4 shrink-0 text-muted transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
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
											<div className="flex gap-0 border-border border-b px-2">
												{(["details", "activity"] as const).map((tab) => {
													const isActive =
														(activeTab[agent.agent_id] ?? "details") === tab;
													return (
														<button
															className={`relative cursor-pointer px-4 py-2.5 font-medium text-xs capitalize transition-colors ${
																isActive
																	? "text-accent"
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
															{isActive && (
																<span className="absolute right-2 bottom-0 left-2 h-0.5 rounded-full bg-accent" />
															)}
														</button>
													);
												})}
											</div>

											<div className="max-h-[420px] overflow-y-auto px-5 py-4">
												{(activeTab[agent.agent_id] ?? "details") ===
												"details" ? (
													<div className="flex flex-col gap-4">
														<div className="grid grid-cols-2 gap-2">
															<MetaItem label="Agent ID">
																<code className="break-all font-mono text-[12px]">
																	{agent.agent_id}
																</code>
															</MetaItem>
															<MetaItem label="Host">
																{agent.host_name ?? (
																	<code className="break-all font-mono text-[12px]">
																		{agent.host_id}
																	</code>
																)}
															</MetaItem>
															<MetaItem label="Last Active">
																{timeAgo(agent.last_used_at)}
															</MetaItem>
															<MetaItem label="Expires">
																{agent.expires_at
																	? new Date(
																			agent.expires_at
																		).toLocaleDateString(undefined, {
																			month: "short",
																			day: "numeric",
																			year: "numeric",
																		})
																	: "No expiration"}
															</MetaItem>
														</div>

														<div>
															<div className="mb-2.5 flex items-center justify-between">
																<span className="font-medium text-[11px] text-muted uppercase tracking-wider">
																	Capabilities
																</span>
																{editingAgent === agent.agent_id ? (
																	<div className="flex gap-1.5">
																		<button
																			className="cursor-pointer rounded-full bg-accent px-3 py-1 font-medium text-[11px] text-white transition-opacity hover:opacity-90 disabled:opacity-50"
																			disabled={savingCaps}
																			onClick={(e) => {
																				e.stopPropagation();
																				saveCaps(agent.agent_id);
																			}}
																		>
																			{savingCaps ? "Saving..." : "Save"}
																		</button>
																		<button
																			className="cursor-pointer rounded-full border border-border px-3 py-1 font-medium text-[11px] text-muted transition-colors hover:text-foreground"
																			onClick={(e) => {
																				e.stopPropagation();
																				setEditingAgent(null);
																			}}
																		>
																			Cancel
																		</button>
																	</div>
																) : (
																	<button
																		className="cursor-pointer rounded-full border border-border px-3 py-1 font-medium text-[11px] text-muted transition-colors hover:bg-surface hover:text-foreground"
																		onClick={(e) => {
																			e.stopPropagation();
																			startEditingCaps(agent);
																		}}
																	>
																		Edit
																	</button>
																)}
															</div>
															{editingAgent === agent.agent_id ? (
																loadingCaps ? (
																	<div className="flex justify-center py-6">
																		<Spinner />
																	</div>
																) : (
																	<div className="flex max-h-60 flex-col gap-1.5 overflow-y-auto">
																		{availableCaps.map((cap) => {
																			const isSelected = selectedCaps.has(
																				cap.name
																			);
																			const isCurrentlyGranted =
																				agent.agent_capability_grants.some(
																					(g) =>
																						g.capability === cap.name &&
																						g.status === "active"
																				);
																			return (
																				<label
																					className={`flex cursor-pointer items-center gap-3 rounded-xl px-3.5 py-2.5 transition-colors ${
																						isSelected
																							? "bg-accent/10 ring-1 ring-accent/20"
																							: "bg-surface hover:bg-surface-hover"
																					}`}
																					key={cap.name}
																					onClick={(e) => e.stopPropagation()}
																				>
																					<input
																						checked={isSelected}
																						className="h-3.5 w-3.5 rounded accent-gmail-blue"
																						onChange={() => {
																							setSelectedCaps((prev) => {
																								const next = new Set(prev);
																								if (next.has(cap.name)) {
																									next.delete(cap.name);
																								} else {
																									next.add(cap.name);
																								}
																								return next;
																							});
																						}}
																						type="checkbox"
																					/>
																					<div className="min-w-0 flex-1">
																						<code className="block truncate font-mono text-[12px] text-foreground">
																							{cap.name}
																						</code>
																						{cap.description && (
																							<p className="truncate text-[11px] text-muted">
																								{cap.description}
																							</p>
																						)}
																					</div>
																					{isCurrentlyGranted && (
																						<span className="font-medium text-[10px] text-gmail-green">
																							granted
																						</span>
																					)}
																				</label>
																			);
																		})}
																	</div>
																)
															) : agent.agent_capability_grants.length > 0 ? (
																<div className="flex flex-col gap-1.5">
																	{agent.agent_capability_grants.map((g, i) => (
																		<CapabilityRow grant={g} key={i} />
																	))}
																</div>
															) : (
																<p className="py-2 text-muted text-xs">
																	No capabilities granted yet.
																</p>
															)}
														</div>

														{agent.status === "active" && (
															<div className="pt-1">
																<button
																	className="cursor-pointer rounded-full border border-gmail-red/20 px-4 py-2 font-medium text-gmail-red text-xs transition-all hover:bg-gmail-red/5 disabled:opacity-50"
																	disabled={revoking === agent.agent_id}
																	onClick={(e) => {
																		e.stopPropagation();
																		handleRevoke(agent.agent_id);
																	}}
																>
																	{revoking === agent.agent_id
																		? "Revoking..."
																		: "Revoke Agent"}
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
