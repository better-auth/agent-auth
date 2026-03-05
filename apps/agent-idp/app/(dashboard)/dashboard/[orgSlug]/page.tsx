import {
	Activity,
	AlertTriangle,
	ArrowRight,
	ArrowUpRight,
	Plug2,
	Check,
	KeyRound,
	Users,
	Zap,
} from "lucide-react";
import Link from "next/link";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { AgentBotIcon } from "@/components/icons/agent-bot";
import { listConnectionsByOrg } from "@/lib/db/connections";
import {
	getOrgBySlug,
	getOrgType,
	getOverviewData,
	getSession,
} from "@/lib/db/queries";
import { OverviewChatDialog } from "./overview-chat-dialog";

function formatRelativeTime(d: string | null): string {
	if (!d) return "Never";
	const date = new Date(d);
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

export default async function OverviewPage({
	params,
}: {
	params: Promise<{ orgSlug: string }>;
}) {
	const { orgSlug } = await params;
	const [org, session] = await Promise.all([
		getOrgBySlug(orgSlug),
		getSession(),
	]);
	const orgType = getOrgType(org?.metadata ?? null);
	const isPersonal = orgType === "personal";
	const [data, connections] = org
		? await Promise.all([
				getOverviewData(org.id, session?.user?.id),
				listConnectionsByOrg(org.id),
			])
		: [null, []];
	const hasAgents = (data?.agents.total ?? 0) > 0;
	const hasConnections = connections.length > 0;
	const hasActivity = (data?.toolCalls.total ?? 0) > 0;
	const systemStatus =
		hasAgents && hasConnections
			? data?.recentErrors && data.recentErrors > 0
				? "warn"
				: "good"
			: "idle";

	const setupSteps = [
		{
			label: "Connect a provider",
			done: hasConnections,
			href: `/dashboard/${orgSlug}/connections`,
		},
		{
			label: "Connect an agent",
			done: hasAgents,
			href: `/dashboard/${orgSlug}/agents`,
		},
		{
			label: "First tool call",
			done: hasActivity,
			href: `/dashboard/${orgSlug}/agents`,
		},
	];
	const setupComplete = setupSteps.every((s) => s.done);
	const completedSteps = setupSteps.filter((s) => s.done).length;

	const stats = [
		{
			label: "Active Agents",
			value: data?.agents.active ?? 0,
			sub: `${data?.agents.total ?? 0} total`,
			icon: AgentBotIcon,
			href: `/dashboard/${orgSlug}/agents`,
		},
		{
			label: "Tool Calls (24h)",
			value: data?.last24hCalls ?? 0,
			sub: `${data?.toolCalls.total ?? 0} all time`,
			icon: Zap,
			href: `/dashboard/${orgSlug}/agents`,
		},
		{
			label: "Connections",
			value: connections.filter((c) => c.status === "active").length,
			sub: `${connections.length} configured`,
			icon: Plug2,
			href: `/dashboard/${orgSlug}/connections`,
		},
		...(!isPersonal
			? [
					{
						label: "Members",
						value: data?.members.count ?? 0,
						sub: "In organization",
						icon: Users,
						href: `/dashboard/${orgSlug}/members`,
					},
				]
			: []),
	];

	return (
		<div className="flex flex-col h-[calc(100dvh-1px)] py-6 gap-5">
			{/* Header */}
			<div className="flex items-center justify-between shrink-0">
				<div>
					<h1 className="text-lg font-medium tracking-tight">Overview</h1>
					<p className="text-[13px] text-muted-foreground mt-0.5">
						{systemStatus === "good"
							? "All systems operational"
							: systemStatus === "warn"
								? `${data?.recentErrors} recent error${data?.recentErrors !== 1 ? "s" : ""}`
								: "Getting started"}
					</p>
				</div>
				<span
					className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
						systemStatus === "good"
							? "bg-foreground/[0.06] text-foreground"
							: systemStatus === "warn"
								? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
								: "bg-muted text-muted-foreground"
					}`}
				>
					{systemStatus === "good"
						? "Operational"
						: systemStatus === "warn"
							? `${data?.recentErrors} error${data?.recentErrors !== 1 ? "s" : ""}`
							: "Setup"}
				</span>
			</div>

			{/* Stats */}
			<div className="grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
				{stats.map((stat) => (
					<Link
						key={stat.label}
						href={stat.href}
						className="group border border-border/60 rounded-lg p-3.5 hover:border-border transition-colors"
					>
						<div className="flex items-center justify-between mb-2">
							<stat.icon className="h-3.5 w-3.5 text-muted-foreground/50" />
							<ArrowUpRight className="h-3 w-3 text-transparent group-hover:text-muted-foreground transition-colors" />
						</div>
						<p className="text-xl font-semibold tracking-tight tabular-nums leading-none">
							{stat.value}
						</p>
						<p className="text-[11px] text-muted-foreground mt-1">
							{stat.label}
						</p>
						<p className="text-[10px] text-muted-foreground/60">{stat.sub}</p>
					</Link>
				))}
			</div>

			{/* Getting Started */}
			{!setupComplete && (
				<div className="border border-border/60 rounded-lg overflow-hidden shrink-0">
					<div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40">
						<p className="text-xs font-medium">Getting started</p>
						<span className="text-[10px] text-muted-foreground tabular-nums">
							{completedSteps} of {setupSteps.length}
						</span>
					</div>
					<div className="p-1">
						{setupSteps.map((step) => (
							<Link
								key={step.label}
								href={step.href}
								className="flex items-center gap-3 py-1.5 px-3 rounded-md hover:bg-muted/30 transition-colors group"
							>
								<div
									className={`flex h-4.5 w-4.5 items-center justify-center rounded-full border-2 shrink-0 transition-colors ${
										step.done
											? "bg-foreground border-foreground"
											: "border-border/80 group-hover:border-muted-foreground/40"
									}`}
								>
									{step.done && (
										<Check className="h-2.5 w-2.5 text-background" />
									)}
								</div>
								<span
									className={`text-[13px] flex-1 ${
										step.done
											? "text-muted-foreground/50 line-through"
											: "text-foreground"
									}`}
								>
									{step.label}
								</span>
								{!step.done && (
									<ArrowRight className="h-3.5 w-3.5 text-transparent group-hover:text-muted-foreground transition-colors" />
								)}
							</Link>
						))}
					</div>
				</div>
			)}

			{/* Main content — fills remaining space */}
			<div className="grid grid-cols-1 lg:grid-cols-5 gap-5 flex-1 min-h-0">
				{/* Left column */}
				<div className="lg:col-span-3 flex flex-col gap-5 min-h-0">
					{/* Active Agents — compact, max 4 shown */}
					<section className="shrink-0">
						<div className="flex items-center justify-between mb-2">
							<h2 className="text-xs font-medium text-muted-foreground">
								Active Agents
							</h2>
							<Link
								href={`/dashboard/${orgSlug}/agents`}
								className="text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors"
							>
								View all
							</Link>
						</div>
						{data?.activeAgents && data.activeAgents.length > 0 ? (
							<div className="border border-border/60 rounded-lg divide-y divide-border/40">
								{data.activeAgents.slice(0, 4).map((ag) => (
									<Link
										key={ag.id}
										href={`/dashboard/${orgSlug}/agents`}
										className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-muted/20 transition-colors group first:rounded-t-lg last:rounded-b-lg"
									>
										<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/40">
											<AgentBotIcon className="h-3.5 w-3.5 text-muted-foreground/60" />
										</div>
										<div className="flex-1 min-w-0">
											<p className="text-[13px] font-medium truncate leading-tight">
												{ag.name}
											</p>
											<div className="flex items-center gap-1.5 mt-0.5">
												{ag.scopes.slice(0, 2).map((s: string) => (
													<span
														key={s}
														className="font-mono text-[9px] bg-muted/70 px-1.5 py-px rounded text-muted-foreground"
													>
														{s.includes(".") ? s.split(".")[0] : s}
													</span>
												))}
												{ag.scopes.length > 2 && (
													<span className="text-[9px] text-muted-foreground/50">
														+{ag.scopes.length - 2}
													</span>
												)}
											</div>
										</div>
										<span className="text-[10px] text-muted-foreground/50 shrink-0 tabular-nums">
											{formatRelativeTime(ag.lastUsedAt)}
										</span>
									</Link>
								))}
							</div>
						) : (
							<div className="border border-dashed border-border/50 rounded-lg p-6 text-center">
								<AgentBotIcon className="h-4 w-4 mx-auto mb-1.5 text-muted-foreground/20" />
								<p className="text-[11px] text-muted-foreground/60">
									No active agents
								</p>
							</div>
						)}
					</section>

					{/* Recent Activity — scrollable within its box */}
					<section className="flex-1 min-h-0 flex flex-col">
						<div className="flex items-center justify-between mb-2 shrink-0">
							<h2 className="text-xs font-medium text-muted-foreground">
								Recent Activity
							</h2>
							<Link
								href={`/dashboard/${orgSlug}/activity`}
								className="text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors"
							>
								See all
							</Link>
						</div>
						<div className="border border-border/60 rounded-lg flex-1 min-h-0 flex flex-col overflow-hidden">
							<div className="flex-1 min-h-0 overflow-y-auto">
								<ActivityFeed activities={data?.recentActivity ?? []} />
							</div>
							{(data?.recentActivity?.length ?? 0) > 0 && (
								<Link
									href={`/dashboard/${orgSlug}/activity`}
									className="flex items-center justify-center gap-1.5 px-3 py-2 border-t border-border/40 text-[11px] text-muted-foreground/60 hover:text-foreground hover:bg-muted/20 transition-colors shrink-0"
								>
									View all activity
									<ArrowRight className="h-3 w-3" />
								</Link>
							)}
						</div>
					</section>
				</div>

				{/* Right column */}
				<div className="lg:col-span-2 flex flex-col gap-5 min-h-0 overflow-y-auto">
					{/* Usage by Provider */}
					<section className="shrink-0">
						<h2 className="text-xs font-medium text-muted-foreground mb-2">
							Usage by Provider
						</h2>
						{data?.toolCallsByProvider &&
						data.toolCallsByProvider.length > 0 ? (
							<div className="border border-border/60 rounded-lg divide-y divide-border/40">
								{data.toolCallsByProvider.map((p) => {
									const total = data.toolCalls.total || 1;
									const pct = Math.round((p.count / total) * 100);
									return (
										<div key={p.provider} className="px-3.5 py-2.5">
											<div className="flex items-center justify-between mb-1.5">
												<span className="text-[13px] font-medium font-mono">
													{p.provider}
												</span>
												<span className="text-[10px] text-muted-foreground tabular-nums">
													{p.count.toLocaleString()}
												</span>
											</div>
											<div className="h-1 bg-muted/60 rounded-full overflow-hidden">
												<div
													className="h-full bg-foreground/60 rounded-full transition-all"
													style={{
														width: `${Math.max(pct, 3)}%`,
													}}
												/>
											</div>
											{p.errorCount > 0 && (
												<div className="flex items-center gap-1.5 mt-1.5">
													<AlertTriangle className="h-2.5 w-2.5 text-amber-500" />
													<span className="text-[10px] text-amber-600 dark:text-amber-400">
														{p.errorCount} error
														{p.errorCount !== 1 ? "s" : ""}
													</span>
												</div>
											)}
										</div>
									);
								})}
							</div>
						) : (
							<div className="border border-dashed border-border/50 rounded-lg p-6 text-center">
								<Activity className="h-4 w-4 mx-auto mb-1.5 text-muted-foreground/20" />
								<p className="text-[11px] text-muted-foreground/60">
									No usage data yet
								</p>
							</div>
						)}
					</section>

					{/* Connections */}
					<section className="shrink-0">
						<div className="flex items-center justify-between mb-2">
							<h2 className="text-xs font-medium text-muted-foreground">
								Connections
							</h2>
							<Link
								href={`/dashboard/${orgSlug}/connections`}
								className="text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors"
							>
								Manage
							</Link>
						</div>
						{connections.length > 0 ? (
							<div className="border border-border/60 rounded-lg divide-y divide-border/40">
								{connections.map((c) => (
									<div
										key={c.id}
										className="flex items-center gap-3 px-3.5 py-2"
									>
										<Plug2 className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
										<p className="text-[13px] font-medium truncate flex-1">
											{c.displayName}
										</p>
										<span
											className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
												c.status === "active"
													? "bg-foreground/[0.06] text-foreground/70"
													: "bg-muted text-muted-foreground/50"
											}`}
										>
											{c.status}
										</span>
									</div>
								))}
							</div>
						) : (
							<Link
								href={`/dashboard/${orgSlug}/connections`}
								className="flex items-center justify-center gap-2 border border-dashed border-border/50 rounded-lg p-6 hover:bg-muted/20 transition-colors group"
							>
								<Plug2 className="h-4 w-4 text-muted-foreground/20 group-hover:text-muted-foreground/40 transition-colors" />
								<p className="text-[11px] text-muted-foreground/60 group-hover:text-muted-foreground transition-colors">
									Add a connection
								</p>
							</Link>
						)}
					</section>

					{/* Agent Chat Demo */}
					<section className="shrink-0">
						<h2 className="text-xs font-medium text-muted-foreground mb-2">
							Try It Out
						</h2>
						<OverviewChatDialog />
					</section>

					{/* Quick Links */}
					<section className="shrink-0">
						<h2 className="text-xs font-medium text-muted-foreground mb-2">
							Quick Links
						</h2>
						<div className="space-y-px">
							{[
								{
									icon: AgentBotIcon,
									label: "Agents",
									href: `/dashboard/${orgSlug}/agents`,
								},
								{
									icon: KeyRound,
									label: "Hosts",
									href: `/dashboard/${orgSlug}/hosts`,
								},
								{
									icon: Activity,
									label: "All Activity",
									href: `/dashboard/${orgSlug}/activity`,
								},
								...(!isPersonal
									? [
											{
												icon: Users,
												label: "Members",
												href: `/dashboard/${orgSlug}/members`,
											},
										]
									: []),
							].map((action) => (
								<Link
									key={action.label}
									href={action.href}
									className="flex items-center gap-3 px-3 py-1.5 rounded-md hover:bg-muted/30 transition-colors group"
								>
									<action.icon className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground/70 transition-colors" />
									<span className="text-[13px] text-muted-foreground group-hover:text-foreground transition-colors flex-1">
										{action.label}
									</span>
									<ArrowRight className="h-3 w-3 text-transparent group-hover:text-muted-foreground/50 transition-colors" />
								</Link>
							))}
						</div>
					</section>
				</div>
			</div>
		</div>
	);
}
