"use client";

import {
	Activity,
	AlertCircle,
	ArrowRight,
	Bot,
	ChevronLeft,
	ChevronRight,
	ChevronsLeft,
	ChevronsRight,
	Clock,
	Expand,
	Eye,
	Filter,
	Key,
	Link2,
	Search,
	Settings,
	Shield,
	ShieldCheck,
	ShieldX,
	UserCheck,
	Wrench,
	X,
	XCircle,
	Zap,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ActivityItem = {
	id: string;
	kind: "tool" | "audit";
	agentId: string;
	tool: string;
	provider: string | null;
	agentName: string | null;
	status: string;
	durationMs: number | null;
	error: string | null;
	createdAt: string;
	eventType: string | null;
	actorId: string | null;
	actorType: string | null;
	metadata: string | null;
};

type Filters = {
	kind: string;
	status: string;
	eventType: string;
	agent: string;
	provider: string;
	search: string;
};

const EVENT_CATEGORIES: Record<string, { label: string; color: string }> = {
	agent: { label: "Agent", color: "text-violet-500" },
	host: { label: "Host", color: "text-amber-500" },
	scope: { label: "Scope", color: "text-emerald-500" },
	ciba: { label: "CIBA", color: "text-sky-500" },
	connection: { label: "Connection", color: "text-pink-500" },
	settings: { label: "Settings", color: "text-orange-500" },
	user_preference: { label: "Preference", color: "text-teal-500" },
};

function getEventCategory(eventType: string): string {
	const dot = eventType.indexOf(".");
	return dot > 0 ? eventType.substring(0, dot) : eventType;
}

function getEventIcon(item: ActivityItem) {
	if (item.kind === "tool") {
		if (item.status === "error") return AlertCircle;
		return Wrench;
	}
	const et = item.eventType ?? "";
	if (et.includes("revoked") || et.includes("denied")) return ShieldX;
	if (et.includes("approved") || et.includes("granted")) return ShieldCheck;
	if (et.includes("created") || et.includes("enrolled")) return Zap;
	if (et.includes("key_rotated")) return Key;
	if (et.includes("reactivated")) return UserCheck;
	if (et.includes("connection")) return Link2;
	if (et.includes("settings") || et.includes("preference")) return Settings;
	if (et.includes("scope")) return Shield;
	if (et.includes("agent")) return Bot;
	return Shield;
}

function getEventIconStyle(item: ActivityItem): string {
	if (item.kind === "tool") {
		return item.status === "error"
			? "bg-red-500/8 text-red-500 dark:bg-red-500/15"
			: "bg-muted/60 text-muted-foreground";
	}
	const et = item.eventType ?? "";
	if (et.includes("revoked") || et.includes("denied"))
		return "bg-red-500/8 text-red-500 dark:bg-red-500/15";
	if (et.includes("approved") || et.includes("granted"))
		return "bg-emerald-500/8 text-emerald-500 dark:bg-emerald-500/15";
	if (et.includes("created") || et.includes("enrolled"))
		return "bg-violet-500/8 text-violet-500 dark:bg-violet-500/15";
	if (et.includes("key_rotated"))
		return "bg-amber-500/8 text-amber-500 dark:bg-amber-500/15";
	if (et.includes("connection"))
		return "bg-pink-500/8 text-pink-500 dark:bg-pink-500/15";
	if (et.includes("settings") || et.includes("preference"))
		return "bg-orange-500/8 text-orange-500 dark:bg-orange-500/15";
	return "bg-sky-500/8 text-sky-500 dark:bg-sky-500/15";
}

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

function formatFullTime(d: string): string {
	const date = new Date(d);
	return date.toLocaleString(undefined, {
		weekday: "short",
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

function formatEventType(eventType: string): string {
	return eventType
		.replace(/\./g, " \u203a ")
		.replace(/_/g, " ")
		.replace(/\b\w/g, (c) => c.toUpperCase());
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

function parseMetadata(raw: string | null): Record<string, unknown> | null {
	if (!raw || raw === "{}") return null;
	try {
		const parsed = JSON.parse(raw);
		if (typeof parsed === "object" && parsed !== null) return parsed;
		return null;
	} catch {
		return null;
	}
}

function formatJsonOutput(value: unknown): string {
	if (typeof value === "string") {
		try {
			return JSON.stringify(JSON.parse(value), null, 2);
		} catch {
			return value;
		}
	}
	return JSON.stringify(value, null, 2);
}

function ExpandableCode({
	label,
	value,
}: {
	label: string;
	value: unknown;
}) {
	const [open, setOpen] = useState(false);
	const formatted = formatJsonOutput(value);

	return (
		<div>
			<div className="flex items-center justify-between mb-1.5">
				<p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
					{label}
				</p>
				<button
					type="button"
					onClick={() => setOpen(true)}
					className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-foreground transition-colors"
				>
					<Expand className="h-3 w-3" />
					Expand
				</button>
			</div>
			<div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5 overflow-x-auto max-h-48 overflow-y-auto">
				<pre className="text-[11px] font-mono text-foreground/80 whitespace-pre-wrap break-all leading-relaxed">
					{formatted}
				</pre>
			</div>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="max-w-2xl max-h-[80vh] flex flex-col p-0 gap-0">
					<DialogHeader className="px-5 pt-5 pb-3 border-b border-border/30 shrink-0">
						<DialogTitle className="text-sm">{label}</DialogTitle>
						<DialogDescription className="text-xs text-muted-foreground/60">
							Full content
						</DialogDescription>
					</DialogHeader>
					<div className="flex-1 min-h-0 overflow-auto p-5">
						<pre className="text-[12px] font-mono text-foreground/80 whitespace-pre-wrap break-all leading-relaxed">
							{formatted}
						</pre>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}

function FilterPill({
	label,
	onClear,
}: {
	label: string;
	onClear: () => void;
}) {
	return (
		<span className="inline-flex items-center gap-1 rounded-full bg-foreground/[0.06] px-2.5 py-1 text-[11px] font-medium text-foreground/80 border border-foreground/[0.06]">
			{label}
			<button
				type="button"
				onClick={onClear}
				className="ml-0.5 rounded-full hover:bg-foreground/10 p-0.5 transition-colors"
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
	filterOptions: {
		agents: string[];
		providers: string[];
		eventTypes: string[];
	};
	currentFilters: Filters;
}) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const [isPending, startTransition] = useTransition();
	const [selectedItem, setSelectedItem] = useState<ActivityItem | null>(null);

	const [searchValue, setSearchValue] = useState(currentFilters.search);
	const [showFilters, setShowFilters] = useState(
		Boolean(
			currentFilters.status ||
				currentFilters.agent ||
				currentFilters.provider ||
				currentFilters.eventType ||
				(currentFilters.kind && currentFilters.kind !== "all"),
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
		currentFilters.search ||
		currentFilters.eventType ||
		(currentFilters.kind && currentFilters.kind !== "all");

	const activeFilterCount = [
		currentFilters.kind && currentFilters.kind !== "all"
			? currentFilters.kind
			: "",
		currentFilters.status,
		currentFilters.eventType,
		currentFilters.agent,
		currentFilters.provider,
		currentFilters.search,
	].filter(Boolean).length;

	const groups = groupActivities(activities);
	const startItem = (page - 1) * pageSize + 1;
	const endItem = Math.min(page * pageSize, total);

	const stats = useMemo(() => {
		const toolCount = activities.filter((a) => a.kind === "tool").length;
		const auditCount = activities.filter((a) => a.kind === "audit").length;
		const errorCount = activities.filter((a) => a.status === "error").length;
		return { toolCount, auditCount, errorCount };
	}, [activities]);

	return (
		<div className="flex flex-col h-dvh overflow-hidden -mx-6 lg:-mx-8">
			<div className="z-10 bg-background border-b border-border/40 px-6 lg:px-8 shrink-0">
				<div className="flex items-center justify-between py-5">
					<div>
						<h1 className="text-lg font-semibold tracking-tight">Activity</h1>
						<p className="text-[13px] text-muted-foreground mt-0.5">
							{total.toLocaleString()} event
							{total !== 1 ? "s" : ""}
							{stats.errorCount > 0 && (
								<span className="text-red-500/80">
									{" "}
									&middot; {stats.errorCount} error
									{stats.errorCount !== 1 ? "s" : ""}
								</span>
							)}
						</p>
					</div>
					<div className="flex items-center gap-2">
						<div className="hidden sm:flex items-center gap-1.5 mr-2">
							{[
								{
									label: "All",
									value: "all",
									count: activities.length,
								},
								{
									label: "Tools",
									value: "tool",
									count: stats.toolCount,
								},
								{
									label: "Audit",
									value: "audit",
									count: stats.auditCount,
								},
							].map((tab) => (
								<button
									key={tab.value}
									type="button"
									onClick={() =>
										setFilter("kind", tab.value === "all" ? "" : tab.value)
									}
									className={cn(
										"px-3 py-1.5 rounded-md text-[12px] font-medium transition-all",
										(currentFilters.kind || "all") === tab.value
											? "bg-foreground text-background shadow-sm"
											: "text-muted-foreground hover:text-foreground hover:bg-muted/50",
									)}
								>
									{tab.label}
									<span
										className={cn(
											"ml-1.5 tabular-nums",
											(currentFilters.kind || "all") === tab.value
												? "text-background/60"
												: "text-muted-foreground/50",
										)}
									>
										{tab.count}
									</span>
								</button>
							))}
						</div>
						<Button
							variant="outline"
							size="sm"
							className={cn(
								"h-8 text-xs gap-1.5 border-border/60",
								showFilters && "bg-foreground/[0.03]",
							)}
							onClick={() => setShowFilters(!showFilters)}
						>
							<Filter className="h-3 w-3" />
							Filters
							{activeFilterCount > 0 && (
								<span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground text-background text-[9px] font-bold px-1">
									{activeFilterCount}
								</span>
							)}
						</Button>
					</div>
				</div>

				<div className="pb-4 space-y-3">
					<div className="relative">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
						<Input
							placeholder="Search events, tools, agents, providers..."
							value={searchValue}
							onChange={(e) => handleSearch(e.target.value)}
							className="pl-9 h-9 text-[13px] border-border/60 bg-background"
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
								className="h-8 rounded-lg border border-border/60 bg-background px-2.5 text-[12px] text-foreground outline-none focus:ring-2 focus:ring-ring/50 transition-colors"
							>
								<option value="">All statuses</option>
								<option value="success">Success</option>
								<option value="error">Error</option>
							</select>

							{filterOptions.eventTypes.length > 0 && (
								<select
									value={currentFilters.eventType}
									onChange={(e) => setFilter("eventType", e.target.value)}
									className="h-8 rounded-lg border border-border/60 bg-background px-2.5 text-[12px] text-foreground outline-none focus:ring-2 focus:ring-ring/50 transition-colors"
								>
									<option value="">All event types</option>
									{filterOptions.eventTypes.map((e) => (
										<option key={e} value={e}>
											{formatEventType(e)}
										</option>
									))}
								</select>
							)}

							{filterOptions.agents.length > 0 && (
								<select
									value={currentFilters.agent}
									onChange={(e) => setFilter("agent", e.target.value)}
									className="h-8 rounded-lg border border-border/60 bg-background px-2.5 text-[12px] text-foreground outline-none focus:ring-2 focus:ring-ring/50 transition-colors"
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
									className="h-8 rounded-lg border border-border/60 bg-background px-2.5 text-[12px] text-foreground outline-none focus:ring-2 focus:ring-ring/50 transition-colors"
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
									className="text-[11px] text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2 decoration-muted-foreground/30"
								>
									Clear all
								</button>
							)}
						</div>
					)}

					{hasActiveFilters && !showFilters && (
						<div className="flex flex-wrap items-center gap-1.5">
							{currentFilters.kind && currentFilters.kind !== "all" && (
								<FilterPill
									label={`Type: ${currentFilters.kind}`}
									onClear={() => clearFilter("kind")}
								/>
							)}
							{currentFilters.status && (
								<FilterPill
									label={`Status: ${currentFilters.status}`}
									onClear={() => clearFilter("status")}
								/>
							)}
							{currentFilters.eventType && (
								<FilterPill
									label={`Event: ${currentFilters.eventType}`}
									onClear={() => clearFilter("eventType")}
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

			<div
				className={cn(
					"flex-1 overflow-y-auto py-4 px-6 lg:px-8 transition-opacity duration-200",
					isPending && "opacity-50 pointer-events-none",
				)}
			>
				{activities.length === 0 ? (
					<div className="border border-dashed border-border/40 rounded-xl p-20 text-center">
						<div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-muted/30 mb-4">
							<Activity className="h-5 w-5 text-muted-foreground/30" />
						</div>
						<p className="text-sm font-medium text-muted-foreground">
							{hasActiveFilters ? "No matching events" : "No activity yet"}
						</p>
						<p className="text-xs text-muted-foreground/60 mt-1.5 max-w-[280px] mx-auto">
							{hasActiveFilters
								? "Try adjusting your filters or search query."
								: "Events will appear here as agents execute tools and system changes occur."}
						</p>
						{hasActiveFilters && (
							<Button
								variant="outline"
								size="sm"
								className="mt-5 h-8 text-xs gap-1.5"
								onClick={clearAllFilters}
							>
								<XCircle className="h-3 w-3" />
								Clear filters
							</Button>
						)}
					</div>
				) : (
					<div className="space-y-5">
						{groups.map((group) => (
							<div key={group.label}>
								<div className="flex items-center gap-3 mb-2 px-1">
									<span className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-widest">
										{group.label}
									</span>
									<div className="flex-1 h-px bg-gradient-to-r from-border/40 to-transparent" />
									<span className="text-[10px] text-muted-foreground/30 tabular-nums font-medium">
										{group.items.length}
									</span>
								</div>
								<div className="rounded-xl border border-border/50 divide-y divide-border/30 overflow-hidden bg-background">
									{group.items.map((item) => (
										<ActivityRow
											key={item.id}
											item={item}
											onOpen={() => setSelectedItem(item)}
										/>
									))}
								</div>
							</div>
						))}
					</div>
				)}
			</div>

			{total > 0 && (
				<div className="bg-background border-t border-border/40 px-6 lg:px-8 py-3 flex items-center justify-between shrink-0">
					<p className="text-[12px] text-muted-foreground tabular-nums">
						{startItem}&ndash;{endItem} of {total.toLocaleString()}
					</p>
					<div className="flex items-center gap-1">
						<Button
							variant="outline"
							size="icon"
							className="h-7 w-7 border-border/60"
							disabled={page <= 1}
							onClick={() => goToPage(1)}
						>
							<ChevronsLeft className="h-3.5 w-3.5" />
						</Button>
						<Button
							variant="outline"
							size="icon"
							className="h-7 w-7 border-border/60"
							disabled={page <= 1}
							onClick={() => goToPage(page - 1)}
						>
							<ChevronLeft className="h-3.5 w-3.5" />
						</Button>

						<PageNumbers current={page} total={totalPages} onPage={goToPage} />

						<Button
							variant="outline"
							size="icon"
							className="h-7 w-7 border-border/60"
							disabled={page >= totalPages}
							onClick={() => goToPage(page + 1)}
						>
							<ChevronRight className="h-3.5 w-3.5" />
						</Button>
						<Button
							variant="outline"
							size="icon"
							className="h-7 w-7 border-border/60"
							disabled={page >= totalPages}
							onClick={() => goToPage(totalPages)}
						>
							<ChevronsRight className="h-3.5 w-3.5" />
						</Button>
					</div>
				</div>
			)}

			<ActivityDetail
				item={selectedItem}
				onClose={() => setSelectedItem(null)}
			/>
		</div>
	);
}

function ActivityRow({
	item,
	onOpen,
}: {
	item: ActivityItem;
	onOpen: () => void;
}) {
	const Icon = getEventIcon(item);
	const iconStyle = getEventIconStyle(item);
	const isAudit = item.kind === "audit";

	return (
		<button
			type="button"
			onClick={onOpen}
			className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/[0.04] transition-all text-left group"
		>
			<div
				className={cn(
					"flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-105",
					iconStyle,
				)}
			>
				<Icon className="h-3.5 w-3.5" />
			</div>

			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2">
					<span className="font-medium text-[13px] truncate">
						{isAudit && item.eventType
							? formatEventType(item.eventType)
							: item.tool}
					</span>
					{isAudit && item.eventType && (
						<span
							className={cn(
								"text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded",
								EVENT_CATEGORIES[getEventCategory(item.eventType)]
									? `${EVENT_CATEGORIES[getEventCategory(item.eventType)].color} bg-current/8`
									: "text-muted-foreground bg-muted/50",
							)}
							style={{
								backgroundColor: `color-mix(in srgb, currentColor 8%, transparent)`,
							}}
						>
							{EVENT_CATEGORIES[getEventCategory(item.eventType)]?.label ??
								getEventCategory(item.eventType)}
						</span>
					)}
					{!isAudit && item.provider && (
						<span className="font-mono text-[9px] bg-muted/50 px-1.5 py-0.5 rounded text-muted-foreground/70 shrink-0">
							{item.provider}
						</span>
					)}
				</div>
				<div className="flex items-center gap-2 mt-0.5">
					{item.agentName && (
						<p className="text-[11px] text-muted-foreground/50 truncate">
							{item.agentName}
						</p>
					)}
					{isAudit && item.actorId && !item.agentName && (
						<p className="text-[11px] text-muted-foreground/50 truncate">
							{item.actorType === "system"
								? "System"
								: item.actorType === "agent"
									? "Agent action"
									: `User ${item.actorId.slice(0, 8)}\u2026`}
						</p>
					)}
				</div>
			</div>

			<div className="flex items-center gap-3 shrink-0">
				{!isAudit && item.durationMs != null && item.durationMs > 0 && (
					<span className="flex items-center gap-1 text-[11px] text-muted-foreground/40 tabular-nums">
						<Clock className="h-3 w-3" />
						{item.durationMs < 1000
							? `${item.durationMs}ms`
							: `${(item.durationMs / 1000).toFixed(1)}s`}
					</span>
				)}

				{!isAudit && (
					<span
						className={cn(
							"inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
							item.status === "error"
								? "bg-red-500/8 text-red-500"
								: "bg-emerald-500/8 text-emerald-600 dark:text-emerald-400",
						)}
					>
						{item.status}
					</span>
				)}

				<span className="text-[11px] text-muted-foreground/40 tabular-nums w-16 text-right">
					{formatRelativeTime(item.createdAt)}
				</span>

				<ArrowRight className="h-3 w-3 text-muted-foreground/20 opacity-0 group-hover:opacity-100 transition-opacity -mr-0.5" />
			</div>
		</button>
	);
}

function ActivityDetail({
	item,
	onClose,
}: {
	item: ActivityItem | null;
	onClose: () => void;
}) {
	const metadata = item ? parseMetadata(item.metadata) : null;
	const Icon = item ? getEventIcon(item) : Activity;
	const iconStyle = item ? getEventIconStyle(item) : "";

	return (
		<Dialog open={!!item} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
				{item && (
					<>
						<DialogHeader className="px-6 pt-6 pb-4 border-b border-border/30">
							<div className="flex items-start gap-3">
								<div
									className={cn(
										"flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
										iconStyle,
									)}
								>
									<Icon className="h-4.5 w-4.5" />
								</div>
								<div className="min-w-0 flex-1">
									<DialogTitle className="text-[15px] font-semibold truncate leading-snug">
										{item.kind === "audit" && item.eventType
											? formatEventType(item.eventType)
											: item.tool}
									</DialogTitle>
									<DialogDescription className="text-[12px] mt-1">
										{formatFullTime(item.createdAt)}
									</DialogDescription>
								</div>
							</div>
						</DialogHeader>

						<div className="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
							<div className="grid grid-cols-2 gap-3">
								<DetailField label="Type">
									<span
										className={cn(
											"inline-flex items-center gap-1.5 text-[12px] font-medium",
											item.kind === "audit"
												? "text-sky-600 dark:text-sky-400"
												: "text-foreground",
										)}
									>
										{item.kind === "audit" ? (
											<>
												<Shield className="h-3 w-3" />
												Audit Event
											</>
										) : (
											<>
												<Wrench className="h-3 w-3" />
												Tool Call
											</>
										)}
									</span>
								</DetailField>

								{item.kind === "tool" && (
									<DetailField label="Status">
										<span
											className={cn(
												"inline-flex items-center gap-1.5 text-[12px] font-medium",
												item.status === "error"
													? "text-red-500"
													: "text-emerald-600 dark:text-emerald-400",
											)}
										>
											{item.status === "error" ? (
												<XCircle className="h-3 w-3" />
											) : (
												<Eye className="h-3 w-3" />
											)}
											{item.status}
										</span>
									</DetailField>
								)}

								{item.eventType && (
									<DetailField label="Event">
										<span className="text-[12px] font-mono text-foreground/80">
											{item.eventType}
										</span>
									</DetailField>
								)}

								{item.provider && (
									<DetailField label="Provider">
										<span className="text-[12px] font-mono text-foreground/80">
											{item.provider}
										</span>
									</DetailField>
								)}

								{item.agentName && (
									<DetailField label="Agent">
										<span className="text-[12px] text-foreground/80">
											{item.agentName}
										</span>
									</DetailField>
								)}

								{item.agentId && (
									<DetailField label="Agent ID">
										<span className="text-[12px] font-mono text-foreground/60 truncate block">
											{item.agentId}
										</span>
									</DetailField>
								)}

								{item.actorId && (
									<DetailField label="Actor">
										<span className="text-[12px] text-foreground/80">
											{item.actorType === "system"
												? "System"
												: `${item.actorType ?? "user"}: ${item.actorId.slice(0, 12)}\u2026`}
										</span>
									</DetailField>
								)}

								{item.durationMs != null && item.durationMs > 0 && (
									<DetailField label="Duration">
										<span className="text-[12px] tabular-nums text-foreground/80">
											{item.durationMs < 1000
												? `${item.durationMs}ms`
												: `${(item.durationMs / 1000).toFixed(2)}s`}
										</span>
									</DetailField>
								)}
							</div>

							{item.error && (
								<div>
									<p className="text-[11px] font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
										Error
									</p>
									<div className="rounded-lg bg-red-500/[0.04] border border-red-500/10 px-3 py-2.5">
										<p className="text-[12px] text-red-600 dark:text-red-400 font-mono whitespace-pre-wrap break-all leading-relaxed">
											{item.error}
										</p>
									</div>
								</div>
							)}

							{metadata?.toolArgs != null && (
								<ExpandableCode
									label="Input"
									value={metadata.toolArgs}
								/>
							)}

							{metadata?.toolOutput != null && (
								<ExpandableCode
									label="Output"
									value={metadata.toolOutput}
								/>
							)}

							{metadata &&
								Object.keys(metadata).some(
									(k) => k !== "toolArgs" && k !== "toolOutput",
								) && (
									<div>
										<p className="text-[11px] font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
											Metadata
										</p>
										<div className="rounded-lg border border-border/50 overflow-hidden divide-y divide-border/30">
											{Object.entries(metadata)
												.filter(
													([key]) =>
														key !== "toolArgs" && key !== "toolOutput",
												)
												.map(([key, value]) => (
													<div
														key={key}
														className="flex items-start gap-3 px-3 py-2 text-[12px]"
													>
														<span className="font-mono text-muted-foreground/60 shrink-0 w-28 truncate pt-px">
															{key}
														</span>
														<span className="font-mono text-foreground/80 break-all flex-1">
															{typeof value === "string"
																? value
																: JSON.stringify(value)}
														</span>
													</div>
												))}
										</div>
									</div>
								)}
						</div>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}

function DetailField({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div>
			<p className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider mb-1">
				{label}
			</p>
			{children}
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
						className="w-7 text-center text-[11px] text-muted-foreground/40"
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
