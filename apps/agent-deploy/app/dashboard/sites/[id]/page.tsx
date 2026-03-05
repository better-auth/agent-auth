import { headers } from "next/headers";
import { eq, and, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
	ArrowLeft,
	CheckCircle2,
	Clock,
	ExternalLink,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { site, deployment } from "@/lib/db/schema";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

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

export default async function SiteDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user) return null;

	const { id } = await params;

	const s = db
		.select()
		.from(site)
		.where(and(eq(site.id, id), eq(site.userId, session.user.id)))
		.get();

	if (!s) notFound();

	const deployments = db
		.select()
		.from(deployment)
		.where(eq(deployment.siteId, id))
		.orderBy(desc(deployment.createdAt))
		.all();

	const liveDeploy = deployments.find((d) => d.status === "live");

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-3">
				<Link
					href="/dashboard/sites"
					className="flex size-8 items-center justify-center rounded-md border border-border hover:bg-accent transition-colors"
				>
					<ArrowLeft className="size-4" />
				</Link>
				<div className="flex-1">
					<h1 className="text-2xl font-semibold tracking-tight">
						{s.name}
					</h1>
					<p className="text-sm text-muted-foreground font-mono">
						/s/{s.slug}
					</p>
				</div>
				<a
					href={`/s/${s.slug}`}
					target="_blank"
					rel="noreferrer"
					className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent transition-colors"
				>
					<ExternalLink className="size-3.5" />
					View Live
				</a>
			</div>

			<Tabs defaultValue="deployments">
				<TabsList>
					<TabsTrigger value="deployments">
						Deployments ({deployments.length})
					</TabsTrigger>
					{liveDeploy && (
						<TabsTrigger value="preview">Preview</TabsTrigger>
					)}
				</TabsList>

				<TabsContent value="deployments" className="space-y-3 mt-4">
					{deployments.map((dep) => (
						<div
							key={dep.id}
							className="flex items-center justify-between rounded-lg border border-border bg-card px-5 py-4"
						>
							<div className="flex items-center gap-3">
								{dep.status === "live" ? (
									<CheckCircle2 className="size-3.5 text-success" />
								) : (
									<Clock className="size-3.5 text-muted-foreground" />
								)}
								<div>
									<p className="text-sm font-medium">
										{dep.label ?? "Deploy"}
									</p>
									<div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
										<span className="font-mono">
											{dep.id.slice(0, 8)}
										</span>
										<span>{formatBytes(dep.size)}</span>
									</div>
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
					))}
					{deployments.length === 0 && (
						<p className="py-8 text-center text-sm text-muted-foreground">
							No deployments yet — deploy HTML via the API or an
							agent
						</p>
					)}
				</TabsContent>

				{liveDeploy && (
					<TabsContent value="preview" className="mt-4">
						<div className="rounded-lg border border-border overflow-hidden">
							<div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2">
								<span className="text-xs text-muted-foreground font-mono">
									/s/{s.slug}
								</span>
								<Badge variant="success">live</Badge>
							</div>
							<iframe
								srcDoc={liveDeploy.html}
								title={s.name}
								className="w-full h-[500px] bg-white"
								sandbox="allow-scripts"
							/>
						</div>
					</TabsContent>
				)}
			</Tabs>
		</div>
	);
}
