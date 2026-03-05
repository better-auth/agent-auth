import { headers } from "next/headers";
import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import {
	Globe,
	CheckCircle2,
	Clock,
	ExternalLink,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { site, deployment } from "@/lib/db/schema";
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
	if (!bytes) return "";
	if (bytes < 1024) return `${bytes} B`;
	const kb = bytes / 1024;
	if (kb < 1024) return `${kb.toFixed(1)} KB`;
	return `${(kb / 1024).toFixed(1)} MB`;
}

export default async function SitesPage() {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user) return null;

	const sites = db
		.select()
		.from(site)
		.where(eq(site.userId, session.user.id))
		.orderBy(desc(site.updatedAt))
		.all();

	const enriched = sites.map((s) => {
		const latestDeploy = db
			.select()
			.from(deployment)
			.where(eq(deployment.siteId, s.id))
			.orderBy(desc(deployment.createdAt))
			.limit(1)
			.all()[0];

		const deployCount = db
			.select()
			.from(deployment)
			.where(eq(deployment.siteId, s.id))
			.all().length;

		return { ...s, latestDeploy, deployCount };
	});

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight">Sites</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Manage your deployed HTML sites
				</p>
			</div>

			<div className="grid grid-cols-2 gap-4">
				{enriched.map((s) => (
					<Link
						key={s.id}
						href={`/dashboard/sites/${s.id}`}
						className="group rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/30 hover:bg-card/80"
					>
						<div className="flex items-start justify-between">
							<div className="flex items-center gap-3">
								<div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
									<Globe className="size-4 text-primary" />
								</div>
								<div>
									<p className="text-sm font-semibold group-hover:text-primary transition-colors">
										{s.name}
									</p>
									<p className="text-xs text-muted-foreground font-mono">
										/s/{s.slug}
									</p>
								</div>
							</div>
							{s.latestDeploy && (
								<Badge
									variant={
										s.latestDeploy.status === "live"
											? "success"
											: "secondary"
									}
								>
									{s.latestDeploy.status === "live" && (
										<CheckCircle2 className="mr-1 size-3" />
									)}
									{s.latestDeploy.status === "superseded" && (
										<Clock className="mr-1 size-3" />
									)}
									{s.latestDeploy.status}
								</Badge>
							)}
						</div>

						<div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
							<span>{s.deployCount} deploys</span>
							{s.latestDeploy?.size && (
								<span>{formatBytes(s.latestDeploy.size)}</span>
							)}
							<span className="flex items-center gap-1">
								<ExternalLink className="size-3" />
								/s/{s.slug}
							</span>
						</div>

						{s.latestDeploy && (
							<div className="mt-3 border-t border-border pt-3">
								<p className="text-xs text-muted-foreground truncate">
									{s.latestDeploy.label ?? "Deploy"} —{" "}
									{timeAgo(s.latestDeploy.createdAt)}
								</p>
							</div>
						)}
					</Link>
				))}
			</div>

			{enriched.length === 0 && (
				<div className="rounded-xl border border-dashed border-border py-16 text-center">
					<Globe className="mx-auto size-10 text-muted-foreground/40" />
					<p className="mt-3 text-sm text-muted-foreground">
						No sites yet
					</p>
					<p className="mt-1 text-xs text-muted-foreground">
						Create a site and deploy HTML to get started
					</p>
				</div>
			)}
		</div>
	);
}
