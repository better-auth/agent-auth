"use client";

import { useCallback, useEffect, useState } from "react";

function Spinner() {
	return (
		<svg
			className="h-4 w-4 animate-spin text-muted"
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

interface ApprovalRequest {
	agent_id: string | null;
	agent_name: string | null;
	approval_id: string;
	binding_message: string | null;
	capabilities: string[];
	created_at: string;
	expires_in: number;
	method: string;
}

function timeAgo(date: string | null) {
	if (!date) {
		return "Unknown";
	}
	const diff = Date.now() - new Date(date).getTime();
	const seconds = Math.floor(diff / 1000);
	if (seconds < 60) {
		return "just now";
	}
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) {
		return `${minutes}m ago`;
	}
	const hours = Math.floor(minutes / 60);
	if (hours < 24) {
		return `${hours}h ago`;
	}
	return `${Math.floor(hours / 24)}d ago`;
}

export default function ApprovalsPage() {
	const [requests, setRequests] = useState<ApprovalRequest[]>([]);
	const [loading, setLoading] = useState(true);
	const [acting, setActing] = useState<string | null>(null);

	const fetchRequests = useCallback(async () => {
		try {
			const r = await fetch("/api/auth/agent/ciba/pending");
			if (!r.ok) {
				return;
			}
			const data = await r.json();
			setRequests(data.requests ?? []);
		} catch {
			/* ignore */
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchRequests();
		const interval = setInterval(() => {
			if (!document.hidden) {
				fetchRequests();
			}
		}, 5000);
		return () => clearInterval(interval);
	}, [fetchRequests]);

	const handleAction = async (
		approvalId: string,
		action: "approve" | "deny"
	) => {
		setActing(approvalId);
		try {
			const res = await fetch("/api/auth/agent/approve-capability", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ approval_id: approvalId, action }),
			});
			if (res.ok) {
				setRequests((prev) => prev.filter((r) => r.approval_id !== approvalId));
			}
		} catch {
			/* ignore */
		} finally {
			setActing(null);
		}
	};

	return (
		<div className="mx-auto w-full max-w-3xl px-6 py-8">
			<div className="flex flex-col gap-6">
				<div>
					<h1 className="font-semibold text-lg text-white">
						Approval Requests
					</h1>
					<p className="mt-1 text-muted text-sm">
						Pending capability requests from agents awaiting your approval.
					</p>
				</div>

				{loading ? (
					<div className="flex items-center justify-center py-20">
						<Spinner />
					</div>
				) : requests.length === 0 ? (
					<div className="flex flex-col items-center justify-center rounded-lg border border-border border-dashed py-16">
						<svg
							className="mb-3 h-8 w-8 text-muted/30"
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
						<p className="text-muted text-sm">No pending requests</p>
						<p className="mt-1 text-muted/60 text-xs">
							CIBA approval requests will appear here automatically.
						</p>
					</div>
				) : (
					<div className="flex flex-col gap-3">
						{requests.map((req) => (
							<div
								className="rounded-lg border border-border bg-surface"
								key={req.approval_id}
							>
								<div className="px-4 py-4">
									<div className="flex items-start justify-between gap-4">
										<div className="min-w-0 flex-1">
											<div className="flex items-center gap-2">
												<span className="font-medium text-sm text-white">
													{req.agent_name ?? "Unknown Agent"}
												</span>
												<span className="inline-flex items-center rounded-full border border-gh-attention/40 bg-gh-attention/15 px-2 py-0.5 font-medium text-[11px] text-gh-attention">
													pending
												</span>
											</div>
											{req.binding_message && (
												<p className="mt-1 text-muted text-xs">
													{req.binding_message}
												</p>
											)}
											<p className="mt-1 text-muted/60 text-xs">
												Requested {timeAgo(req.created_at)}
												{" · "}
												Expires in{" "}
												{Math.max(0, Math.floor(req.expires_in / 60))}m
											</p>
										</div>
										<div className="flex shrink-0 gap-2">
											<button
												className="cursor-pointer rounded-md bg-gh-green px-3 py-1.5 font-medium text-white text-xs transition-colors hover:bg-gh-green-hover disabled:opacity-50"
												disabled={acting === req.approval_id}
												onClick={() => handleAction(req.approval_id, "approve")}
											>
												{acting === req.approval_id ? "…" : "Approve"}
											</button>
											<button
												className="cursor-pointer rounded-md border border-border bg-surface px-3 py-1.5 font-medium text-foreground text-xs transition-colors hover:border-gh-danger/50 hover:text-gh-danger disabled:opacity-50"
												disabled={acting === req.approval_id}
												onClick={() => handleAction(req.approval_id, "deny")}
											>
												Deny
											</button>
										</div>
									</div>

									{req.capabilities.length > 0 && (
										<div className="mt-3">
											<p className="mb-1.5 text-[10px] text-muted uppercase tracking-widest">
												Requested Capabilities
											</p>
											<div className="flex flex-wrap gap-1.5">
												{req.capabilities.map((cap) => (
													<code
														className="rounded bg-background px-2 py-1 font-mono text-foreground text-xs"
														key={cap}
													>
														{cap}
													</code>
												))}
											</div>
										</div>
									)}
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
