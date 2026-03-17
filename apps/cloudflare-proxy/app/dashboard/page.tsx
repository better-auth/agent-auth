"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";

function CopyButton({ value }: { value: string }) {
	const [copied, setCopied] = useState(false);
	const copy = () => {
		navigator.clipboard.writeText(value);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};
	return (
		<button
			className="cursor-pointer rounded px-2 py-1 text-muted text-xs transition-colors hover:text-white"
			onClick={copy}
		>
			{copied ? "Copied" : "Copy"}
		</button>
	);
}

interface Stats {
	activeAgents: number;
	pendingAgents: number;
	recentLogs: number;
	totalAgents: number;
	totalHosts: number;
}

export default function DashboardOverview() {
	const { data: session } = useSession();
	const baseUrl = typeof window === "undefined" ? "" : window.location.origin;
	const [stats, setStats] = useState<Stats | null>(null);

	useEffect(() => {
		async function fetchStats() {
			try {
				const [agentsRes, hostsRes, logsRes] = await Promise.all([
					fetch("/api/auth/agent/list"),
					fetch("/api/auth/host/list"),
					fetch("/api/logs?limit=1"),
				]);
				const agents = agentsRes.ok ? await agentsRes.json() : { agents: [] };
				const hosts = hostsRes.ok ? await hostsRes.json() : { hosts: [] };
				const logs = logsRes.ok ? await logsRes.json() : { total: 0 };

				setStats({
					totalAgents: agents.agents?.length ?? 0,
					activeAgents:
						agents.agents?.filter(
							(a: { status: string }) => a.status === "active"
						).length ?? 0,
					pendingAgents:
						agents.agents?.filter(
							(a: { status: string }) => a.status === "pending"
						).length ?? 0,
					totalHosts: hosts.hosts?.length ?? 0,
					recentLogs: logs.total ?? 0,
				});
			} catch {
				/* ignore */
			}
		}
		fetchStats();
	}, []);

	const endpoints = [
		{
			label: "Agent Config",
			path: "/api/auth/agent/agent-configuration",
		},
		{ label: "Capabilities", path: "/api/auth/capability/list" },
		{ label: "Register Agent", path: "/api/auth/agent/register" },
		{ label: "Execute", path: "/api/auth/capability/execute" },
	];

	const statCards = [
		{ label: "Total Agents", value: stats?.totalAgents ?? "—" },
		{
			label: "Active",
			value: stats?.activeAgents ?? "—",
			color: "text-emerald-400",
		},
		{
			label: "Pending",
			value: stats?.pendingAgents ?? "—",
			color: "text-amber-400",
		},
		{ label: "Hosts", value: stats?.totalHosts ?? "—" },
		{ label: "Events", value: stats?.recentLogs ?? "—" },
	];

	return (
		<div className="mx-auto w-full max-w-3xl px-6 py-8">
			<div className="flex flex-col gap-8">
				<div>
					<h1 className="font-semibold text-lg text-white">Overview</h1>
					<p className="mt-1 text-muted text-sm">
						Your Cloudflare account is connected. AI agents can access resources
						through Agent Auth.
					</p>
				</div>

				<div className="grid grid-cols-5 gap-3">
					{statCards.map((s) => (
						<div
							className="rounded-lg border border-border bg-surface px-4 py-3"
							key={s.label}
						>
							<p className="text-muted text-xs">{s.label}</p>
							<p
								className={`mt-1 font-semibold text-xl ${s.color ?? "text-white"}`}
							>
								{s.value}
							</p>
						</div>
					))}
				</div>

				<div className="flex flex-col gap-3">
					<h2 className="font-medium text-muted text-xs uppercase tracking-wider">
						Account
					</h2>
					<div className="rounded-lg border border-border bg-surface">
						<div className="flex items-center justify-between border-border border-b px-4 py-3">
							<span className="text-muted text-sm">Email</span>
							<span className="text-foreground text-sm">
								{session?.user.email}
							</span>
						</div>
						<div className="flex items-center justify-between px-4 py-3">
							<span className="text-muted text-sm">User ID</span>
							<div className="flex items-center gap-1">
								<code className="font-mono text-foreground text-xs">
									{session?.user.id}
								</code>
								<CopyButton value={session?.user.id ?? ""} />
							</div>
						</div>
					</div>
				</div>

				<div className="flex flex-col gap-3">
					<h2 className="font-medium text-muted text-xs uppercase tracking-wider">
						Agent Auth Endpoints
					</h2>
					<div className="rounded-lg border border-border bg-surface">
						{endpoints.map((ep, i) => (
							<div
								className={`flex items-center justify-between px-4 py-3 ${
									i < endpoints.length - 1 ? "border-border border-b" : ""
								}`}
								key={ep.path}
							>
								<span className="text-muted text-sm">{ep.label}</span>
								<div className="flex items-center gap-1">
									<code className="font-mono text-foreground/70 text-xs">
										{ep.path}
									</code>
									<CopyButton value={`${baseUrl}${ep.path}`} />
								</div>
							</div>
						))}
					</div>
				</div>

				<div className="flex flex-col gap-3">
					<h2 className="font-medium text-muted text-xs uppercase tracking-wider">
						Quick Start
					</h2>
					<div className="rounded-lg border border-border bg-surface p-4">
						<pre className="overflow-x-auto font-mono text-foreground/80 text-xs leading-6">
							<code>{`# Discover this provider
curl ${baseUrl}/api/auth/agent/agent-configuration

# List available capabilities
curl ${baseUrl}/api/auth/capability/list`}</code>
						</pre>
					</div>
				</div>
			</div>
		</div>
	);
}
