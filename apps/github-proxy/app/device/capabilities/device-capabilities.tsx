"use client";

import { signIn, useSession } from "@/lib/auth-client";
import { useEffect, useState, useCallback } from "react";

function GitHubLogo({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			viewBox="0 0 98 96"
			fill="currentColor"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path
				fillRule="evenodd"
				clipRule="evenodd"
				d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z"
			/>
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
		"idle" | "approving" | "denying" | "done"
	>("idle");
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
			const res = await fetch("/api/auth/agent/approve-capability", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ agent_id: agentId, action }),
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
			<div className="relative flex min-h-screen flex-col items-center justify-center">
				<div className="pointer-events-none absolute inset-0">
					<div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-white/3 blur-[120px]" />
				</div>

				<main className="relative z-10 flex w-full max-w-sm flex-col items-center gap-8 px-6">
					<div className="flex flex-col items-center gap-5 text-center">
						<GitHubLogo className="h-10 w-10 text-white" />
						<div>
							<h1 className="text-xl font-semibold text-white">
								Device Authorization
							</h1>
							<p className="mt-2 max-w-xs text-sm leading-relaxed text-muted">
								An agent is requesting access to your GitHub resources.
								Sign in to review and approve.
							</p>
						</div>
						{code && (
							<div className="rounded-md border border-border bg-surface px-8 py-4">
								<p className="text-[10px] uppercase tracking-widest text-muted mb-2">
									Verification Code
								</p>
								<p className="font-mono text-3xl font-bold tracking-[0.3em] text-white">
									{code}
								</p>
							</div>
						)}
					</div>

					<div className="w-full rounded-xl border border-border bg-surface p-6">
						<button
							onClick={() => {
								const params = new URLSearchParams();
								if (agentId) params.set("agent_id", agentId);
								if (code) params.set("code", code);
								signIn.social({
									provider: "github",
									callbackURL: `/device/capabilities?${params.toString()}`,
								});
							}}
							className="flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-gh-green text-sm font-medium text-white transition-colors hover:bg-gh-green-hover active:scale-[0.98]"
						>
							Sign in with GitHub
						</button>
						<p className="mt-3 text-center text-xs text-muted">
							Confirm the code above matches what your agent displayed
						</p>
					</div>
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

	if (actionState === "done" && result) {
		const approved = result.status === "approved";
		return (
			<div className="flex min-h-screen flex-col items-center justify-center">
				<div className="flex max-w-sm flex-col items-center gap-6 text-center">
					<div
						className={`flex h-14 w-14 items-center justify-center rounded-full ${approved ? "bg-gh-green-emphasis/15" : "bg-gh-danger/15"}`}
					>
						{approved ? (
							<svg
								className="h-7 w-7 text-gh-green-emphasis"
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
								className="h-7 w-7 text-gh-danger"
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
							className="mt-5 inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover"
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
						<GitHubLogo className="h-6 w-6 text-white" />
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
									Agent
									{agentInfo?.host?.name &&
										` via ${agentInfo.host.name}`}
								</p>
								</div>
								<span className="inline-flex items-center rounded-full border border-gh-attention/40 bg-gh-attention/15 px-2.5 py-0.5 text-xs font-medium text-gh-attention">
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
									className="flex h-10 flex-1 cursor-pointer items-center justify-center rounded-md border border-border bg-surface text-sm font-medium text-foreground transition-colors hover:border-gh-danger/50 hover:text-gh-danger disabled:pointer-events-none disabled:opacity-50"
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
									className="flex h-10 flex-1 cursor-pointer items-center justify-center rounded-md bg-gh-green text-sm font-medium text-white transition-colors hover:bg-gh-green-hover active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
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
