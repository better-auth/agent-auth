"use client";

import {
	Check,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	Clock,
	Fingerprint,
	History,
	Loader2,
	RefreshCw,
	ShieldCheck,
	X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ReAuthDialog, useReAuth } from "@/components/auth/re-auth-dialog";
import { Button } from "@/components/ui/button";
import type {
	ApprovalHistoryEntry,
	CibaPendingRequest,
} from "@/lib/auth/agent-api";
import {
	approveCibaRequest,
	denyCibaRequest,
	fetchApprovalHistory,
	listPendingCibaRequests,
	recordApprovalEvent,
} from "@/lib/auth/agent-api";
import { cn } from "@/lib/utils";

const POLL_INTERVAL = 5000;
const HISTORY_PAGE_SIZE = 10;

function formatRelativeTime(d: string | Date | null): string {
	if (!d) return "Never";
	const date = d instanceof Date ? d : new Date(d);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffSec = Math.floor(diffMs / 1000);
	const diffMin = Math.floor(diffSec / 60);
	const diffHour = Math.floor(diffMin / 60);
	const diffDay = Math.floor(diffHour / 24);
	if (diffSec < 60) return "Just now";
	if (diffMin < 60) return `${diffMin}m ago`;
	if (diffHour < 24) return `${diffHour}h ago`;
	if (diffDay < 7) return `${diffDay}d ago`;
	return date.toLocaleDateString();
}

function formatTimeLeft(seconds: number): string {
	if (seconds <= 0) return "Expired";
	const m = Math.floor(seconds / 60);
	const s = seconds % 60;
	if (m > 0) return `${m}m ${s}s`;
	return `${s}s`;
}

function RequestCard({
	request,
	onResponded,
	onReAuthNeeded,
	orgId,
}: {
	request: CibaPendingRequest;
	onResponded: (id: string, action: "approved" | "denied") => void;
	onReAuthNeeded: () => Promise<void>;
	orgId: string;
}) {
	const [expanded, setExpanded] = useState(false);
	const [approving, setApproving] = useState(false);
	const [denying, setDenying] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [timeLeft, setTimeLeft] = useState(request.expires_in);

	useEffect(() => {
		const interval = setInterval(() => {
			setTimeLeft((t) => Math.max(0, t - 1));
		}, 1000);
		return () => clearInterval(interval);
	}, []);

	const recordEvent = (action: "approved" | "denied") => {
		void recordApprovalEvent({
			orgId,
			action,
			requestType: "ciba",
			requestId: request.auth_req_id,
			clientId: request.client_id,
			scopes: request.scope ?? undefined,
			bindingMessage: request.binding_message ?? undefined,
		});
	};

	const handleApprove = async (e: React.MouseEvent) => {
		e.stopPropagation();
		setError(null);
		setApproving(true);
		const res = await approveCibaRequest(request.auth_req_id);
		if (res.code === "FRESH_SESSION_REQUIRED") {
			try {
				await onReAuthNeeded();
				const retry = await approveCibaRequest(request.auth_req_id);
				if (retry.error) {
					setError(retry.error);
					setApproving(false);
				} else {
					recordEvent("approved");
					onResponded(request.auth_req_id, "approved");
				}
			} catch {
				setError(null);
				setApproving(false);
			}
			return;
		}
		if (res.error) {
			setError(res.error);
			setApproving(false);
		} else {
			recordEvent("approved");
			onResponded(request.auth_req_id, "approved");
		}
	};

	const handleDeny = async (e: React.MouseEvent) => {
		e.stopPropagation();
		setError(null);
		setDenying(true);
		const res = await denyCibaRequest(request.auth_req_id);
		if (res.error) {
			setError(res.error);
			setDenying(false);
		} else {
			recordEvent("denied");
			onResponded(request.auth_req_id, "denied");
		}
	};

	const expired = timeLeft <= 0;

	return (
		<div
			className={cn(
				"border border-border/60 rounded-lg overflow-hidden bg-card/50 transition-colors",
				expired && "opacity-60",
			)}
		>
			<div
				className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-accent/30 transition-colors"
				onClick={() => setExpanded(!expanded)}
			>
				<div className="flex items-center gap-3 min-w-0">
					<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-500/10">
						<Fingerprint className="h-4 w-4 text-amber-600 dark:text-amber-400" />
					</div>
					<div className="min-w-0">
						<div className="flex items-center gap-2">
							<p className="font-medium text-sm truncate">
								{request.binding_message || "Agent authentication request"}
							</p>
							{expired ? (
								<span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
									expired
								</span>
							) : (
								<span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
									pending
								</span>
							)}
						</div>
						<p className="text-xs text-muted-foreground">
							{request.client_id} &middot;{" "}
							{formatRelativeTime(request.created_at)}
						</p>
					</div>
				</div>

				<div className="flex items-center gap-2 shrink-0">
					{!expired && (
						<div className="flex items-center gap-1 text-xs text-muted-foreground mr-2">
							<Clock className="h-3 w-3" />
							<span className="tabular-nums">{formatTimeLeft(timeLeft)}</span>
						</div>
					)}
					{!expired && (
						<>
							<Button
								variant="outline"
								size="sm"
								className="h-7 text-xs"
								onClick={handleDeny}
								disabled={denying || approving}
							>
								{denying ? (
									<Loader2 className="h-3 w-3 animate-spin" />
								) : (
									<>
										<X className="h-3 w-3 mr-1" />
										Deny
									</>
								)}
							</Button>
							<Button
								size="sm"
								className="h-7 text-xs"
								onClick={handleApprove}
								disabled={approving || denying}
							>
								{approving ? (
									<Loader2 className="h-3 w-3 animate-spin" />
								) : (
									<>
										<Check className="h-3 w-3 mr-1" />
										Approve
									</>
								)}
							</Button>
						</>
					)}
					{expanded ? (
						<ChevronDown className="h-4 w-4 text-muted-foreground" />
					) : (
						<ChevronRight className="h-4 w-4 text-muted-foreground" />
					)}
				</div>
			</div>

			{expanded && (
				<div className="border-t border-border/40 p-4 space-y-3">
					{error && (
						<div className="p-2.5 border border-destructive/30 bg-destructive/5 text-xs text-destructive rounded-md">
							{error}
						</div>
					)}

					<div className="grid grid-cols-2 gap-4 text-xs">
						<div>
							<span className="text-muted-foreground">Request ID</span>
							<p className="mt-0.5 font-mono text-[11px] break-all">
								{request.auth_req_id}
							</p>
						</div>
						<div>
							<span className="text-muted-foreground">Client</span>
							<p className="mt-0.5 font-mono text-[11px]">
								{request.client_id}
							</p>
						</div>
					</div>

					{request.scope && (
						<div>
							<p className="text-xs text-muted-foreground mb-1.5">
								Requested Scopes
							</p>
							<div className="flex flex-wrap gap-1">
								{request.scope.split(" ").map((s) => (
									<span
										key={s}
										className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground"
									>
										{s}
									</span>
								))}
							</div>
						</div>
					)}

					{request.binding_message && (
						<div>
							<p className="text-xs text-muted-foreground mb-1">Message</p>
							<p className="text-sm bg-muted/50 rounded-md p-2.5">
								{request.binding_message}
							</p>
						</div>
					)}

					<div className="grid grid-cols-2 gap-4 text-xs">
						<div>
							<span className="text-muted-foreground">Delivery Mode</span>
							<p className="mt-0.5">{request.delivery_mode}</p>
						</div>
						<div>
							<span className="text-muted-foreground">Time Remaining</span>
							<p
								className={cn(
									"mt-0.5",
									expired && "text-destructive",
									!expired && timeLeft < 60 && "text-amber-600",
								)}
							>
								{formatTimeLeft(timeLeft)}
							</p>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

function HistoryRow({ entry }: { entry: ApprovalHistoryEntry }) {
	const [expanded, setExpanded] = useState(false);
	const isApproved = entry.action === "approved";

	return (
		<div className="border border-border/40 rounded-lg overflow-hidden bg-card/30">
			<div
				className="px-4 py-2.5 flex items-center justify-between cursor-pointer hover:bg-accent/20 transition-colors"
				onClick={() => setExpanded(!expanded)}
			>
				<div className="flex items-center gap-3 min-w-0">
					<div
						className={cn(
							"flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
							isApproved
								? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
								: "bg-red-500/10 text-red-600 dark:text-red-400",
						)}
					>
						{isApproved ? (
							<Check className="h-3 w-3" />
						) : (
							<X className="h-3 w-3" />
						)}
					</div>
					<div className="min-w-0">
						<div className="flex items-center gap-2">
							<p className="text-sm truncate">
								{entry.bindingMessage || entry.clientId || "Request"}
							</p>
							<span
								className={cn(
									"text-[10px] font-medium px-1.5 py-0.5 rounded-full",
									isApproved
										? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
										: "bg-red-500/10 text-red-600 dark:text-red-400",
								)}
							>
								{entry.action}
							</span>
						</div>
						<p className="text-xs text-muted-foreground">
							{entry.requestType} &middot; {formatRelativeTime(entry.createdAt)}
						</p>
					</div>
				</div>
				<div className="shrink-0">
					{expanded ? (
						<ChevronDown className="h-4 w-4 text-muted-foreground" />
					) : (
						<ChevronRight className="h-4 w-4 text-muted-foreground" />
					)}
				</div>
			</div>

			{expanded && (
				<div className="border-t border-border/30 p-4 space-y-3">
					<div className="grid grid-cols-2 gap-4 text-xs">
						{entry.requestId && (
							<div>
								<span className="text-muted-foreground">Request ID</span>
								<p className="mt-0.5 font-mono text-[11px] break-all">
									{entry.requestId}
								</p>
							</div>
						)}
						{entry.clientId && (
							<div>
								<span className="text-muted-foreground">Client</span>
								<p className="mt-0.5 font-mono text-[11px]">{entry.clientId}</p>
							</div>
						)}
						{entry.agentName && (
							<div>
								<span className="text-muted-foreground">Agent</span>
								<p className="mt-0.5">{entry.agentName}</p>
							</div>
						)}
						<div>
							<span className="text-muted-foreground">Resolved at</span>
							<p className="mt-0.5">
								{new Date(entry.createdAt).toLocaleString()}
							</p>
						</div>
					</div>

					{entry.scopes && (
						<div>
							<p className="text-xs text-muted-foreground mb-1.5">Scopes</p>
							<div className="flex flex-wrap gap-1">
								{entry.scopes.split(" ").map((s) => (
									<span
										key={s}
										className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground"
									>
										{s}
									</span>
								))}
							</div>
						</div>
					)}

					{entry.bindingMessage && (
						<div>
							<p className="text-xs text-muted-foreground mb-1">Message</p>
							<p className="text-sm bg-muted/50 rounded-md p-2.5">
								{entry.bindingMessage}
							</p>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

function ApprovalHistorySection({ orgId }: { orgId: string }) {
	const [entries, setEntries] = useState<ApprovalHistoryEntry[]>([]);
	const [total, setTotal] = useState(0);
	const [loading, setLoading] = useState(true);
	const [page, setPage] = useState(0);

	const loadHistory = useCallback(
		async (pageNum: number) => {
			setLoading(true);
			const res = await fetchApprovalHistory(orgId, {
				limit: HISTORY_PAGE_SIZE,
				offset: pageNum * HISTORY_PAGE_SIZE,
			});
			setEntries(res.entries);
			setTotal(res.total);
			setLoading(false);
		},
		[orgId],
	);

	useEffect(() => {
		void loadHistory(page);
	}, [loadHistory, page]);

	const totalPages = Math.ceil(total / HISTORY_PAGE_SIZE);

	if (loading && entries.length === 0) {
		return (
			<div className="flex items-center justify-center py-8">
				<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
			</div>
		);
	}

	if (total === 0) {
		return (
			<div className="border border-dashed border-border/60 rounded-lg p-8 text-center">
				<History className="h-5 w-5 mx-auto mb-2 text-muted-foreground/30" />
				<p className="text-sm text-muted-foreground">
					No approval history yet.
				</p>
				<p className="text-xs text-muted-foreground/60 mt-1">
					Approvals and denials will appear here after you respond to requests.
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-2">
			{entries.map((entry) => (
				<HistoryRow key={entry.id} entry={entry} />
			))}

			{totalPages > 1 && (
				<div className="flex items-center justify-between pt-2">
					<p className="text-xs text-muted-foreground">
						{total} total &middot; Page {page + 1} of {totalPages}
					</p>
					<div className="flex items-center gap-1">
						<Button
							variant="outline"
							size="sm"
							className="h-7 w-7 p-0"
							onClick={() => setPage((p) => Math.max(0, p - 1))}
							disabled={page === 0 || loading}
						>
							<ChevronLeft className="h-3 w-3" />
						</Button>
						<Button
							variant="outline"
							size="sm"
							className="h-7 w-7 p-0"
							onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
							disabled={page >= totalPages - 1 || loading}
						>
							<ChevronRight className="h-3 w-3" />
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}

export function ApprovalsClient({
	currentUserId,
	orgId,
	userEmail,
	allowedReAuthMethods,
}: {
	currentUserId: string;
	orgId: string;
	userEmail?: string;
	allowedReAuthMethods?: ("password" | "passkey" | "email_otp")[];
}) {
	const [requests, setRequests] = useState<CibaPendingRequest[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [historyKey, setHistoryKey] = useState(0);
	const [historyOpen, setHistoryOpen] = useState(false);
	const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const reAuth = useReAuth();

	const fetchRequests = useCallback(async (showLoading = false) => {
		if (showLoading) setLoading(true);
		setError(null);
		try {
			const res = await listPendingCibaRequests();
			if (res.error) {
				setError(res.error);
			} else {
				setRequests(res.data ?? []);
			}
		} catch {
			setError("Failed to load approval requests");
		}
		setLoading(false);
	}, []);

	useEffect(() => {
		void fetchRequests(true);
		pollRef.current = setInterval(() => fetchRequests(false), POLL_INTERVAL);
		return () => {
			if (pollRef.current) clearInterval(pollRef.current);
		};
	}, [fetchRequests]);

	const handleRefresh = async () => {
		setRefreshing(true);
		await fetchRequests(false);
		setRefreshing(false);
	};

	const handleResponded = (_id: string, _action: "approved" | "denied") => {
		setRequests((prev) => prev.filter((r) => r.auth_req_id !== _id));
		setHistoryKey((k) => k + 1);
	};

	return (
		<div className="flex flex-col h-full">
			<div className="sticky top-0 z-10 bg-background pb-4 pt-8 flex flex-col gap-6">
				<div className="flex items-center justify-between">
					<div>
						<h1 className="text-xl font-medium tracking-tight">Approvals</h1>
						<p className="text-sm text-muted-foreground mt-0.5">
							Review and respond to pending agent authentication requests.
						</p>
					</div>
					<Button
						variant="outline"
						size="sm"
						className="h-8 text-xs border-dashed"
						onClick={handleRefresh}
						disabled={refreshing}
					>
						<RefreshCw
							className={cn("h-3 w-3 mr-1.5", refreshing && "animate-spin")}
						/>
						Refresh
					</Button>
				</div>

				<div className="grid grid-cols-2 gap-3">
					<div className="border border-border/60 rounded-lg p-4 bg-card/30">
						<p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
							Pending
						</p>
						<p className="text-2xl font-semibold tracking-tight mt-1">
							{requests.length}
						</p>
					</div>
					<div className="border border-border/60 rounded-lg p-4 bg-card/30">
						<p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
							Poll Interval
						</p>
						<p className="text-2xl font-semibold tracking-tight mt-1">
							{POLL_INTERVAL / 1000}s
						</p>
					</div>
				</div>

				{error && (
					<div className="p-3 border border-destructive/30 bg-destructive/5 text-sm text-destructive rounded-lg">
						{error}
					</div>
				)}

				<div className="h-px bg-border/40 -mx-6 lg:-mx-8" />
			</div>

			<div className="flex-1 min-h-0 pt-4 pb-8 space-y-8">
				{/* Pending requests */}
				<section>
					<h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
						<Fingerprint className="h-3.5 w-3.5" />
						Pending Requests
					</h2>
					{loading ? (
						<div className="flex items-center justify-center py-12">
							<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
						</div>
					) : requests.length === 0 ? (
						<div className="border border-dashed border-border/60 rounded-lg p-12 text-center">
							<ShieldCheck className="h-6 w-6 mx-auto mb-3 text-muted-foreground/30" />
							<p className="text-sm text-muted-foreground">
								No pending approval requests.
							</p>
							<p className="text-xs text-muted-foreground/60 mt-1">
								When an agent requests access via CIBA, it will appear here for
								your review.
							</p>
						</div>
					) : (
						<div className="space-y-2">
							{requests.map((req) => (
								<RequestCard
									key={req.auth_req_id}
									request={req}
									onResponded={handleResponded}
									onReAuthNeeded={reAuth.requestReAuth}
									orgId={orgId}
								/>
							))}
						</div>
					)}
				</section>

				{/* History */}
				<section>
					<button
						type="button"
						className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-3 hover:text-foreground transition-colors"
						onClick={() => setHistoryOpen((o) => !o)}
					>
						{historyOpen ? (
							<ChevronDown className="h-3.5 w-3.5" />
						) : (
							<ChevronRight className="h-3.5 w-3.5" />
						)}
						<History className="h-3.5 w-3.5" />
						History
					</button>
					{historyOpen && (
						<ApprovalHistorySection key={historyKey} orgId={orgId} />
					)}
				</section>
			</div>

			<ReAuthDialog
				open={reAuth.open}
				onOpenChange={reAuth.onOpenChange}
				onSuccess={reAuth.onSuccess}
				allowedMethods={allowedReAuthMethods}
				userEmail={userEmail}
				title="Re-authenticate to approve"
				description="A fresh session is required to approve agent requests."
			/>
		</div>
	);
}
