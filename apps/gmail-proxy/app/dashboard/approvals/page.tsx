"use client";

import { useState, useEffect, useCallback } from "react";

function Spinner() {
	return (
		<svg className="animate-spin h-5 w-5 text-muted" viewBox="0 0 24 24" fill="none">
			<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
			<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
		</svg>
	);
}

interface ApprovalRequest {
	approval_id: string;
	method: string;
	agent_id: string | null;
	agent_name: string | null;
	binding_message: string | null;
	capabilities: string[];
	expires_in: number;
	created_at: string;
}

function timeAgo(date: string | null) {
	if (!date) return "Unknown";
	const diff = Date.now() - new Date(date).getTime();
	const seconds = Math.floor(diff / 1000);
	if (seconds < 60) return "just now";
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	return `${Math.floor(hours / 24)}d ago`;
}

export default function ApprovalsPage() {
	const [requests, setRequests] = useState<ApprovalRequest[]>([]);
	const [loading, setLoading] = useState(true);
	const [acting, setActing] = useState<string | null>(null);

	const fetchRequests = useCallback(async () => {
		try {
			const r = await fetch("/api/auth/agent/ciba/pending");
			if (!r.ok) return;
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
			if (!document.hidden) fetchRequests();
		}, 5000);
		return () => clearInterval(interval);
	}, [fetchRequests]);

	const handleAction = async (approvalId: string, action: "approve" | "deny") => {
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
					<h1 className="text-[22px] font-normal text-foreground">Approval Requests</h1>
					<p className="mt-1 text-sm text-muted">
						Pending capability requests from agents awaiting your approval.
					</p>
				</div>

				{loading ? (
					<div className="flex items-center justify-center py-20">
						<Spinner />
					</div>
				) : requests.length === 0 ? (
					<div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16">
						<div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-gmail-green/10">
							<svg className="h-6 w-6 text-gmail-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
							</svg>
						</div>
						<p className="text-sm font-medium text-foreground">No pending requests</p>
						<p className="mt-1 text-xs text-muted">CIBA approval requests will appear here automatically.</p>
					</div>
				) : (
					<div className="flex flex-col gap-3">
						{requests.map((req) => (
							<div key={req.approval_id} className="rounded-2xl border border-border bg-white shadow-sm">
								<div className="px-5 py-5">
									<div className="flex items-start justify-between gap-4">
										<div className="flex-1 min-w-0">
											<div className="flex items-center gap-2">
												<span className="text-sm font-medium text-foreground">
													{req.agent_name ?? "Unknown Agent"}
												</span>
												<span className="inline-flex items-center rounded-full bg-gmail-yellow/15 px-2.5 py-0.5 text-[11px] font-medium text-gmail-yellow ring-1 ring-gmail-yellow/30">
													pending
												</span>
											</div>
											{req.binding_message && (
												<p className="mt-1 text-xs text-muted">{req.binding_message}</p>
											)}
											<p className="mt-1 text-xs text-muted">
												Requested {timeAgo(req.created_at)}
												{" · "}
												Expires in {Math.max(0, Math.floor(req.expires_in / 60))}m
											</p>
										</div>
										<div className="flex gap-2 shrink-0">
											<button
												onClick={() => handleAction(req.approval_id, "approve")}
												disabled={acting === req.approval_id}
												className="cursor-pointer rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
											>
												{acting === req.approval_id ? "…" : "Approve"}
											</button>
											<button
												onClick={() => handleAction(req.approval_id, "deny")}
												disabled={acting === req.approval_id}
												className="cursor-pointer rounded-full border border-border px-4 py-1.5 text-xs font-medium text-muted transition-colors hover:border-gmail-red/30 hover:text-gmail-red disabled:opacity-50"
											>
												Deny
											</button>
										</div>
									</div>

									{req.capabilities.length > 0 && (
										<div className="mt-4">
											<p className="mb-2 text-[10px] uppercase tracking-widest text-muted">
												Requested Capabilities
											</p>
											<div className="flex flex-wrap gap-1.5">
												{req.capabilities.map((cap) => (
													<code
														key={cap}
														className="rounded-lg bg-surface px-2.5 py-1 text-xs font-mono text-foreground"
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
