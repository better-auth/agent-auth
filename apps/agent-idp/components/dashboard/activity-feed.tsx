"use client";

import { Activity, AlertCircle, Wrench } from "lucide-react";

type ActivityItem = {
	id: string;
	tool?: string | null;
	provider?: string | null;
	agentName?: string | null;
	status?: string | null;
	error?: string | null;
	durationMs?: number | null;
	createdAt?: string;
};

function formatRelativeTime(d: string | null | undefined): string {
	if (!d) return "";
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

export function ActivityFeed({ activities }: { activities: ActivityItem[] }) {
	if (!activities || activities.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
				<Activity className="h-4 w-4 mb-2 opacity-30" />
				<p className="text-[11px]">No recent activity</p>
			</div>
		);
	}

	return (
		<div className="divide-y divide-border/30">
			{activities.map((item) => {
				const isError = item.status === "error";
				return (
					<div
						key={item.id}
						className="py-2.5 px-3.5 flex items-center gap-3 hover:bg-muted/20 transition-colors"
					>
						<div
							className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
								isError ? "bg-destructive/10" : "bg-muted/50"
							}`}
						>
							{isError ? (
								<AlertCircle className="h-3 w-3 text-destructive" />
							) : (
								<Wrench className="h-3 w-3 text-muted-foreground" />
							)}
						</div>
						<div className="flex-1 min-w-0">
							<div className="flex items-center gap-2">
								{item.provider && (
									<span className="font-mono text-[9px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
										{item.provider}
									</span>
								)}
								<span className="font-medium truncate text-xs">
									{item.tool || "Unknown"}
								</span>
							</div>
							{item.error && (
								<p className="text-[11px] text-destructive mt-0.5 truncate">
									{item.error}
								</p>
							)}
						</div>
						<div className="text-[10px] text-muted-foreground shrink-0 text-right tabular-nums flex items-center gap-2">
							{item.durationMs != null && (
								<span className="text-muted-foreground/60">
									{item.durationMs}ms
								</span>
							)}
							<span>{formatRelativeTime(item.createdAt)}</span>
						</div>
					</div>
				);
			})}
		</div>
	);
}
