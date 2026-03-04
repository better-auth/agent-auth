"use client";

import {
	Activity,
	AlertCircle,
	ArrowLeft,
	Loader2,
	Wrench,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ActivityItem = {
	id: string;
	tool: string;
	provider: string | null;
	agentName: string | null;
	status: string;
	durationMs: number | null;
	error: string | null;
	createdAt: string;
};

function formatRelativeTime(d: string): string {
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

function formatTime(d: string): string {
	return new Date(d).toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

export function ActivityClient({
	orgId,
	orgSlug,
	initialActivities,
	initialHasMore,
}: {
	orgId: string;
	orgSlug: string;
	initialActivities: ActivityItem[];
	initialHasMore: boolean;
}) {
	const [activities, setActivities] =
		useState<ActivityItem[]>(initialActivities);
	const [hasMore, setHasMore] = useState(initialHasMore);
	const [loading, setLoading] = useState(false);

	const loadMore = async () => {
		setLoading(true);
		try {
			const res = await fetch(
				`/api/agent/activity?orgId=${orgId}&limit=50&offset=${activities.length}`,
			);
			if (res.ok) {
				const data = await res.json();
				setActivities((prev) => [...prev, ...(data.activities ?? [])]);
				setHasMore(data.hasMore ?? false);
			}
		} catch {
			// ignore
		}
		setLoading(false);
	};

	return (
		<div className="flex flex-col gap-6 py-8">
			<div className="flex items-center gap-3">
				<Link
					href={`/dashboard/${orgSlug}`}
					className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted/50 transition-colors"
				>
					<ArrowLeft className="h-4 w-4 text-muted-foreground" />
				</Link>
				<div>
					<h1 className="text-lg font-medium tracking-tight">Activity</h1>
					<p className="text-[13px] text-muted-foreground mt-0.5">
						All agent tool calls and API activity.
					</p>
				</div>
			</div>

			{activities.length === 0 ? (
				<div className="border border-dashed border-border/50 rounded-lg p-16 text-center">
					<Activity className="h-6 w-6 mx-auto mb-3 text-muted-foreground/20" />
					<p className="text-sm text-muted-foreground">No activity yet</p>
					<p className="text-xs text-muted-foreground/60 mt-1">
						Activity will appear here when agents make tool calls.
					</p>
				</div>
			) : (
				<div className="border border-border/60 rounded-lg divide-y divide-border/40">
					{activities.map((item) => {
						const isError = item.status === "error";
						return (
							<div
								key={item.id}
								className="flex items-start gap-3 px-4 py-3 hover:bg-muted/10 transition-colors"
							>
								<div
									className={cn(
										"flex h-7 w-7 shrink-0 items-center justify-center rounded-md mt-0.5",
										isError ? "bg-destructive/10" : "bg-muted/50",
									)}
								>
									{isError ? (
										<AlertCircle className="h-3.5 w-3.5 text-destructive" />
									) : (
										<Wrench className="h-3.5 w-3.5 text-muted-foreground" />
									)}
								</div>
								<div className="flex-1 min-w-0">
									<div className="flex items-center gap-2">
										{item.provider && (
											<span className="font-mono text-[9px] bg-muted/70 px-1.5 py-0.5 rounded text-muted-foreground">
												{item.provider}
											</span>
										)}
										<span className="font-medium text-[13px] truncate">
											{item.tool}
										</span>
									</div>
									{item.agentName && (
										<p className="text-[11px] text-muted-foreground/60 mt-0.5">
											by {item.agentName}
										</p>
									)}
									{item.error && (
										<p className="text-[11px] text-destructive mt-1 line-clamp-2">
											{item.error}
										</p>
									)}
								</div>
								<div className="text-right shrink-0 space-y-0.5">
									<p className="text-[10px] text-muted-foreground tabular-nums">
										{formatRelativeTime(item.createdAt)}
									</p>
									<p className="text-[9px] text-muted-foreground/40 tabular-nums">
										{formatTime(item.createdAt)}
									</p>
									{item.durationMs != null && (
										<p className="text-[9px] text-muted-foreground/40 tabular-nums">
											{item.durationMs}ms
										</p>
									)}
								</div>
							</div>
						);
					})}
				</div>
			)}

			{hasMore && (
				<div className="flex justify-center">
					<Button
						variant="outline"
						size="sm"
						className="h-8 text-xs"
						onClick={loadMore}
						disabled={loading}
					>
						{loading && <Loader2 className="h-3 w-3 animate-spin mr-1.5" />}
						Load more
					</Button>
				</div>
			)}
		</div>
	);
}
