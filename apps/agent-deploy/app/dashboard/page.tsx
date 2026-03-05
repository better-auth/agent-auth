import { headers } from "next/headers";
import { desc, eq } from "drizzle-orm";
import {
	Globe,
	Rocket,
	Bot,
	CheckCircle2,
	Clock,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { site, deployment, agentActivity } from "@/lib/db/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function timeAgo(dateStr: string) {
	const diff = Date.now() - new Date(dateStr).getTime();
	const mins = Math.floor(diff / 60_000);
	if (mins < 1) return "just now";
	if (mins < 60) return `${mins}m ago`;
	const hrs = Math.floor(mins / 60);
	if (hrs < 24) return `${hrs}h ago`;
	const days = Math.floor(hrs / 24);
	return `${days}d ago`;
}

function formatBytes(bytes: number | null) {
	if (!bytes) return "—";
	if (bytes < 1024) return `${bytes} B`;
	const kb = bytes / 1024;
	if (kb < 1024) return `${kb.toFixed(1)} KB`;
	return `${(kb / 1024).toFixed(1)} MB`;
}

export default async function DashboardOverview() {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user) return null;

	const sites = db
		.select()
		.from(site)
		.where(eq(site.userId, session.user.id))
		.all();

	const siteIds = sites.map((s) => s.id);
	let agentIds: string[] = [];
	let agentCount = 0;
	try {
		const agentRes = await auth.api.listAgents({
			headers: await headers(),
		});
		const agents = Array.isArray(agentRes)
			? agentRes
			: ((agentRes as Record<string, unknown>)?.agents as
					| Array<{ id?: string }>
					| undefined) ?? [];
		agentIds = agents
			.map((agent) => agent?.id)
			.filter((id): id is string => typeof id === "string");
		agentCount = agentIds.length;
	} catch {
		agentIds = [];
		agentCount = 0;
	}

	const recentDeployments = siteIds.length
		? db
				.select({
					id: deployment.id,
					siteId: deployment.siteId,
					label: deployment.label,
					status: deployment.status,
					url: deployment.url,
					size: deployment.size,
					createdAt: deployment.createdAt,
				})
				.from(deployment)
				.orderBy(desc(deployment.createdAt))
				.all()
				.filter((dep) => siteIds.includes(dep.siteId))
				.slice(0, 8)
		: [];

	const recentActivity = db
		.select()
		.from(agentActivity)
		.orderBy(desc(agentActivity.createdAt))
		.all()
		.filter((activity) => agentIds.includes(activity.agentId))
		.slice(0, 5);

	const totalDeployments = siteIds.length
		? db
				.select()
				.from(deployment)
				.all()
				.filter((dep) => siteIds.includes(dep.siteId)).length
		: 0;

	const siteMap = new Map(sites.map((s) => [s.id, s]));

	return (
		<div className="space-y-8">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Your HTML hosting dashboard
				</p>
			</div>

			<div className="grid grid-cols-4 gap-4">
				<Card>
					<CardContent className="flex items-center gap-4 pt-6">
						<div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
							<Globe className="size-5 text-primary" />
						</div>
						<div>
							<p className="text-2xl font-semibold">{sites.length}</p>
							<p className="text-xs text-muted-foreground">Sites</p>
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="flex items-center gap-4 pt-6">
						<div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
							<Rocket className="size-5 text-primary" />
						</div>
						<div>
							<p className="text-2xl font-semibold">{totalDeployments}</p>
							<p className="text-xs text-muted-foreground">Deployments</p>
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="flex items-center gap-4 pt-6">
						<div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
							<Bot className="size-5 text-primary" />
						</div>
						<div>
							<p className="text-2xl font-semibold">{agentCount}</p>
							<p className="text-xs text-muted-foreground">
								Connected Agents
							</p>
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="flex items-center gap-4 pt-6">
						<div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
							<CheckCircle2 className="size-5 text-primary" />
						</div>
						<div>
							<p className="text-2xl font-semibold">
								{recentDeployments.filter((d) => d.status === "live").length}
							</p>
							<p className="text-xs text-muted-foreground">Live (recent)</p>
						</div>
					</CardContent>
				</Card>
			</div>

			<div className="grid grid-cols-3 gap-6">
				<div className="col-span-2 space-y-4">
					<h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
						Recent Deployments
					</h2>
					<div className="space-y-2">
						{recentDeployments.map((dep) => {
							const s = siteMap.get(dep.siteId);
							return (
								<div
									key={dep.id}
									className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3"
								>
									<div className="flex items-center gap-3">
										{dep.status === "live" ? (
											<CheckCircle2 className="size-3.5 text-success" />
										) : (
											<Clock className="size-3.5 text-muted-foreground" />
										)}
										<div>
											<p className="text-sm font-medium">
												{s?.name ?? "Unknown"}
											</p>
											<p className="text-xs text-muted-foreground truncate max-w-[300px]">
												{dep.label ?? "Deploy"}
												{dep.size
													? ` · ${formatBytes(dep.size)}`
													: ""}
											</p>
										</div>
									</div>
									<div className="flex items-center gap-3">
										<Badge
											variant={
												dep.status === "live"
													? "success"
													: "secondary"
											}
										>
											{dep.status}
										</Badge>
										<span className="text-xs text-muted-foreground">
											{timeAgo(dep.createdAt)}
										</span>
									</div>
								</div>
							);
						})}
						{recentDeployments.length === 0 && (
							<p className="text-sm text-muted-foreground py-8 text-center">
								No deployments yet
							</p>
						)}
					</div>
				</div>

				<div className="space-y-4">
					<h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
						Agent Activity
					</h2>
					<div className="space-y-2">
						{recentActivity.map((act) => (
							<div
								key={act.id}
								className="rounded-lg border border-border bg-card px-4 py-3"
							>
								<div className="flex items-center gap-2">
									<Bot className="size-3.5 text-primary" />
									<span className="text-xs font-medium">
										{act.agentName ?? "Agent"}
									</span>
									<span className="text-xs text-muted-foreground">
										{timeAgo(act.createdAt)}
									</span>
								</div>
								<p className="mt-1 text-xs text-muted-foreground">
									{act.action}
									{act.details ? ` — ${act.details}` : ""}
								</p>
							</div>
						))}
						{recentActivity.length === 0 && (
							<div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
								<Bot className="mx-auto size-8 text-muted-foreground/40" />
								<p className="mt-2 text-sm text-muted-foreground">
									No agent activity yet
								</p>
								<p className="mt-1 text-xs text-muted-foreground">
									Connect an agent to get started
								</p>
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
