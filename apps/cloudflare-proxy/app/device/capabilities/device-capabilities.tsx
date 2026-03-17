"use client";

import { useCallback, useEffect, useState } from "react";
import { signIn, useSession } from "@/lib/auth-client";

function CloudflareLogo({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			fill="none"
			viewBox="0 0 65 65"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path
				d="M44.214 40.877a1.418 1.418 0 0 0-.103-1.344c-.257-.386-.67-.617-1.12-.644L20.92 37.78a.47.47 0 0 1-.38-.228.493.493 0 0 1-.035-.45c.077-.184.245-.31.44-.335l22.39-1.12c1.948-.097 4.063-1.66 4.825-3.56l.967-2.413a.836.836 0 0 0 .047-.44C47.74 20.47 40.05 13.5 30.8 13.5c-8.406 0-15.548 5.737-17.62 13.51a7.86 7.86 0 0 0-5.45-1.554c-3.72.344-6.724 3.316-7.1 7.033a7.95 7.95 0 0 0 .443 3.562C.487 36.23 0 37.006 0 38.23c0 .36.04.71.116 1.05.102.452.5.773.965.773h42.163c.44 0 .838-.293.97-.71l-.001-.466Z"
				fill="currentColor"
			/>
			<path
				d="M52.058 25.092a.397.397 0 0 0-.393.05 10.27 10.27 0 0 0-3.168 4.05l-.967 2.414c-.762 1.9.012 3.462 1.722 3.56l3.753.188c.193.019.362.145.44.335a.493.493 0 0 1-.036.45.468.468 0 0 1-.38.228l-3.83.192c-1.947.097-3.28 1.66-2.962 3.464.18 1.018.556 1.95 1.09 2.77.19.293.55.437.9.37A12.456 12.456 0 0 0 58.5 30.875a12.409 12.409 0 0 0-6.048-5.63.396.396 0 0 0-.393-.152Z"
				fill="currentColor"
				opacity="0.7"
			/>
		</svg>
	);
}

function Spinner({ className }: { className?: string }) {
	return (
		<svg
			className={`h-4 w-4 animate-spin ${className ?? ""}`}
			fill="none"
			viewBox="0 0 24 24"
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
				d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
				fill="currentColor"
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
	grants: Array<{
		id: string;
		capability: string;
		status: string;
		reason: string | null;
	}>;
	host: { id: string; name: string | null; status: string } | null;
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

	const fetchAgentInfo = useCallback(async () => {
		if (!agentId) {
			return;
		}
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
		} else if (!(sessionPending || session)) {
			setLoading(false);
		}
	}, [session, sessionPending, agentId, fetchAgentInfo]);

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

	if (!(sessionPending || session)) {
		return (
			<div className="relative flex min-h-screen flex-col items-center justify-center">
				<div className="pointer-events-none absolute inset-0">
					<div className="absolute top-0 left-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/3 blur-[120px]" />
				</div>

				<main className="relative z-10 flex w-full max-w-sm flex-col items-center gap-8 px-6">
					<div className="flex flex-col items-center gap-4 text-center">
						<div className="flex items-center gap-3">
							<CloudflareLogo className="h-5 w-7 text-white" />
							<div className="h-4 w-px bg-border" />
							<span className="font-medium text-muted text-xs uppercase tracking-wider">
								Device Authorization
							</span>
						</div>
						<h1 className="font-semibold text-white text-xl">
							Sign in to continue
						</h1>
						<p className="max-w-xs text-muted text-sm leading-relaxed">
							An agent is requesting access to your Cloudflare resources. Sign
							in to review and approve.
						</p>
						{code && (
							<div className="mt-2 rounded-lg border border-border bg-surface px-8 py-4">
								<p className="mb-2 text-[10px] text-muted uppercase tracking-widest">
									Verification Code
								</p>
								<p className="font-bold font-mono text-3xl text-white tracking-[0.3em]">
									{code}
								</p>
							</div>
						)}
					</div>

					<button
						className="group flex h-11 w-full cursor-pointer items-center justify-center gap-2.5 rounded-lg bg-white font-medium text-black text-sm transition-all hover:bg-white/90 active:scale-[0.98]"
						onClick={() => {
							const params = new URLSearchParams();
							if (agentId) {
								params.set("agent_id", agentId);
							}
							if (code) {
								params.set("code", code);
							}
							signIn.oauth2({
								providerId: "cloudflare",
								callbackURL: `/device/capabilities?${params.toString()}`,
							});
						}}
					>
						<CloudflareLogo className="h-3.5 w-5" />
						Sign in with Cloudflare
					</button>

					<p className="text-center text-muted/50 text-xs">
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
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={1.5}
							/>
						</svg>
					</div>
					<h1 className="font-semibold text-lg text-white">
						Missing Parameters
					</h1>
					<p className="text-muted text-sm">
						This page requires an agent_id parameter. Use the verification link
						provided by the agent.
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
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
							/>
						</svg>
					</div>
					<h1 className="font-semibold text-lg text-white">Error</h1>
					<p className="text-muted text-sm">{error}</p>
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
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									d="M5 13l4 4L19 7"
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
								/>
							</svg>
						) : (
							<svg
								className="h-7 w-7 text-red-400"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									d="M6 18L18 6M6 6l12 12"
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
								/>
							</svg>
						)}
					</div>
					<div>
						<h1 className="font-semibold text-white text-xl">
							{approved ? "Access Approved" : "Access Denied"}
						</h1>
						<p className="mt-2 text-muted text-sm">
							{approved
								? `"${agentInfo?.agent.name}" has been granted access. You can close this tab.`
								: `"${agentInfo?.agent.name}" was denied access. You can close this tab.`}
						</p>
						{approved && result.added && result.added.length > 0 && (
							<p className="mt-3 text-muted/60 text-xs">
								{result.added.length} capability
								{result.added.length === 1 ? "" : "ies"} granted
							</p>
						)}
						<a
							className="mt-5 inline-flex items-center gap-1.5 rounded-md bg-white/10 px-4 py-2 font-medium text-sm text-white transition-colors hover:bg-white/15"
							href="/dashboard/agents"
						>
							Go to Agents
							<svg
								className="h-3.5 w-3.5"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									d="M9 5l7 7-7 7"
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
								/>
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
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={1.5}
							/>
						</svg>
					</div>
					<h1 className="font-semibold text-lg text-white">Already Resolved</h1>
					<p className="text-muted text-sm">
						This agent has no pending capability requests. It may have already
						been approved or denied.
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
						<CloudflareLogo className="h-5 w-7 text-white" />
						<div className="h-4 w-px bg-border" />
						<span className="font-medium text-muted text-xs uppercase tracking-wider">
							Device Authorization
						</span>
					</div>

					{code && (
						<div className="rounded-lg border border-border bg-surface px-8 py-4 text-center">
							<p className="mb-2 text-[10px] text-muted uppercase tracking-widest">
								Verify this code matches your device
							</p>
							<p className="font-bold font-mono text-3xl text-white tracking-[0.3em]">
								{code}
							</p>
						</div>
					)}

					<div className="w-full overflow-hidden rounded-xl border border-border bg-surface">
						<div className="border-border border-b px-5 py-4">
							<div className="flex items-center justify-between">
								<div>
									<h2 className="font-medium text-sm text-white">
										{agentInfo?.agent.name}
									</h2>
									<p className="mt-0.5 text-muted text-xs">
										Agent
										{agentInfo?.host?.name && ` via ${agentInfo.host.name}`}
									</p>
								</div>
								<span className="inline-flex items-center rounded-full bg-amber-500/10 px-2.5 py-0.5 font-medium text-amber-400 text-xs">
									Pending
								</span>
							</div>
						</div>

						<div className="px-5 py-4">
							{pendingGrants.length > 0 ? (
								<>
									<p className="mb-3 font-medium text-[10px] text-muted uppercase tracking-widest">
										Requested Capabilities ({pendingGrants.length})
									</p>
									<div className="max-h-64 space-y-1.5 overflow-y-auto">
										{pendingGrants.map((g) => (
											<div
												className="flex items-center gap-3 rounded-lg border border-border/50 bg-background px-3 py-2.5"
												key={g.id}
											>
												<div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-blue-500/10">
													<svg
														className="h-3.5 w-3.5 text-blue-400"
														fill="none"
														stroke="currentColor"
														viewBox="0 0 24 24"
													>
														<path
															d="M13 10V3L4 14h7v7l9-11h-7z"
															strokeLinecap="round"
															strokeLinejoin="round"
															strokeWidth={2}
														/>
													</svg>
												</div>
												<div className="min-w-0 flex-1">
													<p className="truncate font-mono text-foreground text-xs">
														{g.capability}
													</p>
													{g.reason && (
														<p className="truncate text-[11px] text-muted">
															{g.reason}
														</p>
													)}
												</div>
											</div>
										))}
									</div>
								</>
							) : (
								<p className="text-muted text-sm">
									This agent is requesting access to your account. No specific
									capabilities have been requested yet — they can be granted
									later.
								</p>
							)}
						</div>

						<div className="border-border border-t px-5 py-4">
							{actionState === "confirming_deny" ? (
								<div className="flex flex-col gap-3">
									<input
										autoFocus
										className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground text-sm outline-none placeholder:text-muted/50 focus:border-foreground/20"
										onChange={(e) => setDenyReason(e.target.value)}
										placeholder="Reason for denying (optional)"
										type="text"
										value={denyReason}
									/>
									<div className="flex gap-3">
										<button
											className="flex h-10 flex-1 cursor-pointer items-center justify-center rounded-lg border border-border font-medium text-muted text-sm transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
											onClick={() => {
												setActionState("idle");
												setDenyReason("");
											}}
										>
											Cancel
										</button>
										<button
											className="flex h-10 flex-1 cursor-pointer items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 font-medium text-red-400 text-sm transition-colors hover:bg-red-500/20 disabled:pointer-events-none disabled:opacity-50"
											onClick={() => handleAction("deny")}
										>
											Deny Access
										</button>
									</div>
								</div>
							) : (
								<div className="flex gap-3">
									<button
										className="flex h-10 flex-1 cursor-pointer items-center justify-center rounded-lg border border-border font-medium text-muted text-sm transition-colors hover:border-red-500/30 hover:text-red-400 disabled:pointer-events-none disabled:opacity-50"
										disabled={actionState !== "idle"}
										onClick={() => setActionState("confirming_deny")}
									>
										Deny
									</button>
									<button
										className="flex h-10 flex-1 cursor-pointer items-center justify-center rounded-lg bg-white font-medium text-black text-sm transition-all hover:bg-white/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
										disabled={actionState !== "idle"}
										onClick={() => handleAction("approve")}
									>
										{actionState === "approving" ? <Spinner /> : "Approve"}
									</button>
								</div>
							)}
						</div>
					</div>

					<p className="text-center text-muted/50 text-xs">
						Signed in as {session?.user.email}
					</p>
				</div>
			</div>
		</div>
	);
}
