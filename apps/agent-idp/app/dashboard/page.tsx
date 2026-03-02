"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

interface Agent {
	id: string;
	name: string;
	status: string;
	mode: string;
	createdAt: string;
	lastUsedAt: string | null;
	requestedScopes?: string[];
	hostId?: string;
}

interface Host {
	id: string;
	status: string;
	scopes: string[];
	referenceId: string | null;
	createdAt: string;
}

interface MCPProvider {
	id: string;
	name: string;
	endpoint: string;
	createdAt: string;
}

interface ActivityEntry {
	id: string;
	agentId: string;
	agentName: string;
	provider: string;
	tool: string;
	args: Record<string, unknown>;
	result: unknown;
	status: "success" | "error";
	durationMs: number;
	inputSchema: Record<string, unknown>;
	createdAt: string;
}

interface CibaRequest {
	auth_req_id: string;
	client_id: string;
	binding_message: string | null;
	scope: string | null;
	delivery_mode: string;
	expires_in: number;
	created_at: string;
}

export default function Dashboard() {
	const router = useRouter();
	const { data: session, isPending } = authClient.useSession();
	const [agents, setAgents] = useState<Agent[]>([]);
	const [pendingAgents, setPendingAgents] = useState<Agent[]>([]);
	const [loadingAgents, setLoadingAgents] = useState(true);
	const [providers, setProviders] = useState<MCPProvider[]>([]);
	const [loadingProviders, setLoadingProviders] = useState(true);
	const [providerName, setProviderName] = useState("");
	const [providerEndpoint, setProviderEndpoint] = useState("");
	const [addingProvider, setAddingProvider] = useState(false);
	const [cibaRequests, setCibaRequests] = useState<CibaRequest[]>([]);
	const [hosts, setHosts] = useState<Host[]>([]);
	const [allScopes, setAllScopes] = useState<string[]>([]);
	const [approvalScopes, setApprovalScopes] = useState<
		Record<string, string[]>
	>({});
	const [editingHostScopes, setEditingHostScopes] = useState<string | null>(
		null,
	);
	const [hostScopesDraft, setHostScopesDraft] = useState<string[]>([]);
	const [showRevoked, setShowRevoked] = useState(false);
	const [activityLog, setActivityLog] = useState<ActivityEntry[]>([]);
	const [activityTotal, setActivityTotal] = useState(0);
	const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
	const [detailTab, setDetailTab] = useState<"input" | "output" | "schema">(
		"output",
	);
	const [logAgentFilter, setLogAgentFilter] = useState<string>("all");

	useEffect(() => {
		if (!isPending && !session) {
			router.push("/sign-in");
		}
	}, [session, isPending, router]);

	useEffect(() => {
		if (!session) return;
		void fetchAgents();
		void fetchProviders();
		void fetchActivityLog();
	}, [session]);

	useEffect(() => {
		if (!session) return;
		void fetchCibaRequests();
		const interval = setInterval(() => {
			void fetchCibaRequests();
		}, 3000);
		return () => clearInterval(interval);
	}, [session]);

	useEffect(() => {
		if (!session) return;
		const interval = setInterval(() => {
			void fetchActivityLog();
		}, 5000);
		return () => clearInterval(interval);
	}, [session]);

	async function fetchAgents() {
		setLoadingAgents(true);
		try {
			const [listRes, pendingRes, hostsRes] = await Promise.all([
				authClient.agent.list(),
				fetch("/api/pending-agents").then((r) => r.json()),
				authClient.agent.host.list(),
			]);
			if (listRes.data) {
				setAgents((listRes.data.agents ?? []) as unknown as Agent[]);
			}
			setPendingAgents(pendingRes.agents ?? []);
			setAllScopes(pendingRes.allScopes ?? []);
			if (hostsRes.data) {
				const hostList = (hostsRes.data as any).hosts ?? [];
				setHosts(
					hostList.map((h: any) => ({
						id: h.id,
						status: h.status,
						scopes:
							typeof h.scopes === "string"
								? JSON.parse(h.scopes)
								: (h.scopes ?? []),
						referenceId: h.referenceId,
						createdAt: h.createdAt,
					})),
				);
			}
		} catch {}
		setLoadingAgents(false);
	}

	async function revokeAgent(agentId: string) {
		await authClient.agent.revoke({ agentId });
		void fetchAgents();
	}

	async function revokeAllAgents() {
		for (const agent of activeAgents) {
			await authClient.agent.revoke({ agentId: agent.id });
		}
		void fetchAgents();
	}

	async function approveAgent(agentId: string) {
		const hostScopes = approvalScopes[agentId] ?? [];
		const res = await fetch("/api/approve-agent", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ agentId, hostScopes }),
		});
		if (res.ok) {
			setApprovalScopes((prev) => {
				const next = { ...prev };
				delete next[agentId];
				return next;
			});
			void fetchAgents();
		}
	}

	function toggleApprovalScope(agentId: string, scope: string) {
		setApprovalScopes((prev) => {
			const current = prev[agentId] ?? [];
			const next = current.includes(scope)
				? current.filter((s) => s !== scope)
				: [...current, scope];
			return { ...prev, [agentId]: next };
		});
	}

	async function updateHostScopes(hostId: string, scopes: string[]) {
		await authClient.agent.host.update({ hostId, scopes });
		setEditingHostScopes(null);
		void fetchAgents();
	}

	async function revokeHost(hostId: string) {
		await authClient.agent.host.revoke({ hostId });
		void fetchAgents();
	}

	async function fetchProviders() {
		setLoadingProviders(true);
		try {
			const res = await fetch("/api/mcp-providers");
			if (res.ok) {
				const data = await res.json();
				setProviders(data.providers ?? []);
			}
		} catch {
		} finally {
			setLoadingProviders(false);
		}
	}

	async function addMCPProvider(e: React.FormEvent) {
		e.preventDefault();
		if (!providerName.trim() || !providerEndpoint.trim()) return;
		setAddingProvider(true);
		try {
			const res = await fetch("/api/mcp-providers", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: providerName.trim(),
					endpoint: providerEndpoint.trim(),
				}),
			});
			if (res.ok) {
				setProviderName("");
				setProviderEndpoint("");
				void fetchProviders();
			}
		} catch {
		} finally {
			setAddingProvider(false);
		}
	}

	async function removeMCPProvider(id: string) {
		try {
			await fetch("/api/mcp-providers", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ id }),
			});
			void fetchProviders();
		} catch {}
	}

	async function fetchCibaRequests() {
		try {
			const res = await authClient.agent.ciba.pending();
			if (res.data) {
				setCibaRequests(
					(res.data as unknown as { requests: CibaRequest[] }).requests ?? [],
				);
			}
		} catch {}
	}

	async function approveCiba(authReqId: string) {
		try {
			await authClient.agent.ciba.approve({ auth_req_id: authReqId });
			void fetchCibaRequests();
			void fetchAgents();
		} catch {}
	}

	async function denyCiba(authReqId: string) {
		try {
			await authClient.agent.ciba.deny({ auth_req_id: authReqId });
			void fetchCibaRequests();
		} catch {}
	}

	async function fetchActivityLog() {
		try {
			const res = await fetch("/api/activity-log?limit=50");
			if (res.ok) {
				const data = await res.json();
				setActivityLog(data.entries ?? []);
				setActivityTotal(data.total ?? 0);
			}
		} catch {}
	}

	async function handleSignOut() {
		await authClient.signOut();
		router.push("/sign-in");
	}

	if (isPending) {
		return (
			<div className="flex min-h-dvh items-center justify-center">
				<p className="text-sm text-muted-foreground">Loading...</p>
			</div>
		);
	}

	if (!session) return null;

	const activeAgents = agents.filter((a) => a.status === "active");
	const revokedAgents = agents.filter((a) => a.status === "revoked");
	const otherAgents = agents.filter(
		(a) => a.status !== "active" && a.status !== "revoked",
	);

	return (
		<div className="mx-auto max-w-3xl px-6 py-8">
			<div className="mb-8 flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold tracking-tight">Agent Auth</h1>
					<p className="text-sm text-muted-foreground">
						Signed in as {session.user.email}
					</p>
				</div>
				<button
					onClick={handleSignOut}
					className="rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:bg-muted"
				>
					Sign Out
				</button>
			</div>

			{/* CIBA Connection Requests */}
			{cibaRequests.length > 0 && (
				<div className="mb-6 animate-fade-in rounded-xl border-2 border-chart-1/40 bg-chart-1/5">
					<div className="border-b border-chart-1/30 px-4 py-3">
						<div className="flex items-center gap-2">
							<span className="relative flex h-2.5 w-2.5">
								<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-chart-1 opacity-75" />
								<span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-chart-1" />
							</span>
							<h2 className="font-semibold text-chart-1">
								Connection Requests ({cibaRequests.length})
							</h2>
						</div>
						<p className="text-xs text-muted-foreground">
							Agents requesting access via backchannel authentication
						</p>
					</div>
					<div className="divide-y divide-chart-1/20">
						{cibaRequests.map((req) => (
							<div
								key={req.auth_req_id}
								className="flex items-center justify-between px-4 py-3"
							>
								<div>
									<p className="text-sm font-medium">
										{req.binding_message ?? req.client_id}
									</p>
									<p className="text-xs text-muted-foreground">
										{req.scope
											? `Scopes: ${req.scope}`
											: "No specific scopes requested"}
										{" · "}
										Expires in {Math.floor(req.expires_in / 60)}m{" "}
										{req.expires_in % 60}s
									</p>
								</div>
								<div className="flex gap-2">
									<button
										onClick={() => denyCiba(req.auth_req_id)}
										className="rounded-lg border border-destructive/20 px-2.5 py-1 text-xs text-destructive-foreground transition-colors hover:bg-destructive/5"
									>
										Deny
									</button>
									<button
										onClick={() => approveCiba(req.auth_req_id)}
										className="rounded-lg bg-chart-1 px-3 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90"
									>
										Approve
									</button>
								</div>
							</div>
						))}
					</div>
				</div>
			)}

			{/* Pending Agents (behalf_of only — autonomous agents are never pending) */}
			{pendingAgents.length > 0 && (
				<div className="mb-6 rounded-xl border-2 border-chart-4/40 bg-chart-4/5">
					<div className="border-b border-chart-4/30 px-4 py-3">
						<h2 className="font-semibold text-chart-4">
							Pending Approval ({pendingAgents.length})
						</h2>
						<p className="text-xs text-muted-foreground">
							Agents from unrecognized hosts awaiting your approval
						</p>
					</div>
					<div className="divide-y divide-chart-4/20">
						{pendingAgents.map((agent) => {
							const selected = approvalScopes[agent.id] ?? [];
							return (
								<div key={agent.id} className="px-4 py-3">
									<div className="flex items-start justify-between">
										<div>
											<p className="text-sm font-medium">{agent.name}</p>
											<p className="text-xs text-muted-foreground">
												{agent.mode} ·{" "}
												{new Date(agent.createdAt).toLocaleString()}
											</p>
											{agent.requestedScopes &&
												agent.requestedScopes.length > 0 && (
													<p className="mt-1 text-xs text-muted-foreground">
														Requested:{" "}
														<span className="font-medium text-foreground">
															{agent.requestedScopes.join(", ")}
														</span>
													</p>
												)}
										</div>
										<div className="flex gap-2">
											<button
												onClick={() => revokeAgent(agent.id)}
												className="rounded-lg border border-destructive/20 px-2.5 py-1 text-xs text-destructive-foreground transition-colors hover:bg-destructive/5"
											>
												Deny
											</button>
											<button
												onClick={() => approveAgent(agent.id)}
												className="rounded-lg bg-success px-3 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90"
											>
												Approve
											</button>
										</div>
									</div>
									{allScopes.length > 0 && (
										<div className="mt-2">
											<p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
												Trust host with default scopes
											</p>
											<div className="flex flex-wrap gap-1.5">
												{allScopes.map((scope) => (
													<button
														key={scope}
														type="button"
														onClick={() => toggleApprovalScope(agent.id, scope)}
														className={cn(
															"rounded-md border px-2 py-0.5 text-xs transition-colors",
															selected.includes(scope)
																? "border-chart-4/50 bg-chart-4/15 text-chart-4"
																: "border-border text-muted-foreground hover:border-chart-4/30",
														)}
													>
														{scope}
													</button>
												))}
											</div>
										</div>
									)}
								</div>
							);
						})}
					</div>
				</div>
			)}

			{/* MCP Servers */}
			<div className="mb-6 rounded-xl border border-border bg-card">
				<div className="flex items-center justify-between border-b border-border px-4 py-3">
					<h2 className="font-semibold">MCP Servers</h2>
					<button
						onClick={fetchProviders}
						className="text-sm text-muted-foreground transition-colors hover:text-foreground"
					>
						Refresh
					</button>
				</div>

				<form
					onSubmit={addMCPProvider}
					className="border-b border-border px-4 py-3"
				>
					<div className="flex gap-2">
						<input
							type="text"
							placeholder="Name (e.g. acme-bank)"
							value={providerName}
							onChange={(e) => setProviderName(e.target.value)}
							className="flex-1 rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
						/>
						<input
							type="text"
							placeholder="Endpoint (e.g. http://localhost:4100/mcp)"
							value={providerEndpoint}
							onChange={(e) => setProviderEndpoint(e.target.value)}
							className="flex-2 rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
						/>
						<button
							type="submit"
							disabled={
								addingProvider ||
								!providerName.trim() ||
								!providerEndpoint.trim()
							}
							className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
						>
							Add
						</button>
					</div>
				</form>

				{loadingProviders ? (
					<p className="p-4 text-sm text-muted-foreground">
						Loading providers...
					</p>
				) : providers.length === 0 ? (
					<p className="p-4 text-sm text-muted-foreground">
						No MCP servers connected. Add one above to expose its tools to
						agents.
					</p>
				) : (
					<div className="divide-y divide-border">
						{providers.map((provider) => (
							<div
								key={provider.id}
								className="flex items-center justify-between px-4 py-3"
							>
								<div>
									<p className="text-sm font-medium">{provider.name}</p>
									<p className="font-mono text-xs text-muted-foreground">
										{provider.endpoint}
									</p>
								</div>
								<button
									onClick={() => removeMCPProvider(provider.id)}
									className="rounded-lg border border-destructive/20 px-2.5 py-1 text-xs text-destructive-foreground transition-colors hover:bg-destructive/5"
								>
									Remove
								</button>
							</div>
						))}
					</div>
				)}
			</div>

			{/* Trusted Hosts */}
			{hosts.filter((h) => h.status === "active").length > 0 && (
				<div className="mb-6 rounded-xl border border-border bg-card">
					<div className="flex items-center justify-between border-b border-border px-4 py-3">
						<h2 className="font-semibold">
							Trusted Hosts ({hosts.filter((h) => h.status === "active").length}
							)
						</h2>
						<button
							onClick={fetchAgents}
							className="text-sm text-muted-foreground transition-colors hover:text-foreground"
						>
							Refresh
						</button>
					</div>
					<div className="divide-y divide-border">
						{hosts
							.filter((h) => h.status === "active")
							.map((host) => (
								<div key={host.id} className="px-4 py-3">
									<div className="flex items-start justify-between">
										<div className="min-w-0 flex-1">
											<p className="truncate font-mono text-xs text-muted-foreground">
												{host.id}
											</p>
											{host.scopes.length > 0 ? (
												<div className="mt-1 flex flex-wrap gap-1">
													{host.scopes.map((scope) => (
														<span
															key={scope}
															className="rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-[11px] text-muted-foreground"
														>
															{scope}
														</span>
													))}
												</div>
											) : (
												<p className="mt-0.5 text-xs text-muted-foreground">
													No default scopes
												</p>
											)}
										</div>
										<div className="ml-3 flex gap-2">
											<button
												onClick={() => {
													setEditingHostScopes(host.id);
													setHostScopesDraft([...host.scopes]);
												}}
												className="rounded-lg border border-border px-2.5 py-1 text-xs transition-colors hover:bg-muted"
											>
												Edit
											</button>
											<button
												onClick={() => revokeHost(host.id)}
												className="rounded-lg border border-destructive/20 px-2.5 py-1 text-xs text-destructive-foreground transition-colors hover:bg-destructive/5"
											>
												Revoke
											</button>
										</div>
									</div>
									{editingHostScopes === host.id && allScopes.length > 0 && (
										<div className="mt-2 rounded-lg border border-border bg-muted/30 p-3">
											<p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
												Default scopes for agents through this host
											</p>
											<div className="flex flex-wrap gap-1.5">
												{allScopes.map((scope) => (
													<button
														key={scope}
														type="button"
														onClick={() =>
															setHostScopesDraft((prev) =>
																prev.includes(scope)
																	? prev.filter((s) => s !== scope)
																	: [...prev, scope],
															)
														}
														className={cn(
															"rounded-md border px-2 py-0.5 text-xs transition-colors",
															hostScopesDraft.includes(scope)
																? "border-primary/50 bg-primary/10 text-primary"
																: "border-border text-muted-foreground hover:border-primary/30",
														)}
													>
														{scope}
													</button>
												))}
											</div>
											<div className="mt-2 flex justify-end gap-2">
												<button
													onClick={() => setEditingHostScopes(null)}
													className="rounded-lg border border-border px-2.5 py-1 text-xs transition-colors hover:bg-muted"
												>
													Cancel
												</button>
												<button
													onClick={() =>
														updateHostScopes(host.id, hostScopesDraft)
													}
													className="rounded-lg bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
												>
													Save
												</button>
											</div>
										</div>
									)}
								</div>
							))}
					</div>
				</div>
			)}

			{/* Activity Log */}
			<ActivityLog
				entries={activityLog}
				total={activityTotal}
				agentFilter={logAgentFilter}
				onAgentFilterChange={setLogAgentFilter}
				expandedEntry={expandedEntry}
				onToggleEntry={(id) => {
					setExpandedEntry(expandedEntry === id ? null : id);
					setDetailTab("output");
				}}
				detailTab={detailTab}
				onDetailTabChange={setDetailTab}
				onRefresh={fetchActivityLog}
			/>

			{/* Active Agents */}
			<div className="mb-6 rounded-xl border border-border bg-card">
				<div className="flex items-center justify-between border-b border-border px-4 py-3">
					<h2 className="font-semibold">
						Active Agents ({activeAgents.length})
					</h2>
					<div className="flex items-center gap-2">
						{activeAgents.length > 1 && (
							<button
								onClick={revokeAllAgents}
								className="rounded-lg border border-destructive/20 px-2.5 py-1 text-xs text-destructive-foreground transition-colors hover:bg-destructive/5"
							>
								Revoke All
							</button>
						)}
						<button
							onClick={fetchAgents}
							className="text-sm text-muted-foreground transition-colors hover:text-foreground"
						>
							Refresh
						</button>
					</div>
				</div>

				{loadingAgents ? (
					<p className="p-4 text-sm text-muted-foreground">Loading agents...</p>
				) : activeAgents.length === 0 ? (
					<p className="p-4 text-sm text-muted-foreground">No active agents.</p>
				) : (
					<div className="divide-y divide-border">
						{activeAgents.map((agent) => (
							<div
								key={agent.id}
								className="flex items-center justify-between px-4 py-3"
							>
								<div>
									<div className="flex items-center gap-2">
										<p className="text-sm font-medium">{agent.name}</p>
										{agent.mode === "autonomous" && (
											<span className="rounded-full bg-chart-4/10 px-1.5 py-0.5 text-[10px] font-medium text-chart-4">
												autonomous
											</span>
										)}
									</div>
									<p className="font-mono text-xs text-muted-foreground">
										{agent.id}
										{agent.lastUsedAt &&
											` · Last used ${new Date(agent.lastUsedAt).toLocaleString()}`}
									</p>
								</div>
								<button
									onClick={() => revokeAgent(agent.id)}
									className="rounded-lg border border-destructive/20 px-2.5 py-1 text-xs text-destructive-foreground transition-colors hover:bg-destructive/5"
								>
									Revoke
								</button>
							</div>
						))}
					</div>
				)}
			</div>

			{/* Revoked / Other Agents */}
			{(revokedAgents.length > 0 || otherAgents.length > 0) && (
				<div className="mb-6 rounded-xl border border-border bg-card">
					<button
						type="button"
						onClick={() => setShowRevoked(!showRevoked)}
						className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/50"
					>
						<h2 className="text-sm font-semibold text-muted-foreground">
							Revoked / Expired ({revokedAgents.length + otherAgents.length})
						</h2>
						<svg
							className={cn(
								"h-4 w-4 text-muted-foreground transition-transform",
								showRevoked && "rotate-180",
							)}
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							strokeWidth={2}
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M19 9l-7 7-7-7"
							/>
						</svg>
					</button>

					{showRevoked && (
						<div className="divide-y divide-border border-t border-border">
							{[...revokedAgents, ...otherAgents].map((agent) => (
								<div
									key={agent.id}
									className="flex items-center justify-between px-4 py-3 opacity-60"
								>
									<div>
										<div className="flex items-center gap-2">
											<p className="text-sm font-medium">{agent.name}</p>
											<span
												className={cn(
													"rounded-full px-1.5 py-0.5 text-[10px] font-medium",
													agent.status === "revoked"
														? "bg-destructive/10 text-destructive-foreground"
														: "bg-muted text-muted-foreground",
												)}
											>
												{agent.status}
											</span>
										</div>
										<p className="font-mono text-xs text-muted-foreground">
											{agent.id}
										</p>
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			)}
		</div>
	);
}

function ActivityLog({
	entries,
	total,
	agentFilter,
	onAgentFilterChange,
	expandedEntry,
	onToggleEntry,
	detailTab,
	onDetailTabChange,
	onRefresh,
}: {
	entries: ActivityEntry[];
	total: number;
	agentFilter: string;
	onAgentFilterChange: (id: string) => void;
	expandedEntry: string | null;
	onToggleEntry: (id: string) => void;
	detailTab: "input" | "output" | "schema";
	onDetailTabChange: (tab: "input" | "output" | "schema") => void;
	onRefresh: () => void;
}) {
	const agentMap = new Map<string, string>();
	for (const e of entries) {
		if (!agentMap.has(e.agentId)) {
			agentMap.set(e.agentId, e.agentName);
		}
	}
	const uniqueAgents = Array.from(agentMap.entries());

	const filtered =
		agentFilter === "all"
			? entries
			: entries.filter((e) => e.agentId === agentFilter);

	return (
		<div className="mb-6 rounded-xl border border-border bg-card">
			<div className="flex items-center justify-between border-b border-border px-4 py-3">
				<h2 className="font-semibold">
					Activity Log{total > 0 ? ` (${total})` : ""}
				</h2>
				<button
					onClick={onRefresh}
					className="text-sm text-muted-foreground transition-colors hover:text-foreground"
				>
					Refresh
				</button>
			</div>

			{entries.length > 0 && uniqueAgents.length > 0 && (
				<div className="no-scrollbar flex gap-1 overflow-x-auto border-b border-border px-4 py-2">
					<button
						type="button"
						onClick={() => onAgentFilterChange("all")}
						className={cn(
							"shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
							agentFilter === "all"
								? "bg-primary text-primary-foreground"
								: "text-muted-foreground hover:bg-muted hover:text-foreground",
						)}
					>
						All ({entries.length})
					</button>
					{uniqueAgents.map(([agentId, agentName]) => {
						const count = entries.filter((e) => e.agentId === agentId).length;
						return (
							<button
								key={agentId}
								type="button"
								onClick={() => onAgentFilterChange(agentId)}
								className={cn(
									"shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
									agentFilter === agentId
										? "bg-primary text-primary-foreground"
										: "text-muted-foreground hover:bg-muted hover:text-foreground",
								)}
							>
								{agentName} ({count})
							</button>
						);
					})}
				</div>
			)}

			{entries.length === 0 ? (
				<p className="p-4 text-sm text-muted-foreground">
					No tool calls yet. Agents will appear here when they call gateway
					tools.
				</p>
			) : filtered.length === 0 ? (
				<p className="p-4 text-sm text-muted-foreground">
					No calls from this agent yet.
				</p>
			) : (
				<div className="max-h-[480px] divide-y divide-border overflow-y-auto">
					{filtered.map((entry) => {
						const isExpanded = expandedEntry === entry.id;
						return (
							<div key={entry.id}>
								<button
									type="button"
									onClick={() => onToggleEntry(entry.id)}
									className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/50"
								>
									<div
										className={cn(
											"flex h-7 w-7 shrink-0 items-center justify-center rounded-md font-mono text-[10px] font-bold",
											entry.status === "success"
												? "bg-success/10 text-success"
												: "bg-destructive/10 text-destructive-foreground",
										)}
									>
										{entry.status === "success" ? "OK" : "ERR"}
									</div>
									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-2">
											<span className="truncate text-sm font-medium">
												{entry.provider}.{entry.tool}
											</span>
											<span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
												{entry.durationMs}ms
											</span>
										</div>
										<p className="truncate text-xs text-muted-foreground">
											{agentFilter === "all" && (
												<>
													<span className="font-medium text-foreground/70">
														{entry.agentName}
													</span>
													{" · "}
												</>
											)}
											{new Date(entry.createdAt).toLocaleString()}
										</p>
									</div>
									<svg
										className={cn(
											"h-4 w-4 shrink-0 text-muted-foreground transition-transform",
											isExpanded && "rotate-180",
										)}
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										strokeWidth={2}
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											d="M19 9l-7 7-7-7"
										/>
									</svg>
								</button>

								{isExpanded && (
									<div className="border-t border-border bg-muted/30 px-4 py-3">
										<div className="mb-1.5 flex items-center justify-between">
											<div className="flex gap-1">
												{(["output", "input", "schema"] as const).map((tab) => (
													<button
														key={tab}
														type="button"
														onClick={() => onDetailTabChange(tab)}
														className={cn(
															"rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
															detailTab === tab
																? "bg-primary text-primary-foreground"
																: "text-muted-foreground hover:bg-muted hover:text-foreground",
														)}
													>
														{tab.charAt(0).toUpperCase() + tab.slice(1)}
													</button>
												))}
											</div>
											<span className="font-mono text-[10px] text-muted-foreground">
												{entry.agentId.slice(0, 12)}...
											</span>
										</div>
										<pre className="max-h-72 overflow-auto rounded-lg border border-border bg-background p-3 font-mono text-xs leading-relaxed text-foreground">
											{detailTab === "input"
												? JSON.stringify(entry.args, null, 2)
												: detailTab === "output"
													? JSON.stringify(entry.result, null, 2)
													: JSON.stringify(entry.inputSchema, null, 2)}
										</pre>
									</div>
								)}
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
