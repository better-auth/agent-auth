"use client";

import { signIn, useSession } from "@/lib/auth-client";
import { useEffect, useState, useCallback } from "react";

function GmailLogo({ className }: { className?: string }) {
	return (
		<svg className={className} viewBox="0 0 75 75" xmlns="http://www.w3.org/2000/svg">
			<path d="M6.25 18.75v37.5c0 3.45 2.8 6.25 6.25 6.25h6.25V28.125L37.5 43.75l18.75-15.625V62.5H62.5c3.45 0 6.25-2.8 6.25-6.25v-37.5l-3.125 4.688L37.5 43.75l-28.125-20.313L6.25 18.75z" fill="#4285F4"/>
			<path d="M6.25 18.75c0-3.45 2.8-6.25 6.25-6.25h3.125L37.5 28.125 59.375 12.5H62.5c3.45 0 6.25 2.8 6.25 6.25l-6.25 6.25-25 18.75-18.75-15.625L6.25 18.75z" fill="#EA4335"/>
			<path d="M6.25 18.75v37.5c0 3.45 2.8 6.25 6.25 6.25h6.25V28.125L6.25 18.75z" fill="#C5221F"/>
			<path d="M68.75 18.75v37.5c0 3.45-2.8 6.25-6.25 6.25h-6.25V28.125L68.75 18.75z" fill="#1A73E8"/>
			<path d="M68.75 18.75l-6.25 6.25-25 18.75-18.75-15.625L6.25 18.75c0-3.45 2.8-6.25 6.25-6.25h3.125L37.5 28.125 59.375 12.5H62.5c3.45 0 6.25 2.8 6.25 6.25z" fill="#EA4335"/>
		</svg>
	);
}

function GoogleLogo({ className }: { className?: string }) {
	return (
		<svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
			<path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
			<path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
			<path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
			<path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
		</svg>
	);
}

function Spinner({ className }: { className?: string }) {
	return (
		<svg className={`animate-spin h-5 w-5 ${className ?? ""}`} viewBox="0 0 24 24" fill="none">
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
		constraints: Record<string, unknown> | null;
	}>;
	needsActivation?: boolean;
}

function ConstraintBadges({ constraints }: { constraints: Record<string, unknown> }) {
	return (
		<div className="mt-1.5 ml-10 flex flex-wrap gap-1">
			{Object.entries(constraints).map(([field, value]) => (
				<span
					key={field}
					className="inline-flex items-center rounded-md bg-gmail-blue/8 px-1.5 py-0.5 text-[10px] font-mono text-gmail-blue ring-1 ring-inset ring-gmail-blue/20"
				>
					{field}:{" "}
					{typeof value === "object" && value !== null && !Array.isArray(value)
						? Object.entries(value as Record<string, unknown>)
								.map(([op, v]) => `${op}=${JSON.stringify(v)}`)
								.join(", ")
						: JSON.stringify(value)}
				</span>
			))}
		</div>
	);
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

	const handleAction = async (action: "approve" | "deny") => {
		setActionState(action === "approve" ? "approving" : "denying");
		try {
			const body: Record<string, unknown> = { agent_id: agentId, action };
			if (code) body.user_code = code;
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
				setError(data.error_description || "Action failed");
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
			<div className="flex min-h-screen flex-col items-center justify-center bg-white">
				<main className="flex w-full max-w-[420px] flex-col items-center px-8 py-12">
					<div className="flex flex-col items-center gap-4 text-center">
						<GmailLogo className="h-8 w-8" />
						<div className="rounded-full bg-accent/10 px-3 py-1 text-[11px] font-medium text-accent">
							Device Authorization
						</div>
						<h1 className="text-[22px] font-normal text-foreground">
							Sign in to continue
						</h1>
						<p className="max-w-xs text-sm leading-relaxed text-muted">
							An agent is requesting access to your Gmail. Sign in to review and approve.
						</p>
						{code && (
							<div className="mt-2 rounded-2xl border border-border bg-surface px-10 py-5">
								<p className="text-[10px] uppercase tracking-widest text-muted mb-2">
									Verification Code
								</p>
								<p className="font-mono text-3xl font-bold tracking-[0.3em] text-foreground">
									{code}
								</p>
							</div>
						)}
					</div>

					<button
						onClick={() => {
							const params = new URLSearchParams();
							if (agentId) params.set("agent_id", agentId);
							if (code) params.set("code", code);
							signIn.oauth2({
								providerId: "google",
								callbackURL: `/device/capabilities?${params.toString()}`,
							});
						}}
						className="mt-8 flex h-10 w-full cursor-pointer items-center justify-center gap-3 rounded-full border border-border bg-white text-sm font-medium text-foreground shadow-sm transition-shadow hover:shadow-md active:bg-surface"
					>
						<GoogleLogo className="h-[18px] w-[18px]" />
						Sign in with Google
					</button>

					<p className="mt-6 text-center text-xs text-muted">
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
			<div className="flex min-h-screen flex-col items-center justify-center bg-white">
				<div className="flex max-w-sm flex-col items-center gap-4 text-center">
					<div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface">
						<svg className="h-6 w-6 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
						</svg>
					</div>
					<h1 className="text-lg font-medium text-foreground">Missing Parameters</h1>
					<p className="text-sm text-muted">
						This page requires an agent_id parameter. Use the verification link provided by the agent.
					</p>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex min-h-screen flex-col items-center justify-center bg-white">
				<div className="flex max-w-sm flex-col items-center gap-4 text-center">
					<div className="flex h-14 w-14 items-center justify-center rounded-full bg-gmail-red/10">
						<svg className="h-6 w-6 text-gmail-red" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
						</svg>
					</div>
					<h1 className="text-lg font-medium text-foreground">Error</h1>
					<p className="text-sm text-muted">{error}</p>
				</div>
			</div>
		);
	}

	if (actionState === "done" && result) {
		const approved = result.status === "approved";
		return (
			<div className="flex min-h-screen flex-col items-center justify-center bg-white">
				<div className="flex max-w-sm flex-col items-center gap-6 text-center">
					<div className={`flex h-16 w-16 items-center justify-center rounded-full ${approved ? "bg-gmail-green/10" : "bg-gmail-red/10"}`}>
						{approved ? (
							<svg className="h-8 w-8 text-gmail-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
							</svg>
						) : (
							<svg className="h-8 w-8 text-gmail-red" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
							</svg>
						)}
					</div>
					<div>
						<h1 className="text-[22px] font-normal text-foreground">
							{approved ? "Access Approved" : "Access Denied"}
						</h1>
						<p className="mt-2 text-sm text-muted">
							{approved
								? `"${agentInfo?.agent.name}" has been granted access to your Gmail. You can close this tab.`
								: `"${agentInfo?.agent.name}" was denied access. You can close this tab.`}
						</p>
						{approved && result.added && result.added.length > 0 && (
							<p className="mt-3 text-xs text-muted">
								{result.added.length} capability{result.added.length !== 1 ? "ies" : ""} granted
							</p>
						)}
						<a
							href="/dashboard/agents"
							className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-accent px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90"
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
			<div className="flex min-h-screen flex-col items-center justify-center bg-white">
				<div className="flex max-w-sm flex-col items-center gap-4 text-center">
					<div className="flex h-14 w-14 items-center justify-center rounded-full bg-gmail-green/10">
						<svg className="h-6 w-6 text-gmail-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
					</div>
					<h1 className="text-lg font-medium text-foreground">Already Resolved</h1>
					<p className="text-sm text-muted">
						This agent has no pending capability requests. It may have already been approved or denied.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex min-h-screen flex-col items-center justify-center bg-white px-6">
			<div className="w-full max-w-md">
				<div className="flex flex-col items-center gap-6">
					<div className="flex items-center gap-3">
						<GmailLogo className="h-6 w-6" />
						<div className="rounded-full bg-accent/10 px-3 py-1 text-[11px] font-medium text-accent">
							Device Authorization
						</div>
					</div>

					{code && (
						<div className="rounded-2xl border border-border bg-surface px-10 py-5 text-center">
							<p className="text-[10px] uppercase tracking-widest text-muted mb-2">
								Verify this code matches your device
							</p>
							<p className="font-mono text-3xl font-bold tracking-[0.3em] text-foreground">
								{code}
							</p>
						</div>
					)}

					<div className="w-full rounded-2xl border border-border bg-white shadow-sm overflow-hidden">
						<div className="border-b border-border px-5 py-4">
							<div className="flex items-center justify-between">
								<div>
									<h2 className="text-sm font-medium text-foreground">
										{agentInfo?.agent.name}
									</h2>
									<p className="mt-0.5 text-xs text-muted">
										Agent
										{agentInfo?.host?.name && ` via ${agentInfo.host.name}`}
									</p>
								</div>
								<span className="inline-flex items-center rounded-full bg-gmail-yellow/15 px-2.5 py-0.5 text-xs font-medium text-gmail-yellow">
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
												className="rounded-xl border border-border bg-surface px-3.5 py-2.5"
											>
												<div className="flex items-center gap-3">
													<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gmail-blue/10">
														<svg className="h-3.5 w-3.5 text-gmail-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
												{g.constraints && Object.keys(g.constraints).length > 0 && (
													<ConstraintBadges constraints={g.constraints} />
												)}
											</div>
										))}
									</div>
								</>
							) : (
								<p className="text-sm text-muted">
									This agent is requesting access to your Gmail account.
									No specific capabilities have been requested yet — they can be granted later.
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
										className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted outline-none focus:border-accent focus:ring-1 focus:ring-accent/30"
										autoFocus
									/>
									<div className="flex gap-3">
										<button
											onClick={() => { setActionState("idle"); setDenyReason(""); }}
											className="flex h-10 flex-1 cursor-pointer items-center justify-center rounded-full border border-border text-sm font-medium text-muted transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
										>
											Cancel
										</button>
										<button
											onClick={() => handleAction("deny")}
											className="flex h-10 flex-1 cursor-pointer items-center justify-center rounded-full border border-gmail-red/30 bg-gmail-red/10 text-sm font-medium text-gmail-red transition-colors hover:bg-gmail-red/20 disabled:pointer-events-none disabled:opacity-50"
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
										className="flex h-10 flex-1 cursor-pointer items-center justify-center rounded-full border border-border text-sm font-medium text-muted transition-colors hover:border-gmail-red/30 hover:text-gmail-red hover:bg-gmail-red/5 disabled:pointer-events-none disabled:opacity-50"
									>
										Deny
									</button>
									<button
										onClick={() => handleAction("approve")}
										disabled={actionState !== "idle"}
										className="flex h-10 flex-1 cursor-pointer items-center justify-center rounded-full bg-accent text-sm font-medium text-white transition-all hover:bg-accent/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
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
