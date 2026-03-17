"use client";

import { signIn, useSession } from "@/lib/auth-client";
import { useEffect, useState, useCallback } from "react";

function OnePasswordLogo({ className }: { className?: string }) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
			<path d="M12 1C5.92 1 1 5.92 1 12s4.92 11 11 11s11-4.92 11-11S18.08 1 12 1m0 19a8 8 0 0 1-8-8a8 8 0 0 1 8-8a8 8 0 0 1 8 8a8 8 0 0 1-8 8m1-6.5c0 .63.4 1.2 1 1.41V18h-4v-6.09c.78-.27 1.19-1.11.93-1.91a1.5 1.5 0 0 0-.93-.91V6h4v6.09c-.6.21-1 .78-1 1.41" />
		</svg>
	);
}

function Spinner({ className }: { className?: string }) {
	return (
		<svg className={`animate-spin h-4 w-4 ${className ?? ""}`} viewBox="0 0 24 24" fill="none">
			<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
			<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
		</svg>
	);
}

interface AgentInfo {
	agent: {
		id: string;
		name: string;
		status: string;
		mode: string;
		hostId: string;
		createdAt: string;
	};
	host: { id: string; name: string | null; status: string } | null;
	grants: Array<{
		id: string;
		capability: string;
		status: string;
		reason: string | null;
	}>;
	needsActivation?: boolean;
}

export default function DeviceCapabilities({
	agentId,
	code,
}: {
	agentId?: string;
	code?: string;
}) {
	const { data: session, isPending: sessionPending } = useSession();
	const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [actionState, setActionState] = useState<
		"idle" | "approving" | "confirming_deny" | "denying" | "done"
	>("idle");
	const [denyReason, setDenyReason] = useState("");
	const [result, setResult] = useState<{
		status: string;
		added?: string[];
	} | null>(null);

	const [loginEmail, setLoginEmail] = useState("");
	const [loginPassword, setLoginPassword] = useState("");
	const [loginError, setLoginError] = useState("");
	const [loginSubmitting, setLoginSubmitting] = useState(false);

	const fetchAgentInfo = useCallback(async () => {
		if (!agentId) return;
		try {
			const res = await fetch(`/api/device/info?agent_id=${agentId}`);
			if (!res.ok) {
				const data = await res.json();
				setError(data.error || "Failed to load agent info");
				return;
			}
			setAgentInfo(await res.json());
		} catch {
			setError("Failed to load agent info");
		} finally {
			setLoading(false);
		}
	}, [agentId]);

	useEffect(() => {
		if (session && agentId) {
			fetchAgentInfo();
		} else if (!sessionPending && !session) {
			setLoading(false);
		}
	}, [session, sessionPending, agentId, fetchAgentInfo]);

	const handleLogin = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoginSubmitting(true);
		setLoginError("");
		try {
			const res = await signIn.email({
				email: loginEmail,
				password: loginPassword,
			});
			if (res.error) {
				setLoginError(res.error.message || "Invalid credentials");
			}
		} catch {
			setLoginError("Something went wrong");
		} finally {
			setLoginSubmitting(false);
		}
	};

	const handleAction = async (action: "approve" | "deny") => {
		setActionState(action === "approve" ? "approving" : "denying");
		try {
			const body: Record<string, unknown> = { agent_id: agentId, action };
			if (action === "deny" && denyReason.trim()) {
				body.reason = denyReason.trim();
			}
			const res = await fetch("/api/auth/agent/approve-capability", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
			const data = await res.json();
			if (!res.ok) {
				setError(data.message || "Action failed");
				setActionState("idle");
				return;
			}
			setResult(data);
			setActionState("done");
		} catch {
			setError("Failed to process action");
			setActionState("idle");
		}
	};

	if (!sessionPending && !session) {
		return (
			<div className="flex min-h-screen flex-col items-center justify-center bg-inset">
				<main className="flex w-full max-w-sm flex-col items-center gap-8 px-6">
					<div className="flex flex-col items-center gap-4 text-center">
						<div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 ring-1 ring-accent/20">
							<OnePasswordLogo className="h-7 w-7 text-accent" />
						</div>
						<div className="rounded-full bg-accent/10 px-3 py-1 text-[11px] font-medium text-accent">
							Device Authorization
						</div>
						<h1 className="text-xl font-semibold text-white">
							Sign in to continue
						</h1>
						<p className="max-w-xs text-sm leading-relaxed text-muted">
							An agent is requesting access to your 1Password vault. Sign in to review and approve.
						</p>
						{code && (
							<div className="mt-2 rounded-xl border border-border bg-surface px-10 py-5">
								<p className="text-[10px] uppercase tracking-widest text-muted mb-2">
									Verification Code
								</p>
								<p className="font-mono text-3xl font-bold tracking-[0.3em] text-white">
									{code}
								</p>
							</div>
						)}
					</div>

					<form onSubmit={handleLogin} className="w-full rounded-xl border border-border bg-surface p-5 flex flex-col gap-3">
						<input
							type="email"
							value={loginEmail}
							onChange={(e) => setLoginEmail(e.target.value)}
							placeholder="Email"
							required
							className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-white placeholder:text-muted/50 outline-none focus:border-accent/50"
						/>
						<input
							type="password"
							value={loginPassword}
							onChange={(e) => setLoginPassword(e.target.value)}
							placeholder="Password"
							required
							className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-white placeholder:text-muted/50 outline-none focus:border-accent/50"
						/>
						{loginError && (
							<p className="text-xs text-op-danger">{loginError}</p>
						)}
						<button
							type="submit"
							disabled={loginSubmitting}
							className="flex h-10 w-full cursor-pointer items-center justify-center rounded-md bg-accent text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
						>
							{loginSubmitting ? <Spinner /> : "Sign in"}
						</button>
					</form>

					<p className="text-center text-xs text-muted">
						Confirm the code above matches what your agent displayed
					</p>
				</main>
			</div>
		);
	}

	if (sessionPending || loading) {
		return (
			<div className="flex min-h-screen items-center justify-center text-muted">
				<Spinner />
			</div>
		);
	}

	if (!agentId) {
		return (
			<div className="flex min-h-screen flex-col items-center justify-center bg-inset">
				<div className="flex max-w-sm flex-col items-center gap-4 text-center">
					<div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface">
						<svg className="h-6 w-6 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
						</svg>
					</div>
					<h1 className="text-lg font-medium text-white">Missing Parameters</h1>
					<p className="text-sm text-muted">
						This page requires an agent_id parameter. Use the verification link provided by the agent.
					</p>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex min-h-screen flex-col items-center justify-center bg-inset">
				<div className="flex max-w-sm flex-col items-center gap-4 text-center">
					<div className="flex h-14 w-14 items-center justify-center rounded-full bg-op-danger/10">
						<svg className="h-6 w-6 text-op-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
						</svg>
					</div>
					<h1 className="text-lg font-medium text-white">Error</h1>
					<p className="text-sm text-muted">{error}</p>
				</div>
			</div>
		);
	}

	if (actionState === "done" && result) {
		const approved = result.status === "approved";
		return (
			<div className="flex min-h-screen flex-col items-center justify-center bg-inset">
				<div className="flex max-w-sm flex-col items-center gap-6 text-center">
					<div className={`flex h-16 w-16 items-center justify-center rounded-full ${approved ? "bg-op-green/10" : "bg-op-danger/10"}`}>
						{approved ? (
							<svg className="h-8 w-8 text-op-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
							</svg>
						) : (
							<svg className="h-8 w-8 text-op-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
							</svg>
						)}
					</div>
					<div>
						<h1 className="text-xl font-semibold text-white">
							{approved ? "Access Approved" : "Access Denied"}
						</h1>
						<p className="mt-2 text-sm text-muted">
							{approved
								? `"${agentInfo?.agent.name}" has been granted access to your 1Password vault. You can close this tab.`
								: `"${agentInfo?.agent.name}" was denied access. You can close this tab.`}
						</p>
						{approved && result.added && result.added.length > 0 && (
							<p className="mt-3 text-xs text-muted">
								{result.added.length} capability{result.added.length !== 1 ? "ies" : ""} granted
							</p>
						)}
						<a
							href="/dashboard/agents"
							className="mt-6 inline-flex items-center gap-1.5 rounded-md bg-accent px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
						>
							Go to Agents
							<svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
							</svg>
						</a>
					</div>
				</div>
			</div>
		);
	}

	const pendingGrants = agentInfo?.grants.filter((g) => g.status === "pending") ?? [];
	const needsActivation = agentInfo?.needsActivation ?? false;

	if (pendingGrants.length === 0 && !needsActivation) {
		return (
			<div className="flex min-h-screen flex-col items-center justify-center bg-inset">
				<div className="flex max-w-sm flex-col items-center gap-4 text-center">
					<div className="flex h-14 w-14 items-center justify-center rounded-full bg-op-green/10">
						<svg className="h-6 w-6 text-op-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
					</div>
					<h1 className="text-lg font-medium text-white">Already Resolved</h1>
					<p className="text-sm text-muted">
						This agent has no pending capability requests. It may have already been approved or denied.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex min-h-screen flex-col items-center justify-center bg-inset px-6">
			<div className="w-full max-w-md">
				<div className="flex flex-col items-center gap-6">
					<div className="flex items-center gap-3">
						<div className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent/10">
							<OnePasswordLogo className="h-5 w-5 text-accent" />
						</div>
						<div className="rounded-full bg-accent/10 px-3 py-1 text-[11px] font-medium text-accent">
							Device Authorization
						</div>
					</div>

					{code && (
						<div className="rounded-xl border border-border bg-surface px-10 py-5 text-center">
							<p className="text-[10px] uppercase tracking-widest text-muted mb-2">
								Verify this code matches your device
							</p>
							<p className="font-mono text-3xl font-bold tracking-[0.3em] text-white">
								{code}
							</p>
						</div>
					)}

					<div className="w-full rounded-xl border border-border bg-surface overflow-hidden">
						<div className="border-b border-border px-5 py-4">
							<div className="flex items-center justify-between">
								<div>
									<h2 className="text-sm font-medium text-white">
										{agentInfo?.agent.name}
									</h2>
									<p className="mt-0.5 text-xs text-muted">
										Agent
										{agentInfo?.host?.name && ` via ${agentInfo.host.name}`}
									</p>
								</div>
								<span className="inline-flex items-center rounded-full border border-op-attention/40 bg-op-attention/15 px-2.5 py-0.5 text-xs font-medium text-op-attention">
									Pending
								</span>
							</div>
						</div>

						<div className="px-5 py-4">
							{pendingGrants.length > 0 ? (
								<>
									<p className="mb-3 text-[10px] font-medium uppercase tracking-widest text-muted">
										Requested Capabilities ({pendingGrants.length})
									</p>
									<div className="space-y-1.5 max-h-64 overflow-y-auto">
										{pendingGrants.map((g) => (
											<div
												key={g.id}
												className="flex items-center gap-3 rounded-lg border border-border bg-background px-3.5 py-2.5"
											>
												<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/10">
													<svg className="h-3.5 w-3.5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
														<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
													</svg>
												</div>
												<div className="min-w-0 flex-1">
													<p className="truncate font-mono text-xs text-foreground">
														{g.capability}
													</p>
													{g.reason && (
														<p className="text-[11px] text-muted truncate">{g.reason}</p>
													)}
												</div>
											</div>
										))}
									</div>
								</>
							) : (
								<p className="text-sm text-muted">
									This agent is requesting access to your 1Password vault.
									No specific capabilities have been requested yet.
								</p>
							)}
						</div>

						<div className="border-t border-border px-5 py-4">
							{actionState === "confirming_deny" ? (
								<div className="flex flex-col gap-3">
									<input
										type="text"
										placeholder="Reason for denying (optional)"
										value={denyReason}
										onChange={(e) => setDenyReason(e.target.value)}
										className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-white placeholder:text-muted/50 outline-none focus:border-accent/50"
										autoFocus
									/>
									<div className="flex gap-3">
										<button
											onClick={() => { setActionState("idle"); setDenyReason(""); }}
											className="flex h-10 flex-1 cursor-pointer items-center justify-center rounded-md border border-border text-sm font-medium text-muted transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
										>
											Cancel
										</button>
										<button
											onClick={() => handleAction("deny")}
											className="flex h-10 flex-1 cursor-pointer items-center justify-center rounded-md border border-op-danger/30 bg-op-danger/10 text-sm font-medium text-op-danger transition-colors hover:bg-op-danger/20 disabled:pointer-events-none disabled:opacity-50"
										>
											Deny Access
										</button>
									</div>
								</div>
							) : (
								<div className="flex gap-3">
									<button
										onClick={() => setActionState("confirming_deny")}
										disabled={actionState !== "idle"}
										className="flex h-10 flex-1 cursor-pointer items-center justify-center rounded-md border border-border text-sm font-medium text-muted transition-colors hover:border-op-danger/30 hover:text-op-danger hover:bg-op-danger/5 disabled:pointer-events-none disabled:opacity-50"
									>
										Deny
									</button>
									<button
										onClick={() => handleAction("approve")}
										disabled={actionState !== "idle"}
										className="flex h-10 flex-1 cursor-pointer items-center justify-center rounded-md bg-accent text-sm font-medium text-white transition-all hover:bg-accent-hover active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
									>
										{actionState === "approving" ? <Spinner /> : "Approve"}
									</button>
								</div>
							)}
						</div>
					</div>

					<p className="text-center text-xs text-muted">
						Signed in as {session?.user.email}
					</p>
				</div>
			</div>
		</div>
	);
}
