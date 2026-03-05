import {
	Check,
	ChevronDown,
	ChevronRight,
	Clock,
	Fingerprint,
	KeyRound,
	Loader2,
	Mail,
	RefreshCw,
	ShieldCheck,
	X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	approveRequest,
	denyRequest,
	fetchReAuthConfig,
	listPendingApprovals,
	reAuthSendOtp,
	reAuthVerifyOtp,
	reAuthWithPassword,
} from "@/lib/api";
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

	const [showReAuth, setShowReAuth] = useState(false);

	const handleApprove = async (e: React.MouseEvent) => {
		e.stopPropagation();
		setError(null);
		setApproving(true);
		const res = await approveRequest(request.auth_req_id);
		if (res.code === "FRESH_SESSION_REQUIRED") {
			setShowReAuth(true);
			setApproving(false);
			return;
		}
		if (res.error) {
			setError(res.error);
			setApproving(false);
		} else {
			onResponded(request.auth_req_id);
		}
	};

	const handleReAuthSuccess = async () => {
		setShowReAuth(false);
		setError(null);
		setApproving(true);
		const res = await approveRequest(request.auth_req_id);
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
			<div className="px-3 pb-2.5">
				{showReAuth ? (
					<InlineReAuth
						onSuccess={handleReAuthSuccess}
						onCancel={() => setShowReAuth(false)}
					/>
				) : (
					<div className="flex items-center gap-1.5">
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
					</div>
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
					<div className="pt-1">
						{showReAuth ? (
							<InlineReAuth
								onSuccess={handleReAuthSuccess}
								onCancel={() => setShowReAuth(false)}
							/>
						) : (
							<div className="flex items-center gap-1.5">
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
			)}
		</div>
	);
}

type ReAuthMethod = "password" | "passkey" | "email_otp";

function InlineReAuth({
	onSuccess,
	onCancel,
}: {
	onSuccess: () => void;
	onCancel: () => void;
}) {
	const [methods, setMethods] = useState<ReAuthMethod[] | null>(null);
	const [method, setMethod] = useState<ReAuthMethod>("password");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [otp, setOtp] = useState("");
	const [otpSent, setOtpSent] = useState(false);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		void storage.getUser().then((user) => {
			if (user?.email) setEmail(user.email);
		});
		void fetchReAuthConfig().then((config) => {
			const all = (config.allowedMethods ?? ["password"]) as ReAuthMethod[];
			const inline = all.filter((m) => m !== "passkey");
			const allowed = inline.length > 0 ? inline : (["password"] as ReAuthMethod[]);
			setMethods(allowed);
			setMethod(allowed[0]);
		});
	}, []);

	const handlePassword = async () => {
		if (!email || !password) return;
		setLoading(true);
		setError(null);
		const res = await reAuthWithPassword(email, password);
		if (res.error) {
			setError(res.error);
			setLoading(false);
			return;
		}
		onSuccess();
	};

	const handleSendOtp = async () => {
		if (!email) return;
		setLoading(true);
		setError(null);
		const res = await reAuthSendOtp(email);
		if (res.error) {
			setError(res.error);
			setLoading(false);
			return;
		}
		setOtpSent(true);
		setLoading(false);
	};

	const handleVerifyOtp = async () => {
		if (!email || !otp) return;
		setLoading(true);
		setError(null);
		const res = await reAuthVerifyOtp(email, otp);
		if (res.error) {
			setError(res.error);
			setLoading(false);
			return;
		}
		onSuccess();
	};

	if (!methods) {
		return (
			<div className="flex items-center justify-center py-3">
				<Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
			</div>
		);
	}

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<p className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
					Confirm identity to approve
				</p>
				<button
					type="button"
					onClick={onCancel}
					className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
				>
					Cancel
				</button>
			</div>

			{methods.length > 1 && (
				<div className="flex gap-px p-px bg-muted/50 rounded-sm border border-border/40">
					{methods.map((m) => {
						const Icon = m === "password" ? KeyRound : Mail;
						const label = m === "password" ? "Password" : "Email Code";
						return (
							<button
								key={m}
								type="button"
								onClick={() => {
									setMethod(m);
									setError(null);
								}}
								className={cn(
									"flex-1 flex items-center justify-center gap-1 px-2 py-1 text-[10px] font-medium rounded-[2px] transition-all",
									method === m
										? "bg-background text-foreground shadow-xs"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								<Icon className="h-2.5 w-2.5" />
								{label}
							</button>
						);
					})}
				</div>
			)}

			{method === "password" && (
				<form
				onSubmit={(e) => {
					e.preventDefault();
					void handlePassword();
				}}
					className="flex gap-1.5"
				>
					<input
						type="password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						placeholder="Password"
						autoFocus
						className="flex-1 min-w-0 h-7 px-2 text-xs bg-background border border-border rounded-sm outline-none focus:border-foreground/30 transition-colors"
					/>
					<Button type="submit" size="xs" disabled={loading || !password}>
						{loading ? (
							<Loader2 className="h-3 w-3 animate-spin" />
						) : (
							<Check className="h-3 w-3" />
						)}
					</Button>
				</form>
			)}

			{method === "email_otp" && !otpSent && (
				<Button
					size="xs"
					className="w-full"
					onClick={handleSendOtp}
					disabled={loading || !email}
				>
					{loading ? (
						<Loader2 className="h-3 w-3 animate-spin" />
					) : (
						<>
							<Mail className="h-3 w-3" />
							Send code to {email}
						</>
					)}
				</Button>
			)}

			{method === "email_otp" && otpSent && (
				<form
				onSubmit={(e) => {
					e.preventDefault();
					void handleVerifyOtp();
				}}
					className="space-y-1.5"
				>
					<p className="text-[10px] text-muted-foreground">
						Code sent to {email}
					</p>
					<div className="flex gap-1.5">
						<input
							value={otp}
							onChange={(e) => setOtp(e.target.value)}
							placeholder="Enter code"
							autoFocus
							className="flex-1 min-w-0 h-7 px-2 text-xs bg-background border border-border rounded-sm outline-none focus:border-foreground/30 transition-colors font-mono text-center tracking-widest"
						/>
						<Button type="submit" size="xs" disabled={loading || !otp}>
							{loading ? (
								<Loader2 className="h-3 w-3 animate-spin" />
							) : (
								<Check className="h-3 w-3" />
							)}
						</Button>
					</div>
				</form>
			)}

			{error && (
				<p className="text-[10px] text-destructive bg-destructive/5 border border-destructive/20 rounded-sm px-2 py-1">
					{error}
				</p>
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
			if (next.length === 0) {
				setTimeout(() => {
					chrome.runtime.sendMessage({ type: "close-side-panel" });
				}, 600);
			}
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
