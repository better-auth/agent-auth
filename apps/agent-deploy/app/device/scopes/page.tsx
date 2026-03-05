"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
	Rocket,
	CheckCircle2,
	XCircle,
	Loader2,
	Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { authClient } from "@/lib/auth-client";

interface ScopeRequestData {
	agentId: string;
	agentName: string;
	existingScopes: string[];
	requestedScopes: string[];
	status: string;
}

export default function ScopeApprovalPage() {
	const searchParams = useSearchParams();
	const router = useRouter();
	const agentId = searchParams.get("agent_id") ?? searchParams.get("request_id") ?? "";

	const [status, setStatus] = useState<
		"checking" | "loading" | "confirm" | "approving" | "denying" | "success" | "denied" | "error"
	>("checking");
	const [error, setError] = useState("");
	const [data, setData] = useState<ScopeRequestData | null>(null);

	useEffect(() => {
		checkSessionAndLoad();
	}, []);

	async function checkSessionAndLoad() {
		const { data: session } = await authClient.getSession();
		if (!session) {
			const returnUrl = window.location.pathname + window.location.search;
			router.replace(`/?redirect=${encodeURIComponent(returnUrl)}`);
			return;
		}
		loadScopeRequest();
	}

	async function loadScopeRequest() {
		if (!agentId) {
			setError("Missing agent_id parameter");
			setStatus("error");
			return;
		}

		setStatus("loading");
		try {
			const res = await fetch(
				`/api/auth/agent/scope-request-status?requestId=${encodeURIComponent(agentId)}`,
				{ credentials: "include" },
			);
			if (!res.ok) {
				setError("Failed to load scope request");
				setStatus("error");
				return;
			}
			const d = await res.json();
			setData(d);

			if (d.status !== "pending") {
				setStatus("success");
			} else {
				setStatus("confirm");
			}
		} catch {
			setError("Failed to load scope request");
			setStatus("error");
		}
	}

	async function handleAction(action: "approve" | "deny") {
		setStatus(action === "approve" ? "approving" : "denying");
		setError("");

		try {
			const res = await fetch("/api/auth/agent/approve-scope", {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ requestId: agentId, action }),
			});

			if (!res.ok) {
				const body = await res.text();
				setError(body || `Failed to ${action}`);
				setStatus("error");
				return;
			}

			setStatus(action === "approve" ? "success" : "denied");
		} catch {
			setError("Something went wrong");
			setStatus("error");
		}
	}

	if (status === "checking" || status === "loading") {
		return (
			<div className="flex min-h-screen items-center justify-center bg-background">
				<Loader2 className="size-8 text-primary animate-spin" />
			</div>
		);
	}

	return (
		<div className="flex min-h-screen items-center justify-center bg-background">
			<div className="w-full max-w-sm space-y-6">
				<div className="flex flex-col items-center gap-3">
					<div className="flex size-12 items-center justify-center rounded-xl bg-primary">
						<Shield className="size-6 text-primary-foreground" />
					</div>
					<h1 className="text-xl font-semibold tracking-tight">
						Scope Request
					</h1>
					<p className="text-center text-sm text-muted-foreground">
						An agent is requesting additional permissions
					</p>
				</div>

				{status === "confirm" && data && (
					<div className="space-y-4">
						<div className="rounded-lg border border-border bg-card p-4">
							<p className="text-xs text-muted-foreground mb-1">
								Agent
							</p>
							<p className="text-sm font-semibold">
								{data.agentName}
							</p>
						</div>

						{data.existingScopes.length > 0 && (
							<div className="rounded-lg border border-border p-4">
								<p className="text-xs font-medium text-muted-foreground mb-2">
									Current scopes
								</p>
								<div className="flex flex-wrap gap-1.5">
									{data.existingScopes.map((s) => (
										<Badge
											key={s}
											variant="success"
											className="font-mono text-[11px]"
										>
											{s}
										</Badge>
									))}
								</div>
							</div>
						)}

						{data.requestedScopes.length > 0 && (
							<div className="rounded-lg border border-warning/30 bg-warning/5 p-4">
								<p className="text-xs font-medium text-warning mb-2">
									Requesting access to
								</p>
								<div className="flex flex-wrap gap-1.5">
									{data.requestedScopes.map((s) => (
										<Badge
											key={s}
											variant="warning"
											className="font-mono text-[11px]"
										>
											{s}
										</Badge>
									))}
								</div>
							</div>
						)}

						<p className="text-xs text-center text-muted-foreground">
							Only approve if you trust this agent and initiated
							this request.
						</p>
						<Button
							onClick={() => handleAction("approve")}
							className="w-full"
						>
							Approve
						</Button>
						<Button
							variant="outline"
							className="w-full"
							onClick={() => handleAction("deny")}
						>
							Deny
						</Button>
					</div>
				)}

				{(status === "approving" || status === "denying") && (
					<div className="flex flex-col items-center gap-3 py-8">
						<Loader2 className="size-8 text-primary animate-spin" />
					</div>
				)}

				{status === "success" && (
					<div className="flex flex-col items-center gap-3 py-8">
						<div className="flex size-12 items-center justify-center rounded-full bg-success/10">
							<CheckCircle2 className="size-6 text-success" />
						</div>
						<p className="text-sm font-medium">Approved</p>
						<p className="text-xs text-muted-foreground text-center">
							The agent now has the requested permissions.
						</p>
						<Button
							variant="outline"
							onClick={() => router.push("/dashboard/agents")}
							className="mt-2"
						>
							Go to Dashboard
						</Button>
					</div>
				)}

				{status === "denied" && (
					<div className="flex flex-col items-center gap-3 py-8">
						<div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
							<XCircle className="size-6 text-destructive-foreground" />
						</div>
						<p className="text-sm font-medium">Denied</p>
						<Button
							variant="outline"
							onClick={() => router.push("/dashboard/agents")}
							className="mt-2"
						>
							Go to Dashboard
						</Button>
					</div>
				)}

				{status === "error" && (
					<div className="flex flex-col items-center gap-3 py-8">
						<div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
							<XCircle className="size-6 text-destructive-foreground" />
						</div>
						<p className="text-sm font-medium">Error</p>
						<p className="text-xs text-destructive-foreground">
							{error}
						</p>
						<Button
							variant="outline"
							onClick={() => loadScopeRequest()}
							className="mt-2"
						>
							Try again
						</Button>
					</div>
				)}
			</div>
		</div>
	);
}
