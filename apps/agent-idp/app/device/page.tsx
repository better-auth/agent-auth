"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { authClient } from "@/lib/auth-client";

export default function DevicePage() {
	const router = useRouter();
	const params = useSearchParams();
	const codeFromUrl = params.get("user_code");
	const [userCode, setUserCode] = useState(codeFromUrl ?? "");
	const [isPending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);

		startTransition(async () => {
			try {
				const code = userCode.trim().replace(/-/g, "").toUpperCase();
				const response = await authClient.device({
					query: { user_code: code },
				});
				if (response.data) {
					router.push(`/device/approve?user_code=${code}`);
				}
			} catch (err: unknown) {
				const message =
					err instanceof Error ? err.message : "Invalid code. Try again.";
				setError(message);
			}
		});
	};

	return (
		<div className="flex min-h-dvh items-center justify-center p-4">
			<div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm">
				<div className="mb-6 text-center">
					<h1 className="text-2xl font-bold tracking-tight">
						Device Authorization
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Enter the code displayed on your device
					</p>
				</div>

				<form onSubmit={handleSubmit} className="space-y-4">
					<div>
						<label className="mb-1.5 block text-sm font-medium">
							Device Code
						</label>
						<input
							type="text"
							placeholder="XXXX-XXXX"
							value={userCode}
							onChange={(e) => setUserCode(e.target.value)}
							className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-center font-mono text-lg uppercase outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
							maxLength={9}
							disabled={isPending}
							required
						/>
					</div>

					{error && (
						<p className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive-foreground">
							{error}
						</p>
					)}

					<button
						type="submit"
						disabled={isPending}
						className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
					>
						{isPending ? "Verifying..." : "Continue"}
					</button>
				</form>
			</div>
		</div>
	);
}
