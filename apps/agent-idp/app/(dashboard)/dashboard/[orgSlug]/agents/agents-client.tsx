"use client";

import {
	AlertCircle,
	AlertTriangle,
	Bot,
	Check,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	Copy,
	KeyRound,
	Layers,
	List,
	Loader2,
	Pencil,
	RefreshCw,
	Search,
	Wrench,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ConnectDialog } from "@/components/dashboard/connect-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Agent, AgentActivity } from "@/lib/auth/agent-api";
import {
	getAgentActivity,
	listAgents,
	revokeAgent,
	revokeAllAgents,
	updateAgent,
} from "@/lib/auth/agent-api";
import { cn } from "@/lib/utils";

type HostInfo = {
	id: string;
	name: string | null;
	status: string;
};

type OrgAgent = {
	id: string;
	name: string;
	status: string;
	scopes: string[];
	host: HostInfo | null;
	createdAt: string;
	updatedAt: string;
	lastUsedAt: string | null;
	activatedAt: string | null;
	[key: string]: unknown;
};

export type ProviderToolInfo = {
	name: string;
	displayName: string;
	tools: Array<{ name: string; description: string }>;
};

type AgentWithHost = Agent & { host: HostInfo | null };
type StatusFilter = "active" | "all" | "revoked";
type ViewMode = "list" | "grouped";

function normalizeScopes(val: unknown): string[] {
	if (Array.isArray(val)) return val;
	if (typeof val === "string") {
		try {
			const parsed = JSON.parse(val);
			if (Array.isArray(parsed)) return parsed;
		} catch {}
	}
	return [];
}

function mapOrgAgent(orgAgent: OrgAgent): AgentWithHost {
	return {
		id: orgAgent.id,
		name: orgAgent.name,
		status: orgAgent.status,
		scopes: normalizeScopes(orgAgent.scopes),
		host: orgAgent.host,
		metadata: null,
		createdAt: orgAgent.createdAt,
		updatedAt: orgAgent.updatedAt,
		lastUsedAt: orgAgent.lastUsedAt,
	};
}

function formatDate(d: string | Date | null): string {
	if (!d) return "Never";
	const date = d instanceof Date ? d : new Date(d);
	return date.toLocaleString();
}

function formatRelativeTime(d: string | Date | null): string {
	if (!d) return "Never";
	const date = d instanceof Date ? d : new Date(d);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffSec = Math.floor(diffMs / 1000);
	const diffMin = Math.floor(diffSec / 60);
	const diffHour = Math.floor(diffMin / 60);
	const diffDay = Math.floor(diffHour / 24);
	if (diffSec < 60) return "Just now";
	if (diffMin < 60) return `${diffMin}m ago`;
	if (diffHour < 24) return `${diffHour}h ago`;
	if (diffDay < 30) return `${diffDay}d ago`;
	return date.toLocaleDateString();
}

function HostBadge({ host }: { host: HostInfo | null }) {
	if (!host) {
		return (
			<span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/50 font-mono">
				<KeyRound className="h-2.5 w-2.5" />
				no host
			</span>
		);
	}
	const isRevoked = host.status === "revoked";
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 text-[10px] font-mono rounded px-1.5 py-0.5",
				isRevoked
					? "text-red-500/70 bg-red-500/5"
					: "text-muted-foreground bg-muted/40",
			)}
			title={`Host: ${host.id}`}
		>
			<KeyRound className="h-2.5 w-2.5" />
			{host.name ?? host.id.slice(0, 8)}
			{isRevoked && " (revoked)"}
		</span>
	);
}

function AgentCard({
	agent,
	onUpdated,
	onRevoked,
	showHost,
}: {
	agent: AgentWithHost;
	onUpdated: (a: Partial<Agent> & { id: string }) => void;
	onRevoked: (id: string) => void;
	showHost: boolean;
}) {
	const [expanded, setExpanded] = useState(false);
	const [tab, setTab] = useState<"details" | "activity">("details");
	const [editingName, setEditingName] = useState(false);
	const [draftName, setDraftName] = useState(agent.name);
	const [saving, setSaving] = useState(false);
	const [revoking, setRevoking] = useState(false);
	const [confirmRevoke, setConfirmRevoke] = useState(false);
	const [activities, setActivities] = useState<AgentActivity[]>([]);
	const [loadingActivity, setLoadingActivity] = useState(false);
	const [activityPage, setActivityPage] = useState(0);
	const [copied, setCopied] = useState(false);

	const handleSave = async (field: string, value: unknown) => {
		setSaving(true);
		const body: Record<string, unknown> = { agentId: agent.id };
		body[field] = value;
		const res = await updateAgent(body as Parameters<typeof updateAgent>[0]);
		if (res.data) onUpdated({ ...res.data, id: agent.id });
		setSaving(false);
	};

	const handleRevoke = async () => {
		setRevoking(true);
		const res = await revokeAgent(agent.id);
		if (!res.error) onRevoked(agent.id);
		setRevoking(false);
		setConfirmRevoke(false);
	};

	const fetchActivity = useCallback(async () => {
		setLoadingActivity(true);
		try {
			const res = await getAgentActivity({
				agentId: agent.id,
				limit: 10,
				offset: activityPage * 10,
			});
			setActivities(res.data || []);
		} catch {}
		setLoadingActivity(false);
	}, [agent.id, activityPage]);

	useEffect(() => {
		if (tab === "activity" && expanded) void fetchActivity();
	}, [tab, expanded, fetchActivity]);

	const copyId = () => {
		navigator.clipboard.writeText(agent.id);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	const isActive = agent.status === "active";

	return (
		<div className="border border-border/60 rounded-lg overflow-hidden bg-card/50">
			<div
				className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-accent/30 transition-colors"
				onClick={() => setExpanded(!expanded)}
			>
				<div className="flex items-center gap-3 min-w-0">
					<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted/50">
						<Bot className="h-4 w-4 text-muted-foreground" />
					</div>
					<div className="min-w-0">
						<div className="flex items-center gap-2">
							<p className="font-medium text-sm truncate">{agent.name}</p>
							<span
								className={cn(
									"text-[10px] font-medium px-1.5 py-0.5 rounded-full",
									isActive
										? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
										: "bg-muted text-muted-foreground",
								)}
							>
								{agent.status}
							</span>
						</div>
						<div className="flex items-center gap-2 mt-0.5 flex-wrap">
							<span className="text-xs text-muted-foreground">
								{agent.scopes.length} scope
								{agent.scopes.length !== 1 ? "s" : ""} &middot;{" "}
								{formatRelativeTime(agent.lastUsedAt)}
							</span>
							{showHost && <HostBadge host={agent.host} />}
						</div>
					</div>
				</div>
				<div className="flex items-center gap-2 shrink-0">
					{expanded ? (
						<ChevronDown className="h-4 w-4 text-muted-foreground" />
					) : (
						<ChevronRight className="h-4 w-4 text-muted-foreground" />
					)}
				</div>
			</div>

			{expanded && (
				<div className="border-t border-border/40">
					<div className="flex gap-4 px-4 border-b border-border/40">
						{(["details", "activity"] as const).map((t) => (
							<button
								key={t}
								className={cn(
									"py-2 text-xs font-medium transition-colors capitalize",
									tab === t
										? "text-foreground border-b-2 border-foreground -mb-px"
										: "text-muted-foreground hover:text-foreground",
								)}
								onClick={() => setTab(t)}
							>
								{t}
							</button>
						))}
					</div>

					{tab === "details" && (
						<div className="p-4 space-y-4">
							<div className="flex items-center gap-2">
								<span className="text-xs text-muted-foreground">ID</span>
								<code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
									{agent.id}
								</code>
								<button
									className="p-0.5 hover:bg-muted rounded transition-colors"
									onClick={copyId}
								>
									{copied ? (
										<Check className="h-3 w-3 text-emerald-500" />
									) : (
										<Copy className="h-3 w-3 text-muted-foreground" />
									)}
								</button>
							</div>

							{agent.host && (
								<div>
									<p className="text-xs text-muted-foreground mb-1">Host</p>
									<div className="flex items-center gap-2">
										<HostBadge host={agent.host} />
										<code className="text-[10px] text-muted-foreground/40 font-mono">
											{agent.host.id}
										</code>
									</div>
								</div>
							)}

							{isActive && (
								<div>
									<p className="text-xs text-muted-foreground mb-1.5">Name</p>
									{editingName ? (
										<div className="flex gap-2">
											<Input
												value={draftName}
												onChange={(e) => setDraftName(e.target.value)}
												className="h-8 text-sm"
											/>
											<Button
												size="sm"
												className="h-8"
												onClick={() => {
													void handleSave("name", draftName);
													setEditingName(false);
												}}
												disabled={saving}
											>
												<Check className="h-3 w-3" />
											</Button>
											<Button
												variant="ghost"
												size="sm"
												className="h-8"
												onClick={() => {
													setDraftName(agent.name);
													setEditingName(false);
												}}
											>
												<X className="h-3 w-3" />
											</Button>
										</div>
									) : (
										<div className="flex items-center gap-2">
											<span className="text-sm">{agent.name}</span>
											<button
												className="p-1 hover:bg-muted rounded transition-colors"
												onClick={() => setEditingName(true)}
											>
												<Pencil className="h-3 w-3 text-muted-foreground" />
											</button>
										</div>
									)}
								</div>
							)}

							{isActive && agent.scopes.length > 0 && (
								<div>
									<p className="text-xs text-muted-foreground mb-1.5">Scopes</p>
									<div className="flex flex-wrap gap-1">
										{agent.scopes.map((s) => (
											<span
												key={s}
												className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground"
											>
												{s}
											</span>
										))}
									</div>
								</div>
							)}

							<div className="grid grid-cols-2 gap-4 text-xs pt-2">
								<div>
									<span className="text-muted-foreground">Created</span>
									<p className="mt-0.5">{formatDate(agent.createdAt)}</p>
								</div>
								<div>
									<span className="text-muted-foreground">Last used</span>
									<p className="mt-0.5">{formatDate(agent.lastUsedAt)}</p>
								</div>
							</div>

							{isActive && (
								<div className="pt-3 border-t border-border/40">
									{confirmRevoke ? (
										<div className="flex items-center gap-2">
											<span className="text-xs text-destructive">
												Revoke this agent?
											</span>
											<Button
												variant="destructive"
												size="sm"
												className="h-7 text-xs"
												onClick={handleRevoke}
												disabled={revoking}
											>
												{revoking ? (
													<Loader2 className="h-3 w-3 animate-spin" />
												) : (
													"Confirm"
												)}
											</Button>
											<Button
												variant="ghost"
												size="sm"
												className="h-7 text-xs"
												onClick={() => setConfirmRevoke(false)}
											>
												Cancel
											</Button>
										</div>
									) : (
										<button
											className="flex items-center gap-1.5 text-xs text-destructive/80 hover:text-destructive transition-colors"
											onClick={() => setConfirmRevoke(true)}
										>
											<AlertTriangle className="h-3 w-3" />
											Revoke Agent
										</button>
									)}
								</div>
							)}
						</div>
					)}

					{tab === "activity" && (
						<div className="p-4">
							{loadingActivity ? (
								<div className="flex items-center justify-center py-6">
									<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
								</div>
							) : activities.length > 0 ? (
								<div className="space-y-1.5">
									{activities.map((act) => (
										<div
											key={act.id}
											className="bg-muted/50 rounded-md text-xs p-2.5 flex items-start gap-2.5"
										>
											<div className="mt-0.5 shrink-0">
												{act.error ? (
													<AlertCircle className="h-3.5 w-3.5 text-destructive" />
												) : (
													<Wrench className="h-3.5 w-3.5 text-muted-foreground" />
												)}
											</div>
											<div className="flex-1 min-w-0">
												<div className="flex items-center gap-2">
													{act.provider && (
														<span className="font-mono bg-background px-1.5 py-0.5 rounded text-[10px]">
															{act.provider}
														</span>
													)}
													<span className="font-medium truncate">
														{act.tool}
													</span>
												</div>
												{act.error && (
													<p className="text-destructive mt-0.5 truncate">
														{act.error}
													</p>
												)}
											</div>
											<div className="text-muted-foreground shrink-0 text-right flex items-center gap-2">
												{act.durationMs != null && (
													<span>{act.durationMs}ms</span>
												)}
												<span>{formatRelativeTime(act.createdAt)}</span>
											</div>
										</div>
									))}
									<div className="flex items-center justify-between pt-2">
										<Button
											variant="ghost"
											size="sm"
											className="h-7 text-xs"
											disabled={activityPage === 0}
											onClick={() => setActivityPage((p) => p - 1)}
										>
											<ChevronLeft className="h-3 w-3 mr-1" />
											Prev
										</Button>
										<span className="text-[10px] text-muted-foreground">
											Page {activityPage + 1}
										</span>
										<Button
											variant="ghost"
											size="sm"
											className="h-7 text-xs"
											disabled={activities.length < 10}
											onClick={() => setActivityPage((p) => p + 1)}
										>
											Next
											<ChevronRight className="h-3 w-3 ml-1" />
										</Button>
									</div>
								</div>
							) : (
								<p className="text-xs text-muted-foreground text-center py-6">
									No activity recorded
								</p>
							)}
						</div>
					)}
				</div>
			)}
		</div>
	);
}

function HostGroupHeader({
	host,
	agentCount,
}: {
	host: HostInfo | null;
	agentCount: number;
}) {
	return (
		<div className="flex items-center gap-2 pt-4 pb-1.5 first:pt-0">
			<KeyRound className="h-3.5 w-3.5 text-muted-foreground/50" />
			<span className="text-xs font-medium text-foreground/80">
				{host ? (host.name ?? host.id.slice(0, 12)) : "No host"}
			</span>
			{host?.status === "revoked" && (
				<span className="text-[10px] text-red-500/70 bg-red-500/5 px-1.5 py-0.5 rounded">
					revoked
				</span>
			)}
			<span className="text-[10px] text-muted-foreground/50 tabular-nums">
				{agentCount} agent{agentCount !== 1 ? "s" : ""}
			</span>
			<div className="h-px flex-1 bg-border/30" />
		</div>
	);
}

export function AgentsClient({
	initialAgents,
	currentUserId,
	providerTools: initialProviderTools,
	orgId,
}: {
	initialAgents: OrgAgent[];
	currentUserId: string;
	providerTools: ProviderToolInfo[];
	orgId: string;
}) {
	const [agents, setAgents] = useState<AgentWithHost[]>(() =>
		initialAgents.map(mapOrgAgent),
	);
	const [error, setError] = useState<string | null>(null);
	const [refreshing, setRefreshing] = useState(false);
	const [revokingAll, setRevokingAll] = useState(false);
	const [showRevokeAllConfirm, setShowRevokeAllConfirm] = useState(false);
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
	const [hostFilter, setHostFilter] = useState<string | null>(null);
	const [search, setSearch] = useState("");
	const [viewMode, setViewMode] = useState<ViewMode>("list");

	const hosts = useMemo(() => {
		const seen = new Map<string, HostInfo>();
		for (const a of agents) {
			if (a.host && a.host.status === "active" && !seen.has(a.host.id)) {
				seen.set(a.host.id, a.host);
			}
		}
		return [...seen.values()];
	}, [agents]);

	const fetchAgents = useCallback(async () => {
		setError(null);
		try {
			const res = await listAgents();
			if (res.error) {
				setError(res.error);
				return;
			}
			setAgents(
				(res.data || []).map((a) => ({
					...a,
					host: (a as unknown as OrgAgent).host ?? null,
					scopes: normalizeScopes(a.scopes),
				})),
			);
		} catch {
			setError("Failed to load agents");
		}
	}, []);

	const refreshAll = useCallback(async () => {
		setRefreshing(true);
		await fetchAgents();
		setRefreshing(false);
	}, [fetchAgents]);

	function handleAgentUpdated(updated: Partial<Agent> & { id: string }) {
		setAgents((prev) =>
			prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)),
		);
	}

	function handleAgentRevoked(agentId: string) {
		setAgents((prev) =>
			prev.map((a) =>
				a.id === agentId ? { ...a, status: "revoked" as const } : a,
			),
		);
	}

	async function handleRevokeAll() {
		setRevokingAll(true);
		const ids = activeAgents.map((a) => a.id);
		const result = await revokeAllAgents(ids);
		if (result.revoked > 0) {
			const failedSet = new Set(result.failed);
			setAgents((prev) =>
				prev.map((a) =>
					a.status === "active" && !failedSet.has(a.id)
						? { ...a, status: "revoked" as const }
						: a,
				),
			);
		}
		setRevokingAll(false);
		setShowRevokeAllConfirm(false);
	}

	const activeAgents = agents.filter((a) => a.status === "active");
	const revokedAgents = agents.filter((a) => a.status === "revoked");

	const filteredAgents = useMemo(() => {
		let result =
			statusFilter === "active"
				? activeAgents
				: statusFilter === "revoked"
					? revokedAgents
					: agents;

		if (hostFilter !== null) {
			result =
				hostFilter === "__none__"
					? result.filter((a) => !a.host)
					: result.filter((a) => a.host?.id === hostFilter);
		}

		if (search.trim()) {
			const q = search.toLowerCase();
			result = result.filter(
				(a) =>
					a.name.toLowerCase().includes(q) ||
					a.id.toLowerCase().includes(q) ||
					a.scopes.some((s) => s.toLowerCase().includes(q)) ||
					a.host?.name?.toLowerCase().includes(q),
			);
		}

		return result;
	}, [agents, activeAgents, revokedAgents, statusFilter, hostFilter, search]);

	const groupedByHost = useMemo(() => {
		if (viewMode !== "grouped") return null;
		const groups = new Map<
			string,
			{ host: HostInfo | null; agents: AgentWithHost[] }
		>();
		for (const a of filteredAgents) {
			const key = a.host?.id ?? "__none__";
			const existing = groups.get(key);
			if (existing) {
				existing.agents.push(a);
			} else {
				groups.set(key, { host: a.host, agents: [a] });
			}
		}
		return [...groups.values()];
	}, [filteredAgents, viewMode]);

	const statusTabs: { id: StatusFilter; label: string; count: number }[] = [
		{ id: "active", label: "Active", count: activeAgents.length },
		{ id: "all", label: "All", count: agents.length },
		{ id: "revoked", label: "Revoked", count: revokedAgents.length },
	];

	return (
		<div className="flex flex-col h-full">
			<div className="sticky top-0 z-10 bg-background pb-4 pt-8 flex flex-col gap-6">
				<div className="flex items-center justify-between">
					<div>
						<h1 className="text-xl font-medium tracking-tight">Agents</h1>
						<p className="text-sm text-muted-foreground mt-0.5">
							Manage connected AI agents and monitor their activity.
						</p>
					</div>
					<div className="flex gap-2">
						<Button
							variant="outline"
							size="sm"
							className="h-8 text-xs border-dashed"
							onClick={refreshAll}
							disabled={refreshing}
						>
							<RefreshCw
								className={cn("h-3 w-3 mr-1.5", refreshing && "animate-spin")}
							/>
							Refresh
						</Button>
						<ConnectDialog orgId={orgId}>
							<Button size="sm" className="h-8 text-xs">
								Connect Agent
							</Button>
						</ConnectDialog>
					</div>
				</div>

				<div className="grid grid-cols-3 gap-3">
					{[
						{ label: "Total", value: agents.length },
						{ label: "Active", value: activeAgents.length },
						{ label: "Hosts", value: hosts.length },
					].map((stat) => (
						<div
							key={stat.label}
							className="border border-border/60 rounded-lg p-4 bg-card/30"
						>
							<p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
								{stat.label}
							</p>
							<p className="text-2xl font-semibold tracking-tight mt-1">
								{stat.value}
							</p>
						</div>
					))}
				</div>

				{error && (
					<div className="p-3 border border-destructive/30 bg-destructive/5 text-sm text-destructive rounded-lg">
						{error}
					</div>
				)}

				{/* Filters row */}
				<div className="flex items-center gap-3 flex-wrap">
					<div className="flex gap-1 p-0.5 bg-muted/50 rounded-lg">
						{statusTabs.map((t) => (
							<button
								key={t.id}
								onClick={() => setStatusFilter(t.id)}
								className={cn(
									"px-3 py-1.5 text-xs font-medium transition-all rounded-md",
									statusFilter === t.id
										? "bg-background text-foreground shadow-sm"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								{t.label}
								<span
									className={cn(
										"ml-1.5 tabular-nums",
										statusFilter === t.id
											? "text-foreground/60"
											: "text-muted-foreground/60",
									)}
								>
									{t.count}
								</span>
							</button>
						))}
					</div>

					{hosts.length > 0 && (
						<div className="flex gap-1 p-0.5 bg-muted/50 rounded-lg">
							<button
								onClick={() => setHostFilter(null)}
								className={cn(
									"px-2.5 py-1.5 text-xs font-medium transition-all rounded-md",
									hostFilter === null
										? "bg-background text-foreground shadow-sm"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								All hosts
							</button>
							{hosts.map((h) => (
								<button
									key={h.id}
									onClick={() => setHostFilter(h.id)}
									className={cn(
										"px-2.5 py-1.5 text-xs font-medium transition-all rounded-md flex items-center gap-1",
										hostFilter === h.id
											? "bg-background text-foreground shadow-sm"
											: "text-muted-foreground hover:text-foreground",
									)}
								>
									<KeyRound className="h-2.5 w-2.5" />
									{h.name ?? h.id.slice(0, 8)}
								</button>
							))}
							{agents.some((a) => !a.host) && (
								<button
									onClick={() => setHostFilter("__none__")}
									className={cn(
										"px-2.5 py-1.5 text-xs font-medium transition-all rounded-md",
										hostFilter === "__none__"
											? "bg-background text-foreground shadow-sm"
											: "text-muted-foreground hover:text-foreground",
									)}
								>
									No host
								</button>
							)}
						</div>
					)}

					<div className="ml-auto flex items-center gap-2">
						<div className="relative">
							<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
							<Input
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								placeholder="Search agents..."
								className="h-8 text-xs pl-7 w-48 bg-muted/30 border-border/40"
							/>
							{search && (
								<button
									onClick={() => setSearch("")}
									className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
								>
									<X className="h-3 w-3" />
								</button>
							)}
						</div>

						{hosts.length > 0 && (
							<div className="flex p-0.5 bg-muted/50 rounded-md">
								<button
									onClick={() => setViewMode("list")}
									className={cn(
										"p-1.5 rounded transition-colors",
										viewMode === "list"
											? "bg-background shadow-sm text-foreground"
											: "text-muted-foreground hover:text-foreground",
									)}
									title="List view"
								>
									<List className="h-3.5 w-3.5" />
								</button>
								<button
									onClick={() => setViewMode("grouped")}
									className={cn(
										"p-1.5 rounded transition-colors",
										viewMode === "grouped"
											? "bg-background shadow-sm text-foreground"
											: "text-muted-foreground hover:text-foreground",
									)}
									title="Group by host"
								>
									<Layers className="h-3.5 w-3.5" />
								</button>
							</div>
						)}
					</div>
				</div>

				{activeAgents.length > 0 && statusFilter === "active" && (
					<div className="flex justify-end -mt-2">
						{showRevokeAllConfirm ? (
							<div className="flex items-center gap-2">
								<Button
									variant="destructive"
									size="sm"
									className="h-7 text-xs"
									onClick={handleRevokeAll}
									disabled={revokingAll}
								>
									{revokingAll && (
										<Loader2 className="h-3 w-3 animate-spin mr-1" />
									)}
									Confirm Revoke All
								</Button>
								<Button
									variant="ghost"
									size="sm"
									className="h-7 text-xs"
									onClick={() => setShowRevokeAllConfirm(false)}
								>
									Cancel
								</Button>
							</div>
						) : (
							<button
								className="text-xs text-destructive/70 hover:text-destructive transition-colors"
								onClick={() => setShowRevokeAllConfirm(true)}
							>
								Revoke All
							</button>
						)}
					</div>
				)}

				<div className="h-px bg-border/40 -mx-6 lg:-mx-8" />
			</div>

			<div className="flex-1 min-h-0 pt-4 pb-8">
				{filteredAgents.length === 0 ? (
					<div className="border border-dashed border-border/60 rounded-lg p-12 text-center">
						<Bot className="h-6 w-6 mx-auto mb-3 text-muted-foreground/30" />
						<p className="text-sm text-muted-foreground">
							{search
								? "No agents match your search."
								: statusFilter === "active"
									? "No active agents. Use the CLI or MCP server to connect an agent."
									: statusFilter === "revoked"
										? "No revoked agents."
										: "No agents connected yet."}
						</p>
					</div>
				) : viewMode === "grouped" && groupedByHost ? (
					<div className="space-y-1">
						{groupedByHost.map((group) => (
							<div key={group.host?.id ?? "__none__"}>
								<HostGroupHeader
									host={group.host}
									agentCount={group.agents.length}
								/>
								<div className="space-y-2">
									{group.agents.map((a) => (
										<AgentCard
											key={a.id}
											agent={a}
											onUpdated={handleAgentUpdated}
											onRevoked={handleAgentRevoked}
											showHost={false}
										/>
									))}
								</div>
							</div>
						))}
					</div>
				) : (
					<div className="space-y-2">
						{filteredAgents.map((a) => (
							<AgentCard
								key={a.id}
								agent={a}
								onUpdated={handleAgentUpdated}
								onRevoked={handleAgentRevoked}
								showHost
							/>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
