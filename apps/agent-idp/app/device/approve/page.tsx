"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { authClient } from "@/lib/auth-client";

export default function ApprovePage() {
	const router = useRouter();
	const params = useSearchParams();
	const userCode = params.get("user_code");
	const { data: session } = authClient.useSession();
	const [isApprovePending, startApprove] = useTransition();
	const [isDenyPending, startDeny] = useTransition();
	const [error, setError] = useState<string | null>(null);

	const handleApprove = () => {
		if (!userCode) return;
		setError(null);
		startApprove(async () => {
			try {
				await authClient.device.approve({ userCode });
				router.push("/device/success");
			} catch (err: unknown) {
				const message =
					err instanceof Error ? err.message : "Failed to approve device";
				setError(message);
			}
		});
	};

	const handleDeny = () => {
		if (!userCode) return;
		setError(null);
		startDeny(async () => {
			try {
				await authClient.device.deny({ userCode });
				router.push("/device/denied");
			} catch (err: unknown) {
				const message =
					err instanceof Error ? err.message : "Failed to deny device";
				setError(message);
			}
		});
	};

	if (!session) return null;

	return (
		<div className="flex min-h-dvh items-center justify-center p-4">
			<div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm">
				<div className="mb-6 text-center">
					<h1 className="text-2xl font-bold tracking-tight">Approve Device</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						A device is requesting access to your account
					</p>
				</div>

				<div className="mb-4 space-y-3">
					<div className="rounded-lg bg-muted p-3">
						<p className="text-xs font-medium text-muted-foreground">
							Device Code
						</p>
						<p className="font-mono text-lg">{userCode}</p>
					</div>
					<div className="rounded-lg bg-muted p-3">
						<p className="text-xs font-medium text-muted-foreground">
							Signed in as
						</p>
						<p className="text-sm">{session.user.email}</p>
					</div>
				</div>

				{error && (
					<p className="mb-4 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive-foreground">
						{error}
					</p>
				)}

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
			</div>
		</div>
	);
}
