"use client";

import { signIn, signOut, useSession } from "@/lib/auth-client";
import { useEffect, useState, useCallback } from "react";

function VercelLogo({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			viewBox="0 0 76 65"
			fill="currentColor"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
		</svg>
	);
}

function Spinner({ className }: { className?: string }) {
	return (
		<svg
			className={`animate-spin h-4 w-4 ${className ?? ""}`}
			viewBox="0 0 24 24"
			fill="none"
		>
			<circle
				className="opacity-25"
				cx="12"
				cy="12"
				r="10"
				stroke="currentColor"
				strokeWidth="4"
			/>
			<path
				className="opacity-75"
				fill="currentColor"
				d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
			/>
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
		"idle" | "approving" | "denying" | "done" | "reauth_required"
	>("idle");
	const [result, setResult] = useState<{
		status: string;
		added?: string[];
	} | null>(null);
	const [reauthInfo, setReauthInfo] = useState<{
		max_age: number;
		session_age: number;
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
			const res = await fetch("/api/auth/agent/approve-capability", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ agent_id: agentId, action }),
			});
			const data = await res.json();
			if (!res.ok) {
				if (data.code === "fresh_session_required") {
					setReauthInfo({
						max_age: data.max_age,
						session_age: data.session_age,
					});
					setActionState("reauth_required");
					return;
				}
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

	const handleReauth = () => {
		const params = new URLSearchParams();
		if (agentId) params.set("agent_id", agentId);
		if (code) params.set("code", code);
		const callbackURL = `/device/capabilities?${params.toString()}`;
		signOut.mutate({
			fetchOptions: {
				onSuccess: () => {
					signIn.oauth2({
						providerId: "vercel-mcp",
						callbackURL,
					});
				},
			},
		});
	};

	if (!sessionPending && !session) {
		return (
			<div className="relative flex min-h-screen flex-col items-center justify-center">
				<div className="pointer-events-none absolute inset-0">
					<div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-white/3 blur-[120px]" />
				</div>

				<main className="relative z-10 flex w-full max-w-sm flex-col items-center gap-8 px-6">
					<div className="flex flex-col items-center gap-4 text-center">
						<div className="flex items-center gap-3">
							<VercelLogo className="h-5 w-5 text-white" />
							<div className="h-4 w-px bg-border" />
							<span className="text-xs font-medium uppercase tracking-wider text-muted">
								Device Authorization
							</span>
						</div>
						<h1 className="text-xl font-semibold text-white">
							Sign in to continue
						</h1>
						<p className="max-w-xs text-sm leading-relaxed text-muted">
							An agent is requesting access to your Vercel resources.
							Sign in to review and approve.
						</p>
						{code && (
							<div className="mt-2 rounded-lg border border-border bg-surface px-8 py-4">
								<p className="text-[10px] uppercase tracking-widest text-muted mb-2">
									Verification Code
								</p>
								<p className="font-mono text-3xl font-bold tracking-[0.3em] text-white">
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
								providerId: "vercel-mcp",
								callbackURL: `/device/capabilities?${params.toString()}`,
							});
						}}
						className="group flex h-11 w-full cursor-pointer items-center justify-center gap-2.5 rounded-lg bg-white text-sm font-medium text-black transition-all hover:bg-white/90 active:scale-[0.98]"
					>
						<VercelLogo className="h-3.5 w-3.5" />
						Sign in with Vercel
					</button>

					<p className="text-center text-xs text-muted/50">
						Confirm the code above matches what your agent displayed
					</p>
				</main>
			</div>
		);
	}

	if (sessionPending || loading) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<Spinner className="text-muted" />
			</div>
		);
	}

	if (!agentId) {
		return (
			<div className="flex min-h-screen flex-col items-center justify-center">
				<div className="flex max-w-sm flex-col items-center gap-4 text-center">
					<div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-500/10">
						<svg
							className="h-6 w-6 text-zinc-400"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={1.5}
								d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"
							/>
						</svg>
					</div>
					<h1 className="text-lg font-semibold text-white">
						Missing Parameters
					</h1>
					<p className="text-sm text-muted">
						This page requires an agent_id parameter. Use the
						verification link provided by the agent.
					</p>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex min-h-screen flex-col items-center justify-center">
				<div className="flex max-w-sm flex-col items-center gap-4 text-center">
					<div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
						<svg
							className="h-6 w-6 text-red-400"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
							/>
						</svg>
					</div>
					<h1 className="text-lg font-semibold text-white">Error</h1>
					<p className="text-sm text-muted">{error}</p>
				</div>
			</div>
		);
	}

	if (actionState === "reauth_required" && reauthInfo) {
		return (
			<div className="flex min-h-screen flex-col items-center justify-center px-6">
				<div className="flex max-w-sm flex-col items-center gap-6 text-center">
					<div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10">
						<svg
							className="h-7 w-7 text-amber-400"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
							/>
						</svg>
					</div>
					<div>
						<h1 className="text-xl font-semibold text-white">
							Re-authentication Required
						</h1>
						<p className="mt-2 text-sm text-muted">
							This approval requires a session less than{" "}
							{reauthInfo.max_age < 60
								? `${reauthInfo.max_age} seconds`
								: `${Math.floor(reauthInfo.max_age / 60)} minutes`}{" "}
							old. Your current session is{" "}
							{reauthInfo.session_age < 60
								? `${reauthInfo.session_age} seconds`
								: `${Math.floor(reauthInfo.session_age / 60)} minutes`}{" "}
							old.
						</p>
						<p className="mt-1 text-xs text-muted/60">
							Sign in again to create a fresh session, then
							you can approve the agent.
						</p>
					</div>
					<button
						onClick={handleReauth}
						className="flex h-11 w-full cursor-pointer items-center justify-center gap-2.5 rounded-lg bg-white text-sm font-medium text-black transition-all hover:bg-white/90 active:scale-[0.98]"
					>
						<VercelLogo className="h-3.5 w-3.5" />
						Re-authenticate with Vercel
					</button>
					<p className="text-xs text-muted/50">
						You&apos;ll be redirected back here after signing in
					</p>
				</div>
			</div>
		);
	}

	if (actionState === "done" && result) {
		const approved = result.status === "approved";
		return (
			<div className="flex min-h-screen flex-col items-center justify-center">
				<div className="flex max-w-sm flex-col items-center gap-6 text-center">
					<div
						className={`flex h-14 w-14 items-center justify-center rounded-full ${approved ? "bg-emerald-500/10" : "bg-red-500/10"}`}
					>
						{approved ? (
							<svg
								className="h-7 w-7 text-emerald-400"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M5 13l4 4L19 7"
								/>
							</svg>
						) : (
							<svg
								className="h-7 w-7 text-red-400"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M6 18L18 6M6 6l12 12"
								/>
							</svg>
						)}
					</div>
					<div>
						<h1 className="text-xl font-semibold text-white">
							{approved ? "Access Approved" : "Access Denied"}
						</h1>
						<p className="mt-2 text-sm text-muted">
							{approved
								? `"${agentInfo?.agent.name}" has been granted access. You can close this tab.`
								: `"${agentInfo?.agent.name}" was denied access. You can close this tab.`}
						</p>
						{approved &&
							result.added &&
							result.added.length > 0 && (
								<p className="mt-3 text-xs text-muted/60">
									{result.added.length} capability
									{result.added.length !== 1 ? "ies" : ""}{" "}
									granted
								</p>
							)}
						<a
							href="/dashboard/agents"
							className="mt-5 inline-flex items-center gap-1.5 rounded-md bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/15"
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

	const pendingGrants =
		agentInfo?.grants.filter((g) => g.status === "pending") ?? [];
	const needsActivation = agentInfo?.needsActivation ?? false;

	if (pendingGrants.length === 0 && !needsActivation) {
		return (
			<div className="flex min-h-screen flex-col items-center justify-center">
				<div className="flex max-w-sm flex-col items-center gap-4 text-center">
					<div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-500/10">
						<svg
							className="h-6 w-6 text-zinc-400"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={1.5}
								d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
					</div>
					<h1 className="text-lg font-semibold text-white">
						Already Resolved
					</h1>
					<p className="text-sm text-muted">
						This agent has no pending capability requests. It may
						have already been approved or denied.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex min-h-screen flex-col items-center justify-center px-6">
			<div className="w-full max-w-md">
				<div className="flex flex-col items-center gap-6">
					<div className="flex items-center gap-3">
						<VercelLogo className="h-5 w-5 text-white" />
						<div className="h-4 w-px bg-border" />
						<span className="text-xs font-medium uppercase tracking-wider text-muted">
							Device Authorization
						</span>
					</div>

					{code && (
						<div className="rounded-lg border border-border bg-surface px-8 py-4 text-center">
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
										{agentInfo?.agent.mode === "delegated"
											? "Delegated"
											: "Autonomous"}{" "}
										agent
										{agentInfo?.host?.name &&
											` via ${agentInfo.host.name}`}
									</p>
								</div>
								<span className="inline-flex items-center rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-400">
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
												className="flex items-center gap-3 rounded-lg border border-border/50 bg-background px-3 py-2.5"
											>
												<div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-blue-500/10">
													<svg
														className="h-3.5 w-3.5 text-blue-400"
														fill="none"
														viewBox="0 0 24 24"
														stroke="currentColor"
													>
														<path
															strokeLinecap="round"
															strokeLinejoin="round"
															strokeWidth={2}
															d="M13 10V3L4 14h7v7l9-11h-7z"
														/>
													</svg>
												</div>
												<div className="min-w-0 flex-1">
													<p className="truncate font-mono text-xs text-foreground">
														{g.capability}
													</p>
													{g.reason && (
														<p className="text-[11px] text-muted truncate">
															{g.reason}
														</p>
													)}
												</div>
											</div>
										))}
									</div>
								</>
							) : (
								<p className="text-sm text-muted">
									This agent is requesting access to your account.
									No specific capabilities have been requested yet —
									they can be granted later.
								</p>
							)}
						</div>

						<div className="border-t border-border px-5 py-4">
							<div className="flex gap-3">
								<button
									onClick={() => handleAction("deny")}
									disabled={actionState !== "idle"}
									className="flex h-10 flex-1 cursor-pointer items-center justify-center rounded-lg border border-border text-sm font-medium text-muted transition-colors hover:border-red-500/30 hover:text-red-400 disabled:pointer-events-none disabled:opacity-50"
								>
									{actionState === "denying" ? (
										<Spinner />
									) : (
										"Deny"
									)}
								</button>
								<button
									onClick={() => handleAction("approve")}
									disabled={actionState !== "idle"}
									className="flex h-10 flex-1 cursor-pointer items-center justify-center rounded-lg bg-white text-sm font-medium text-black transition-all hover:bg-white/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
								>
									{actionState === "approving" ? (
										<Spinner />
									) : (
										"Approve"
									)}
								</button>
							</div>
						</div>
					</div>

					<p className="text-center text-xs text-muted/50">
						Signed in as {session?.user.email}
					</p>
				</div>
			</div>
		</div>
	);
}
