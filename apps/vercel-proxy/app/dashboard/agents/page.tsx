"use client";

import { useState, useEffect } from "react";

function StatusBadge({ status }: { status: string }) {
	const styles: Record<string, string> = {
		active: "bg-emerald-500/10 text-emerald-400",
		pending: "bg-amber-500/10 text-amber-400",
		expired: "bg-zinc-500/10 text-zinc-400",
		revoked: "bg-red-500/10 text-red-400",
		rejected: "bg-red-500/10 text-red-400",
		claimed: "bg-blue-500/10 text-blue-400",
		denied: "bg-red-500/10 text-red-400",
	};
	return (
		<span
			className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${styles[status] ?? "bg-zinc-500/10 text-zinc-400"}`}
		>
			{status}
		</span>
	);
}

function ModeBadge({ mode }: { mode: string }) {
	return (
		<span
			className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
				mode === "delegated"
					? "bg-blue-500/10 text-blue-400"
					: "bg-purple-500/10 text-purple-400"
			}`}
		>
			{mode}
		</span>
	);
}

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

interface GrantData {
	capability: string;
	status: string;
	granted_by?: string | null;
	expires_at?: string | null;
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

export default function AgentsPage() {
	const [agents, setAgents] = useState<AgentData[]>([]);
	const [loading, setLoading] = useState(true);
	const [filter, setFilter] = useState("all");
	const [expanded, setExpanded] = useState<string | null>(null);
	const [revoking, setRevoking] = useState<string | null>(null);

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
						a.agent_id === agentId
							? { ...a, status: "revoked" }
							: a,
					),
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
						<h1 className="text-lg font-semibold text-white">
							Agents
						</h1>
						<p className="mt-1 text-sm text-muted">
							Connected AI agents and their capability grants.
						</p>
					</div>
					<div className="flex gap-1 rounded-lg border border-border bg-surface p-1">
						{filters.map((f) => (
							<button
								key={f}
								onClick={() => setFilter(f)}
								className={`cursor-pointer rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
									filter === f
										? "bg-white text-black"
										: "text-muted hover:text-foreground"
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
								d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
							/>
						</svg>
						<p className="text-sm text-muted">No agents found</p>
						<p className="mt-1 text-xs text-muted/60">
							Agents will appear here once they connect.
						</p>
					</div>
				) : (
					<div className="flex flex-col gap-2">
						{agents.map((agent) => {
							const isExpanded =
								expanded === agent.agent_id;
							const activeGrants =
								agent.agent_capability_grants.filter(
									(g) => g.status === "active",
								);
							const pendingGrants =
								agent.agent_capability_grants.filter(
									(g) => g.status === "pending",
								);

							return (
								<div
									key={agent.agent_id}
									className="rounded-lg border border-border bg-surface"
								>
									<button
										onClick={() =>
											setExpanded(
												isExpanded
													? null
													: agent.agent_id,
											)
										}
										className="flex w-full cursor-pointer items-center gap-4 px-4 py-3 text-left"
									>
										<div className="flex-1 min-w-0">
											<div className="flex items-center gap-2">
												<span className="text-sm font-medium text-white truncate">
													{agent.name}
												</span>
												<StatusBadge
													status={agent.status}
												/>
												<ModeBadge
													mode={agent.mode}
												/>
											</div>
											<p className="mt-0.5 text-xs text-muted">
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
											viewBox="0 0 24 24"
											stroke="currentColor"
										>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={2}
												d="M19 9l-7 7-7-7"
											/>
										</svg>
									</button>

									{isExpanded && (
										<div className="border-t border-border px-4 py-4">
											<div className="grid grid-cols-2 gap-x-6 gap-y-3 mb-4">
												<div>
													<p className="text-[10px] uppercase tracking-widest text-muted">
														Agent ID
													</p>
													<code className="text-xs font-mono text-foreground break-all">
														{agent.agent_id}
													</code>
												</div>
												<div>
													<p className="text-[10px] uppercase tracking-widest text-muted">
														Host ID
													</p>
													<code className="text-xs font-mono text-foreground break-all">
														{agent.host_id}
													</code>
												</div>
												<div>
													<p className="text-[10px] uppercase tracking-widest text-muted">
														Last Used
													</p>
													<p className="text-xs text-foreground">
														{timeAgo(
															agent.last_used_at,
														)}
													</p>
												</div>
												<div>
													<p className="text-[10px] uppercase tracking-widest text-muted">
														Expires
													</p>
													<p className="text-xs text-foreground">
														{agent.expires_at
															? new Date(
																	agent.expires_at,
																).toLocaleString()
															: "Never"}
													</p>
												</div>
											</div>

											{agent.agent_capability_grants
												.length > 0 && (
												<div className="mb-4">
													<p className="mb-2 text-[10px] uppercase tracking-widest text-muted">
														Capabilities
													</p>
													<div className="space-y-1">
														{agent.agent_capability_grants.map(
															(g, i) => (
																<div
																	key={i}
																	className="flex items-center justify-between rounded bg-background px-3 py-2"
																>
																	<code className="text-xs font-mono text-foreground truncate mr-2">
																		{
																			g.capability
																		}
																	</code>
																	<StatusBadge
																		status={
																			g.status
																		}
																	/>
																</div>
															),
														)}
													</div>
												</div>
											)}

											{agent.status === "active" && (
												<button
													onClick={() =>
														handleRevoke(
															agent.agent_id,
														)
													}
													disabled={
														revoking ===
														agent.agent_id
													}
													className="cursor-pointer rounded-md border border-red-500/20 px-3 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
												>
													{revoking ===
													agent.agent_id
														? "Revoking…"
														: "Revoke Agent"}
												</button>
											)}
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
