"use client";

import { useEffect, useState, useCallback } from "react";
import {
	Bot,
	Globe,
	Rocket,
	ArrowDownToLine,
	RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Activity = {
	id: string;
	agentId: string;
	agentName: string | null;
	action: string;
	resourceType: string | null;
	resourceId: string | null;
	details: string | null;
	status: string;
	createdAt: string;
};

function timeAgo(dateStr: string) {
	const diff = Date.now() - new Date(dateStr).getTime();
	const secs = Math.floor(diff / 1_000);
	if (secs < 60) return `${secs}s ago`;
	const mins = Math.floor(secs / 60);
	if (mins < 60) return `${mins}m ago`;
	const hrs = Math.floor(mins / 60);
	if (hrs < 24) return `${hrs}h ago`;
	const days = Math.floor(hrs / 24);
	return `${days}d ago`;
}

function ActionIcon({ action }: { action: string }) {
	if (action.includes("site")) return <Globe className="size-3.5" />;
	if (action.includes("deploy") || action.includes("rollback"))
		return <Rocket className="size-3.5" />;
	return <Bot className="size-3.5" />;
}

function actionLabel(action: string) {
	const labels: Record<string, string> = {
		list_sites: "Listed sites",
		create_site: "Created site",
		delete_site: "Deleted site",
		get_site: "Viewed site",
		deploy: "Deployed HTML",
		rollback: "Rolled back deployment",
		get_deployment: "Viewed deployment",
		list_deployments: "Listed deployments",
	};
	return labels[action] ?? action;
}

export default function ActivityPage() {
	const [activities, setActivities] = useState<Activity[]>([]);
	const [loading, setLoading] = useState(true);

	const fetchActivities = useCallback(async () => {
		try {
			const res = await fetch("/api/activity?limit=100", {
				credentials: "include",
			});
			const data = await res.json();
			setActivities(Array.isArray(data) ? data : []);
		} catch {
			setActivities([]);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchActivities();
		const interval = setInterval(fetchActivities, 3000);
		return () => clearInterval(interval);
	}, [fetchActivities]);

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">
						Agent Activity
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Real-time log of all agent actions
					</p>
				</div>
				<Button variant="outline" size="sm" onClick={fetchActivities}>
					<RefreshCw className="size-3.5" />
					Refresh
				</Button>
			</div>

			{loading ? (
				<div className="py-16 text-center text-muted-foreground">
					Loading activity...
				</div>
			) : activities.length === 0 ? (
				<div className="rounded-xl border border-dashed border-border py-16 text-center">
					<ArrowDownToLine className="mx-auto size-10 text-muted-foreground/40" />
					<p className="mt-3 text-sm font-medium text-muted-foreground">
						No agent activity yet
					</p>
					<p className="mt-1 text-xs text-muted-foreground">
						Activity will appear here when agents interact with your
						sites
					</p>
				</div>
			) : (
				<div className="space-y-1">
					{activities.map((act) => (
						<div
							key={act.id}
							className="flex items-center gap-4 rounded-lg px-4 py-3 hover:bg-muted/30 transition-colors"
						>
							<div className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
								<ActionIcon action={act.action} />
							</div>
							<div className="flex-1 min-w-0">
								<div className="flex items-center gap-2">
									<span className="text-sm font-medium">
										{actionLabel(act.action)}
									</span>
									{act.resourceType && (
										<Badge
											variant="outline"
											className="text-[10px] font-mono"
										>
											{act.resourceType}
										</Badge>
									)}
								</div>
								{act.details && (
									<p className="text-xs text-muted-foreground truncate mt-0.5">
										{act.details}
									</p>
								)}
							</div>
							<div className="flex items-center gap-3 shrink-0">
								<Badge variant="secondary" className="text-[10px]">
									<Bot className="mr-1 size-2.5" />
									{act.agentName ?? "Agent"}
								</Badge>
								<span className="text-xs text-muted-foreground min-w-[60px] text-right">
									{timeAgo(act.createdAt)}
								</span>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
