import {
	Check,
	ChevronDown,
	ChevronRight,
	Clock,
	ExternalLink,
	Fingerprint,
	Loader2,
	RefreshCw,
	ShieldCheck,
	X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { approveRequest, denyRequest, listPendingApprovals } from "@/lib/api";
import { storage } from "@/lib/storage";
import type { CibaPendingRequest } from "@/lib/types";
import { cn, formatRelativeTime, formatTimeLeft } from "@/lib/utils";

const POLL_INTERVAL = 5000;

function RequestCard({
	request,
	onResponded,
}: {
	request: CibaPendingRequest;
	onResponded: (id: string) => void;
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

	const [waitingReAuth, setWaitingReAuth] = useState(false);
	const retryIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const retryStartRef = useRef<number>(0);

	const REAUTH_TIMEOUT_MS = 120_000;

	useEffect(() => {
		return () => {
			if (retryIntervalRef.current) clearInterval(retryIntervalRef.current);
		};
	}, []);

	const stopRetryPolling = () => {
		if (retryIntervalRef.current) clearInterval(retryIntervalRef.current);
		retryIntervalRef.current = null;
		retryStartRef.current = 0;
	};

	const startRetryPolling = (reqId: string) => {
		stopRetryPolling();
		retryStartRef.current = Date.now();
		retryIntervalRef.current = setInterval(async () => {
			if (Date.now() - retryStartRef.current > REAUTH_TIMEOUT_MS) {
				stopRetryPolling();
				setWaitingReAuth(false);
				setError("Re-authentication timed out. Please try again.");
				setApproving(false);
				return;
			}
			const retry = await approveRequest(reqId);
			if (retry.code === "FRESH_SESSION_REQUIRED") return;
			stopRetryPolling();
			setWaitingReAuth(false);
			if (retry.error) {
				setError(retry.error);
				setApproving(false);
			} else {
				onResponded(reqId);
			}
		}, 3000);
	};

	const handleApprove = async (e: React.MouseEvent) => {
		e.stopPropagation();
		setError(null);
		setApproving(true);
		const res = await approveRequest(request.auth_req_id);
		if (res.code === "FRESH_SESSION_REQUIRED") {
			const idpUrl = await storage.getIdpUrl();
			if (idpUrl) {
				setWaitingReAuth(true);
				setError(null);
				window.electronAPI.openReAuth(idpUrl).then((success) => {
					if (success) {
						startRetryPolling(request.auth_req_id);
					} else {
						setWaitingReAuth(false);
						setError("Re-authentication was cancelled.");
						setApproving(false);
					}
				});
			} else {
				setError(
					"Re-authentication required but server URL is not configured.",
				);
				setApproving(false);
			}
			return;
		}
		if (res.error) {
			setError(res.error);
			setApproving(false);
		} else {
			onResponded(request.auth_req_id);
		}
	};

	const handleDeny = async (e: React.MouseEvent) => {
		e.stopPropagation();
		setError(null);
		setDenying(true);
		const res = await denyRequest(request.auth_req_id);
		if (res.error) {
			setError(res.error);
			setDenying(false);
		} else {
			onResponded(request.auth_req_id);
		}
	};

	const expired = timeLeft <= 0;

	return (
		<div
			className={cn(
				"border border-border rounded-sm overflow-hidden bg-card/50 transition-colors",
				expired && "opacity-50",
			)}
		>
			<div
				className="px-3 py-2.5 flex items-center justify-between cursor-pointer hover:bg-accent/30 transition-colors"
				onClick={() => setExpanded(!expanded)}
			>
				<div className="flex items-center gap-2.5 min-w-0 flex-1">
					<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-amber-500/10">
						<Fingerprint className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
					</div>
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-1.5">
							<p className="font-medium text-xs truncate">
								{request.binding_message || "Agent auth request"}
							</p>
							{expired ? (
								<span className="text-[9px] font-medium px-1.5 py-0.5 rounded-sm bg-muted text-muted-foreground shrink-0 uppercase tracking-wide">
									expired
								</span>
							) : (
								<span className="text-[9px] font-medium px-1.5 py-0.5 rounded-sm bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0 uppercase tracking-wide">
									pending
								</span>
							)}
						</div>
						<p className="text-[11px] text-muted-foreground truncate">
							{request.client_id} &middot;{" "}
							{formatRelativeTime(request.created_at)}
						</p>
					</div>
				</div>

				<div className="flex items-center gap-1.5 shrink-0 ml-2">
					{!expired && (
						<div className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
							<Clock className="h-3 w-3" />
							<span className="tabular-nums">{formatTimeLeft(timeLeft)}</span>
						</div>
					)}
					{expanded ? (
						<ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
					) : (
						<ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
					)}
				</div>
			</div>

			{!expanded && !expired && (
				<div className="px-3 pb-2.5 flex items-center gap-1.5">
					{waitingReAuth ? (
						<div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
							<ExternalLink className="h-3 w-3" />
							<span>Re-authenticate in the browser to continue...</span>
						</div>
					) : (
						<>
							<Button
								variant="outline"
								size="xs"
								onClick={handleDeny}
								disabled={denying || approving}
							>
								{denying ? (
									<Loader2 className="h-3 w-3 animate-spin" />
								) : (
									<>
										<X className="h-3 w-3" />
										Deny
									</>
								)}
							</Button>
							<Button
								size="xs"
								onClick={handleApprove}
								disabled={approving || denying}
							>
								{approving ? (
									<Loader2 className="h-3 w-3 animate-spin" />
								) : (
									<>
										<Check className="h-3 w-3" />
										Approve
									</>
								)}
							</Button>
						</>
					)}
				</div>
			)}

			{expanded && (
				<div className="border-t border-border/40 px-3 py-2.5 space-y-2">
					{error && (
						<div className="p-2 border border-destructive/30 bg-destructive/5 text-[11px] text-destructive rounded-sm">
							{error}
						</div>
					)}

					{request.scope && (
						<div>
							<p className="text-[11px] text-muted-foreground mb-1 uppercase tracking-wider font-medium">
								Scopes
							</p>
							<div className="flex flex-wrap gap-1">
								{request.scope.split(" ").map((s) => (
									<span
										key={s}
										className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded-sm text-muted-foreground"
									>
										{s}
									</span>
								))}
							</div>
						</div>
					)}

					{request.binding_message && (
						<div>
							<p className="text-[11px] text-muted-foreground mb-1 uppercase tracking-wider font-medium">
								Message
							</p>
							<p className="text-xs bg-muted/50 rounded-sm p-2">
								{request.binding_message}
							</p>
						</div>
					)}

					<div className="grid grid-cols-2 gap-2 text-[11px]">
						<div>
							<span className="text-muted-foreground uppercase tracking-wider font-medium">
								Client
							</span>
							<p className="mt-0.5 font-mono text-[10px] truncate">
								{request.client_id}
							</p>
						</div>
						<div>
							<span className="text-muted-foreground uppercase tracking-wider font-medium">
								Time Left
							</span>
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

					{!expired && (
						<div className="flex items-center gap-1.5 pt-1">
							<Button
								variant="outline"
								size="xs"
								className="flex-1"
								onClick={handleDeny}
								disabled={denying || approving}
							>
								{denying ? (
									<Loader2 className="h-3 w-3 animate-spin" />
								) : (
									<>
										<X className="h-3 w-3" />
										Deny
									</>
								)}
							</Button>
							<Button
								size="xs"
								className="flex-1"
								onClick={handleApprove}
								disabled={approving || denying}
							>
								{approving ? (
									<Loader2 className="h-3 w-3 animate-spin" />
								) : (
									<>
										<Check className="h-3 w-3" />
										Approve
									</>
								)}
							</Button>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

export function Approvals({
	onCountChange,
}: {
	onCountChange: (count: number) => void;
}) {
	const [requests, setRequests] = useState<CibaPendingRequest[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const fetchRequests = useCallback(
		async (showLoading = false) => {
			if (showLoading) setLoading(true);
			setError(null);
			try {
				const res = await listPendingApprovals();
				if (res.error) {
					setError(res.error);
				} else {
					const data = res.data ?? [];
					setRequests(data);
					onCountChange(data.length);
					window.electronAPI.updateTray(data.length);
				}
			} catch {
				setError("Failed to load approvals");
			}
			setLoading(false);
		},
		[onCountChange],
	);

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

	const handleResponded = (id: string) => {
		setRequests((prev) => {
			const next = prev.filter((r) => r.auth_req_id !== id);
			onCountChange(next.length);
			window.electronAPI.updateTray(next.length);
			return next;
		});
	};

	return (
		<div className="p-3 space-y-3">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<span className="text-xs font-medium">{requests.length} pending</span>
				</div>
				<Button
					variant="ghost"
					size="xs"
					onClick={handleRefresh}
					disabled={refreshing}
				>
					<RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin")} />
					Refresh
				</Button>
			</div>

			{error && (
				<div className="p-2 border border-destructive/30 bg-destructive/5 text-[11px] text-destructive rounded-sm">
					{error}
				</div>
			)}

			{loading ? (
				<div className="flex items-center justify-center py-10">
					<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
				</div>
			) : requests.length === 0 ? (
				<div className="border border-dashed border-border rounded-sm py-10 text-center">
					<ShieldCheck className="h-5 w-5 mx-auto mb-2 text-muted-foreground/30" />
					<p className="text-xs text-muted-foreground">No pending approvals</p>
					<p className="text-[11px] text-muted-foreground/60 mt-0.5">
						Agent requests will appear here
					</p>
				</div>
			) : (
				<div className="space-y-2">
					{requests.map((req) => (
						<RequestCard
							key={req.auth_req_id}
							request={req}
							onResponded={handleResponded}
						/>
					))}
				</div>
			)}
		</div>
	);
}
