"use client";

import {
	Activity,
	AlertCircle,
	ChevronLeft,
	ChevronRight,
	ChevronsLeft,
	ChevronsRight,
	Clock,
	Filter,
	Search,
	Wrench,
	X,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ActivityItem = {
	id: string;
	agentId: string;
	tool: string;
	provider: string | null;
	agentName: string | null;
	status: string;
	durationMs: number | null;
	error: string | null;
	createdAt: string;
};

type Filters = {
	status: string;
	agent: string;
	provider: string;
	search: string;
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

function getDateGroup(d: string): string {
	const date = new Date(d);
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const yesterday = new Date(today.getTime() - 86400000);
	const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

	if (dateDay.getTime() === today.getTime()) return "Today";
	if (dateDay.getTime() === yesterday.getTime()) return "Yesterday";

	const diffDays = Math.floor((today.getTime() - dateDay.getTime()) / 86400000);
	if (diffDays < 7) return "This week";
	if (diffDays < 30) return "This month";
	return date.toLocaleDateString(undefined, {
		month: "long",
		year: "numeric",
	});
}

function groupActivities(
	items: ActivityItem[],
): { label: string; items: ActivityItem[] }[] {
	const groups: { label: string; items: ActivityItem[] }[] = [];
	let currentLabel = "";

	for (const item of items) {
		const label = getDateGroup(item.createdAt);
		if (label !== currentLabel) {
			currentLabel = label;
			groups.push({ label, items: [] });
		}
		groups[groups.length - 1].items.push(item);
	}

	return groups;
}

function FilterPill({
	label,
	onClear,
}: {
	label: string;
	onClear: () => void;
}) {
	return (
		<span className="inline-flex items-center gap-1 rounded-md bg-foreground/6 px-2 py-0.5 text-[11px] font-medium text-foreground">
			{label}
			<button
				type="button"
				onClick={onClear}
				className="ml-0.5 rounded-sm hover:bg-foreground/10 p-0.5 transition-colors"
			>
				<X className="h-2.5 w-2.5" />
			</button>
		</span>
	);
}

export function ActivityClient({
	orgSlug,
	activities,
	total,
	page,
	pageSize,
	filterOptions,
	currentFilters,
}: {
	orgId: string;
	orgSlug: string;
	activities: ActivityItem[];
	total: number;
	page: number;
	pageSize: number;
	filterOptions: { agents: string[]; providers: string[] };
	currentFilters: Filters;
}) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const [isPending, startTransition] = useTransition();

	const [searchValue, setSearchValue] = useState(currentFilters.search);
	const [showFilters, setShowFilters] = useState(
		Boolean(
			currentFilters.status || currentFilters.agent || currentFilters.provider,
		),
	);
	const searchTimeout = useRef<ReturnType<typeof setTimeout>>(null);

	const totalPages = Math.max(1, Math.ceil(total / pageSize));

	const updateParams = useCallback(
		(updates: Record<string, string>) => {
			const params = new URLSearchParams(searchParams.toString());
			for (const [key, value] of Object.entries(updates)) {
				if (value) {
					params.set(key, value);
				} else {
					params.delete(key);
				}
			}
			if (updates.page === undefined && !("page" in updates)) {
				params.delete("page");
			}
			startTransition(() => {
				router.push(`${pathname}?${params.toString()}`);
			});
		},
		[searchParams, pathname, router],
	);

	const setFilter = useCallback(
		(key: string, value: string) => {
			updateParams({ [key]: value, page: "" });
		},
		[updateParams],
	);

	const clearFilter = useCallback(
		(key: string) => {
			updateParams({ [key]: "", page: "" });
		},
		[updateParams],
	);

	const clearAllFilters = useCallback(() => {
		startTransition(() => {
			router.push(pathname);
		});
		setSearchValue("");
	}, [pathname, router]);

	const goToPage = useCallback(
		(p: number) => {
			updateParams({ page: p <= 1 ? "" : String(p) });
		},
		[updateParams],
	);

	const handleSearch = useCallback(
		(value: string) => {
			setSearchValue(value);
			if (searchTimeout.current) clearTimeout(searchTimeout.current);
			searchTimeout.current = setTimeout(() => {
				setFilter("search", value);
			}, 400);
		},
		[setFilter],
	);

	const hasActiveFilters =
		currentFilters.status ||
		currentFilters.agent ||
		currentFilters.provider ||
		currentFilters.search;

	const groups = groupActivities(activities);
	const startItem = (page - 1) * pageSize + 1;
	const endItem = Math.min(page * pageSize, total);

	return (
		<div className="flex flex-col h-full">
			{/* Sticky header */}
			<div className="sticky top-0 z-10 bg-background border-b border-border/40 -mx-6 lg:-mx-8 px-6 lg:px-8">
				<div className="flex items-center justify-between py-5">
					<div>
						<h1 className="text-lg font-medium tracking-tight">Activity</h1>
						<p className="text-[13px] text-muted-foreground mt-0.5">
							{total.toLocaleString()} total tool call
							{total !== 1 ? "s" : ""}
						</p>
					</div>
					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							className={cn(
								"h-8 text-xs gap-1.5",
								showFilters && "bg-foreground/4",
							)}
							onClick={() => setShowFilters(!showFilters)}
						>
							<Filter className="h-3 w-3" />
							Filters
							{hasActiveFilters && (
								<span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground text-background text-[9px] font-bold px-1">
									{
										[
											currentFilters.status,
											currentFilters.agent,
											currentFilters.provider,
											currentFilters.search,
										].filter(Boolean).length
									}
								</span>
							)}
						</Button>
					</div>
				</div>

				{/* Search + filter bar */}
				<div className="pb-4 space-y-3">
					<div className="relative">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
						<Input
							placeholder="Search tools, agents, providers, errors..."
							value={searchValue}
							onChange={(e) => handleSearch(e.target.value)}
							className="pl-9 h-9 text-[13px]"
						/>
						{searchValue && (
							<button
								type="button"
								onClick={() => handleSearch("")}
								className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
							>
								<X className="h-3.5 w-3.5" />
							</button>
						)}
					</div>

					{showFilters && (
						<div className="flex flex-wrap items-center gap-2">
							<select
								value={currentFilters.status}
								onChange={(e) => setFilter("status", e.target.value)}
								className="h-8 rounded-md border border-input bg-background px-2.5 text-[12px] text-foreground outline-none focus:ring-2 focus:ring-ring/50"
							>
								<option value="">All statuses</option>
								<option value="success">Success</option>
								<option value="error">Error</option>
							</select>

							{filterOptions.agents.length > 0 && (
								<select
									value={currentFilters.agent}
									onChange={(e) => setFilter("agent", e.target.value)}
									className="h-8 rounded-md border border-input bg-background px-2.5 text-[12px] text-foreground outline-none focus:ring-2 focus:ring-ring/50"
								>
									<option value="">All agents</option>
									{filterOptions.agents.map((a) => (
										<option key={a} value={a}>
											{a}
										</option>
									))}
								</select>
							)}

							{filterOptions.providers.length > 0 && (
								<select
									value={currentFilters.provider}
									onChange={(e) => setFilter("provider", e.target.value)}
									className="h-8 rounded-md border border-input bg-background px-2.5 text-[12px] text-foreground outline-none focus:ring-2 focus:ring-ring/50"
								>
									<option value="">All providers</option>
									{filterOptions.providers.map((p) => (
										<option key={p} value={p}>
											{p}
										</option>
									))}
								</select>
							)}

							{hasActiveFilters && (
								<button
									type="button"
									onClick={clearAllFilters}
									className="text-[11px] text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
								>
									Clear all
								</button>
							)}
						</div>
					)}

					{/* Active filter pills */}
					{hasActiveFilters && !showFilters && (
						<div className="flex flex-wrap items-center gap-1.5">
							{currentFilters.status && (
								<FilterPill
									label={`Status: ${currentFilters.status}`}
									onClear={() => clearFilter("status")}
								/>
							)}
							{currentFilters.agent && (
								<FilterPill
									label={`Agent: ${currentFilters.agent}`}
									onClear={() => clearFilter("agent")}
								/>
							)}
							{currentFilters.provider && (
								<FilterPill
									label={`Provider: ${currentFilters.provider}`}
									onClear={() => clearFilter("provider")}
								/>
							)}
							{currentFilters.search && (
								<FilterPill
									label={`Search: ${currentFilters.search}`}
									onClear={() => {
										clearFilter("search");
										setSearchValue("");
									}}
								/>
							)}
							<button
								type="button"
								onClick={clearAllFilters}
								className="text-[10px] text-muted-foreground hover:text-foreground transition-colors ml-1"
							>
								Clear all
							</button>
						</div>
					)}
				</div>
			</div>

			{/* Content */}
			<div
				className={cn(
					"flex-1 py-4 transition-opacity",
					isPending && "opacity-60",
				)}
			>
				{activities.length === 0 ? (
					<div className="border border-dashed border-border/50 rounded-lg p-16 text-center">
						<Activity className="h-6 w-6 mx-auto mb-3 text-muted-foreground/20" />
						<p className="text-sm text-muted-foreground">
							{hasActiveFilters ? "No matching activity" : "No activity yet"}
						</p>
						<p className="text-xs text-muted-foreground/60 mt-1">
							{hasActiveFilters
								? "Try adjusting your filters."
								: "Activity will appear here when agents make tool calls."}
						</p>
						{hasActiveFilters && (
							<Button
								variant="outline"
								size="sm"
								className="mt-4 h-7 text-xs"
								onClick={clearAllFilters}
							>
								Clear filters
							</Button>
						)}
					</div>
				) : (
					<div className="space-y-6">
						{groups.map((group) => (
							<div key={group.label}>
								<div className="flex items-center gap-2 mb-2">
									<span className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider">
										{group.label}
									</span>
									<div className="flex-1 h-px bg-border/30" />
									<span className="text-[10px] text-muted-foreground/40 tabular-nums">
										{group.items.length} call
										{group.items.length !== 1 ? "s" : ""}
									</span>
								</div>
								<div className="border border-border/60 rounded-lg divide-y divide-border/30 overflow-hidden">
									{group.items.map((item) => (
										<ActivityRow key={item.id} item={item} orgSlug={orgSlug} />
									))}
								</div>
							</div>
						))}
					</div>
				)}
			</div>

			{/* Pagination footer */}
			{total > 0 && (
				<div className="sticky bottom-0 bg-background border-t border-border/40 -mx-6 lg:-mx-8 px-6 lg:px-8 py-3 flex items-center justify-between">
					<p className="text-[12px] text-muted-foreground tabular-nums">
						{startItem}–{endItem} of {total.toLocaleString()}
					</p>
					<div className="flex items-center gap-1">
						<Button
							variant="outline"
							size="icon"
							className="h-7 w-7"
							disabled={page <= 1}
							onClick={() => goToPage(1)}
						>
							<ChevronsLeft className="h-3.5 w-3.5" />
						</Button>
						<Button
							variant="outline"
							size="icon"
							className="h-7 w-7"
							disabled={page <= 1}
							onClick={() => goToPage(page - 1)}
						>
							<ChevronLeft className="h-3.5 w-3.5" />
						</Button>

						<PageNumbers current={page} total={totalPages} onPage={goToPage} />

						<Button
							variant="outline"
							size="icon"
							className="h-7 w-7"
							disabled={page >= totalPages}
							onClick={() => goToPage(page + 1)}
						>
							<ChevronRight className="h-3.5 w-3.5" />
						</Button>
						<Button
							variant="outline"
							size="icon"
							className="h-7 w-7"
							disabled={page >= totalPages}
							onClick={() => goToPage(totalPages)}
						>
							<ChevronsRight className="h-3.5 w-3.5" />
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}

function PageNumbers({
	current,
	total,
	onPage,
}: {
	current: number;
	total: number;
	onPage: (p: number) => void;
}) {
	const pages: (number | "...")[] = [];

	if (total <= 7) {
		for (let i = 1; i <= total; i++) pages.push(i);
	} else {
		pages.push(1);
		if (current > 3) pages.push("...");

		const start = Math.max(2, current - 1);
		const end = Math.min(total - 1, current + 1);
		for (let i = start; i <= end; i++) pages.push(i);

		if (current < total - 2) pages.push("...");
		pages.push(total);
	}

	return (
		<div className="flex items-center gap-0.5 mx-1">
			{pages.map((p, i) =>
				p === "..." ? (
					<span
						key={`ellipsis-${i}`}
						className="w-7 text-center text-[11px] text-muted-foreground/50"
					>
						...
					</span>
				) : (
					<Button
						key={p}
						variant={p === current ? "default" : "ghost"}
						size="icon"
						className={cn(
							"h-7 w-7 text-[11px] font-medium",
							p === current && "pointer-events-none",
						)}
						onClick={() => onPage(p)}
					>
						{p}
					</Button>
				),
			)}
		</div>
	);
}

function ActivityRow({ item }: { item: ActivityItem; orgSlug: string }) {
	const isError = item.status === "error";
	const [expanded, setExpanded] = useState(false);

	return (
		<div>
			<button
				type="button"
				onClick={() => item.error && setExpanded(!expanded)}
				className={cn(
					"w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/10 transition-colors text-left",
					item.error && "cursor-pointer",
				)}
			>
				<div
					className={cn(
						"flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
						isError ? "bg-destructive/10" : "bg-muted/50",
					)}
				>
					{isError ? (
						<AlertCircle className="h-3.5 w-3.5 text-destructive" />
					) : (
						<Wrench className="h-3.5 w-3.5 text-muted-foreground" />
					)}
				</div>

				<div className="flex-1 min-w-0 flex items-center gap-3">
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2">
							<span className="font-medium text-[13px] truncate">
								{item.tool}
							</span>
							{item.provider && (
								<span className="font-mono text-[9px] bg-muted/70 px-1.5 py-0.5 rounded text-muted-foreground shrink-0">
									{item.provider}
								</span>
							)}
						</div>
						{item.agentName && (
							<p className="text-[11px] text-muted-foreground/60 mt-0.5 truncate">
								{item.agentName}
							</p>
						)}
					</div>
				</div>

				<div className="flex items-center gap-4 shrink-0">
					{item.durationMs != null && (
						<span className="flex items-center gap-1 text-[11px] text-muted-foreground/50 tabular-nums">
							<Clock className="h-3 w-3" />
							{item.durationMs}ms
						</span>
					)}
					<span
						className={cn(
							"inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
							isError
								? "bg-destructive/10 text-destructive"
								: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
						)}
					>
						{item.status}
					</span>
					<span className="text-[11px] text-muted-foreground/50 tabular-nums w-16 text-right">
						{formatRelativeTime(item.createdAt)}
					</span>
				</div>
			</button>

			{expanded && item.error && (
				<div className="px-4 pb-3 pl-14">
					<div className="rounded-md bg-destructive/5 border border-destructive/10 px-3 py-2">
						<p className="text-[11px] text-destructive font-mono whitespace-pre-wrap break-all">
							{item.error}
						</p>
					</div>
				</div>
			)}
		</div>
	);
}
