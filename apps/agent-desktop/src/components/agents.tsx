import { Bot, Loader2, Power, RefreshCw, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { listAgents, revokeAgent } from "@/lib/api";
import type { Agent } from "@/lib/types";
import { cn, formatRelativeTime } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
	active: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
	pending: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
	expired: "bg-muted text-muted-foreground",
	revoked: "bg-destructive/10 text-destructive",
};

function AgentCard({
	agent,
	onRevoked,
}: {
	agent: Agent;
	onRevoked: (id: string) => void;
}) {
	const [revoking, setRevoking] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleRevoke = async () => {
		setError(null);
		setRevoking(true);
		const res = await revokeAgent(agent.id);
		if (res.error) {
			setError(res.error);
			setRevoking(false);
		} else {
			onRevoked(agent.id);
		}
	};

	const isActive = agent.status === "active";

	return (
		<div className="border border-border rounded-sm overflow-hidden bg-card/50">
			<div className="px-3 py-2.5 flex items-center justify-between">
				<div className="flex items-center gap-2.5 min-w-0 flex-1">
					<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-muted/60">
						<Bot className="h-3.5 w-3.5 text-muted-foreground" />
					</div>
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-1.5">
							<p className="font-medium text-xs truncate">
								{agent.name || "Unnamed Agent"}
							</p>
							<span
								className={cn(
									"text-[9px] font-medium px-1.5 py-0.5 rounded-sm shrink-0 uppercase tracking-wide",
									STATUS_STYLES[agent.status] ?? STATUS_STYLES.expired,
								)}
							>
								{agent.status}
							</span>
						</div>
						<p className="text-[11px] text-muted-foreground">
							{agent.scopes.length > 0
								? `${agent.scopes.length} scope${agent.scopes.length > 1 ? "s" : ""}`
								: "No scopes"}{" "}
							&middot; {formatRelativeTime(agent.lastUsedAt)}
						</p>
					</div>
				</div>

				{isActive && (
					<Button
						variant="ghost"
						size="xs"
						className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0 ml-2"
						onClick={handleRevoke}
						disabled={revoking}
						title="Revoke agent"
					>
						{revoking ? (
							<Loader2 className="h-3 w-3 animate-spin" />
						) : (
							<Power className="h-3 w-3" />
						)}
					</Button>
				)}
			</div>

			{agent.scopes.length > 0 && (
				<div className="px-3 pb-2.5">
					<div className="flex flex-wrap gap-1">
						{agent.scopes.slice(0, 5).map((s) => (
							<span
								key={s}
								className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded-sm text-muted-foreground"
							>
								{s}
							</span>
						))}
						{agent.scopes.length > 5 && (
							<span className="text-[10px] text-muted-foreground px-1">
								+{agent.scopes.length - 5} more
							</span>
						)}
					</div>
				</div>
			)}

			{error && (
				<div className="mx-3 mb-2.5 p-2 border border-destructive/30 bg-destructive/5 text-[11px] text-destructive rounded-sm">
					{error}
				</div>
			)}
		</div>
	);
}

export function Agents() {
	const [agents, setAgents] = useState<Agent[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [filter, setFilter] = useState<"active" | "all">("active");

	const fetchAgents = useCallback(async (showLoading = false) => {
		if (showLoading) setLoading(true);
		setError(null);
		try {
			const res = await listAgents();
			if (res.error) {
				setError(res.error);
			} else {
				setAgents(res.data ?? []);
			}
		} catch {
			setError("Failed to load agents");
		}
		setLoading(false);
	}, []);

	useEffect(() => {
		void fetchAgents(true);
	}, [fetchAgents]);

	const handleRevoked = (id: string) => {
		setAgents((prev) =>
			prev.map((a) => (a.id === id ? { ...a, status: "revoked" } : a)),
		);
	};

	const filtered =
		filter === "active" ? agents.filter((a) => a.status === "active") : agents;

	return (
		<div className="p-3 space-y-3">
			<div className="flex items-center justify-between">
				<div className="flex gap-0.5 p-0.5 bg-muted/50 rounded-sm">
					{(["active", "all"] as const).map((f) => (
						<button
							key={f}
							onClick={() => setFilter(f)}
							className={cn(
								"px-2.5 py-1 text-[11px] font-medium rounded-sm transition-all capitalize cursor-pointer",
								filter === f
									? "bg-background text-foreground shadow-sm"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							{f}{" "}
							{f === "active" && (
								<span className="text-muted-foreground ml-0.5">
									{agents.filter((a) => a.status === "active").length}
								</span>
							)}
						</button>
					))}
				</div>
				<Button variant="ghost" size="xs" onClick={() => fetchAgents(false)}>
					<RefreshCw className="h-3 w-3" />
				</Button>
			</div>

			{error && (
				<div className="p-2 border border-destructive/30 bg-destructive/5 text-[11px] text-destructive rounded-sm">
					{error}
				</div>
			)}

			{loading ? (
				<div className="flex items-center justify-center py-10">
					<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
				</div>
			) : filtered.length === 0 ? (
				<div className="border border-dashed border-border rounded-sm py-10 text-center">
					<ShieldAlert className="h-5 w-5 mx-auto mb-2 text-muted-foreground/30" />
					<p className="text-xs text-muted-foreground">
						{filter === "active" ? "No active agents" : "No agents found"}
					</p>
				</div>
			) : (
				<div className="space-y-2">
					{filtered.map((agent) => (
						<AgentCard key={agent.id} agent={agent} onRevoked={handleRevoked} />
					))}
				</div>
			)}
		</div>
	);
}
