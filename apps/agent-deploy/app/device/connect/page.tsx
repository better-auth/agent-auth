"use client";

import { CheckCircle2, Link2, Loader2, Shield, XCircle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export default function ConnectAccountPage() {
	const searchParams = useSearchParams();
	const router = useRouter();
	const hostId = searchParams.get("host_id") ?? "";
	const hint = searchParams.get("hint") ?? "";

	const [status, setStatus] = useState<
		"checking" | "confirm" | "approving" | "success" | "error"
	>("checking");
	const [error, setError] = useState("");
	const [userEmail, setUserEmail] = useState("");

	useEffect(() => {
		void checkSession();
	}, []);

	async function checkSession() {
		const { data: session } = await authClient.getSession();
		if (!session) {
			const returnUrl = `/device/connect?host_id=${encodeURIComponent(hostId)}${hint ? `&hint=${encodeURIComponent(hint)}` : ""}`;
			router.replace(`/?redirect=${encodeURIComponent(returnUrl)}`);
			return;
		}
		setUserEmail(session.user.email);
		if (!hostId) {
			setError("Missing host_id parameter");
			setStatus("error");
			return;
		}
		setStatus("confirm");
	}

	async function approveLink() {
		setStatus("approving");
		setError("");

		try {
			const res = await fetch("/api/auth/agent/approve-connect-account", {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ hostId }),
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				setError(
					data.message || data.error || `Failed to link (${res.status})`,
				);
				setStatus("error");
				return;
			}

			setStatus("success");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Something went wrong");
			setStatus("error");
		}
	}

	if (status === "checking") {
		return (
			<div className="flex min-h-screen items-center justify-center bg-background">
				<Loader2 className="size-8 text-primary animate-spin" />
			</div>
		);
	}

	return (
		<div className="flex min-h-screen items-center justify-center bg-background">
			<div className="w-full max-w-sm space-y-8">
				<div className="flex flex-col items-center gap-3">
					<div className="flex size-12 items-center justify-center rounded-xl bg-primary">
						<Link2 className="size-6 text-primary-foreground" />
					</div>
					<h1 className="text-xl font-semibold tracking-tight">Link Account</h1>
					<p className="text-center text-sm text-muted-foreground">
						An autonomous agent is requesting to link its host to your account
					</p>
				</div>

				{status === "confirm" && (
					<div className="space-y-4">
						<div className="rounded-lg border border-border bg-card p-4 space-y-3">
							<div className="flex items-center gap-2">
								<Shield className="size-4 text-muted-foreground" />
								<p className="text-xs font-mono text-muted-foreground">
									Host ID
								</p>
							</div>
							<p className="text-sm font-mono break-all">{hostId}</p>
							{hint && (
								<p className="text-xs text-muted-foreground">
									Requested by: {hint}
								</p>
							)}
						</div>

						<div className="rounded-lg border border-border bg-card p-4 space-y-2">
							<p className="text-xs text-muted-foreground">
								Linking to account
							</p>
							<p className="text-sm font-medium">{userEmail}</p>
						</div>

						<p className="text-xs text-center text-muted-foreground">
							After approval, this host and all its agents will be linked to
							your account. You'll be able to manage them from your dashboard.
						</p>

						<Button onClick={approveLink} className="w-full">
							Approve & Link
						</Button>
						<Button
							variant="outline"
							className="w-full"
							onClick={() => router.push("/dashboard")}
						>
							Cancel
						</Button>
					</div>
				)}

				{status === "approving" && (
					<div className="flex flex-col items-center gap-3 py-8">
						<Loader2 className="size-8 text-primary animate-spin" />
						<p className="text-sm text-muted-foreground">Linking account...</p>
					</div>
				)}

				{status === "success" && (
					<div className="flex flex-col items-center gap-3 py-8">
						<div className="flex size-12 items-center justify-center rounded-full bg-success/10">
							<CheckCircle2 className="size-6 text-success" />
						</div>
						<p className="text-sm font-medium">Account linked</p>
						<p className="text-xs text-muted-foreground text-center">
							The host is now connected to your account. All agents under this
							host are visible in your dashboard.
						</p>
						<Button
							variant="outline"
							onClick={() => router.push("/dashboard")}
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
						<p className="text-sm font-medium">Link failed</p>
						<p className="text-xs text-destructive-foreground">{error}</p>
						<Button
							variant="outline"
							onClick={() => {
								setStatus("confirm");
								setError("");
							}}
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
