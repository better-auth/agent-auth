"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { authClient } from "@/lib/auth/client";

interface ScopeRequestData {
	agentId: string;
	agentName: string;
	existingScopes: string[];
	requestedScopes: string[];
	status: string;
}

export default function ScopeApprovalPage() {
	const router = useRouter();
	const params = useSearchParams();
	const requestId = params.get("request_id");
	const agentIdParam = params.get("agent_id");
	const { data: session } = authClient.useSession();

	const [data, setData] = useState<ScopeRequestData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [isApprovePending, startApprove] = useTransition();
	const [isDenyPending, startDeny] = useTransition();
	const [needsReauth, setNeedsReauth] = useState(false);
	const [pendingAction, setPendingAction] = useState<"approve" | "deny" | null>(
		null,
	);
	const [password, setPassword] = useState("");
	const [reauthLoading, setReauthLoading] = useState(false);

	const resolvedAgentId = agentIdParam || requestId;

	useEffect(() => {
		if (!resolvedAgentId) {
			setError("Missing request_id or agent_id parameter.");
			setLoading(false);
			return;
		}

		fetch(`/api/auth/agent/scope-request-status?requestId=${resolvedAgentId}`)
			.then(async (res) => {
				if (!res.ok) throw new Error("Failed to load scope request");
				return res.json();
			})
			.then((d) => {
				setData(d);
				setLoading(false);
			})
			.catch((err) => {
				setError(err.message);
				setLoading(false);
			});
	}, [resolvedAgentId]);

	async function submitAction(action: "approve" | "deny") {
		if (!resolvedAgentId) return;

		const res = await fetch("/api/auth/agent/approve-scope", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ requestId: resolvedAgentId, action }),
		});

		if (!res.ok) {
			const body = await res.text();
			if (body.includes("FRESH_SESSION_REQUIRED")) {
				setNeedsReauth(true);
				setPendingAction(action);
				setError(null);
				return;
			}
			throw new Error(body || `Failed to ${action}`);
		}

		router.push(action === "approve" ? "/device/success" : "/device/denied");
	}

	const handleApprove = () => {
		setError(null);
		startApprove(async () => {
			try {
				await submitAction("approve");
			} catch (err: unknown) {
				setError(
					err instanceof Error ? err.message : "Failed to approve scopes",
				);
			}
		});
	};

	const handleDeny = () => {
		setError(null);
		startDeny(async () => {
			try {
				await submitAction("deny");
			} catch (err: unknown) {
				setError(err instanceof Error ? err.message : "Failed to deny scopes");
			}
		});
	};

	const handleReauth = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!session?.user.email || !password) return;
		setReauthLoading(true);
		setError(null);

		try {
			const res = await authClient.signIn.email({
				email: session.user.email,
				password,
			});
			if (res.error) {
				setError(res.error.message ?? "Incorrect password");
				setReauthLoading(false);
				return;
			}

			setNeedsReauth(false);
			setPassword("");
			setReauthLoading(false);

			if (pendingAction) {
				await submitAction(pendingAction);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Authentication failed");
			setReauthLoading(false);
		}
	};

	if (!session) return null;

	if (loading) {
		return (
			<div className="flex min-h-dvh items-center justify-center p-4">
				<div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm text-center">
					<p className="text-sm text-muted-foreground">
						Loading scope request…
					</p>
				</div>
			</div>
		);
	}

	if (error && !data) {
		return (
			<div className="flex min-h-dvh items-center justify-center p-4">
				<div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm text-center">
					<p className="text-sm text-destructive-foreground">{error}</p>
				</div>
			</div>
		);
	}

	if (!data || data.status !== "pending") {
		return (
			<div className="flex min-h-dvh items-center justify-center p-4">
				<div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm text-center">
					<h1 className="text-xl font-bold tracking-tight">
						No Pending Scopes
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						This scope request has already been resolved.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex min-h-dvh items-center justify-center p-4">
			<div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm">
				<div className="mb-6 text-center">
					<h1 className="text-2xl font-bold tracking-tight">
						Scope Escalation
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						An agent is requesting additional permissions
					</p>
				</div>

				<div className="mb-4 space-y-3">
					<div className="rounded-lg bg-muted p-3">
						<p className="text-xs font-medium text-muted-foreground">Agent</p>
						<p className="text-sm font-medium">{data.agentName}</p>
						<p className="font-mono text-xs text-muted-foreground">
							{data.agentId}
						</p>
					</div>

					<div className="rounded-lg bg-muted p-3">
						<p className="text-xs font-medium text-muted-foreground">
							Signed in as
						</p>
						<p className="text-sm">{session.user.email}</p>
					</div>

					{data.existingScopes.length > 0 && (
						<div className="rounded-lg bg-muted p-3">
							<p className="text-xs font-medium text-muted-foreground mb-1.5">
								Current Scopes
							</p>
							<div className="flex flex-wrap gap-1.5">
								{data.existingScopes.map((s) => (
									<span
										key={s}
										className="inline-flex items-center rounded-md bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-border"
									>
										{s}
									</span>
								))}
							</div>
						</div>
					)}

					<div className="rounded-lg border-2 border-amber-500/30 bg-amber-500/5 p-3">
						<p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-1.5">
							Requested Scopes
						</p>
						<div className="flex flex-wrap gap-1.5">
							{data.requestedScopes.map((s) => (
								<span
									key={s}
									className="inline-flex items-center rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300 ring-1 ring-inset ring-amber-500/30"
								>
									{s}
								</span>
							))}
						</div>
					</div>
				</div>

				{error && (
					<p className="mb-4 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive-foreground">
						{error}
					</p>
				)}

				{needsReauth ? (
					<form onSubmit={handleReauth} className="space-y-3">
						<div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
							<p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-0.5">
								Confirm your identity
							</p>
							<p className="text-xs text-muted-foreground">
								Enter your password for{" "}
								<span className="font-medium text-foreground">
									{session.user.email}
								</span>
							</p>
						</div>
						<input
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							placeholder="Password"
							required
							autoFocus
							className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
						/>
						<button
							type="submit"
							disabled={reauthLoading}
							className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
						>
							{reauthLoading
								? "Verifying..."
								: `Confirm & ${pendingAction === "deny" ? "Deny" : "Approve"}`}
						</button>
					</form>
				) : (
					<div className="flex gap-3">
						<button
							onClick={handleDeny}
							disabled={isDenyPending}
							className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
						>
							{isDenyPending ? "..." : "Deny"}
						</button>
						<button
							onClick={handleApprove}
							disabled={isApprovePending}
							className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
						>
							{isApprovePending ? "Approving..." : "Approve"}
						</button>
					</div>
				)}
			</div>
		</div>
	);
}
