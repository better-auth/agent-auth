"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { authClient } from "@/lib/auth-client";

function ConsentForm() {
	const searchParams = useSearchParams();
	const clientId = searchParams.get("client_id");
	const scope = searchParams.get("scope");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const scopes = scope?.split(" ").filter(Boolean) ?? [];

	async function handleConsent(accept: boolean) {
		setLoading(true);
		setError(null);

		try {
			await authClient.oauth2.consent({
				accept,
				scope: accept ? scope ?? undefined : undefined,
			});
		} catch {
			setError("Something went wrong. Please try again.");
			setLoading(false);
		}
	}

	return (
		<main className="flex min-h-dvh items-center justify-center p-8 bg-background">
			<div className="w-full max-w-sm space-y-6">
				<div className="text-center space-y-2">
					<h1 className="text-2xl font-semibold text-foreground">
						Authorize Access
					</h1>
					<p className="text-sm text-foreground/50">
						An application is requesting access to your account.
					</p>
				</div>

				<div className="border border-foreground/[0.08] bg-foreground/[0.02] p-4 space-y-3">
					<div className="text-sm text-foreground/50">
						<span className="font-medium text-foreground/80">Client:</span>{" "}
						<code className="text-xs bg-foreground/[0.06] px-1.5 py-0.5 font-mono">
							{clientId ?? "unknown"}
						</code>
					</div>

					{scopes.length > 0 && (
						<div className="space-y-2">
							<div className="text-xs font-medium text-foreground/60">
								Requested permissions:
							</div>
							<ul className="space-y-1">
								{scopes.map((s) => (
									<li
										key={s}
										className="flex items-center gap-2 text-xs text-foreground/50 font-mono"
									>
										<span className="h-1 w-1 rounded-full bg-foreground/20" />
										{s}
									</li>
								))}
							</ul>
						</div>
					)}
				</div>

				{error && (
					<p className="text-sm text-destructive-foreground">{error}</p>
				)}

				<div className="flex gap-3">
					<button
						onClick={() => handleConsent(false)}
						disabled={loading}
						className="flex-1 border border-foreground/[0.12] bg-foreground/[0.04] hover:bg-foreground/[0.08] px-4 py-2.5 text-sm font-medium text-foreground/60 disabled:opacity-50 transition-colors"
					>
						Deny
					</button>
					<button
						onClick={() => handleConsent(true)}
						disabled={loading}
						className="flex-1 bg-foreground text-background px-4 py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
					>
						{loading ? "Loading..." : "Allow"}
					</button>
				</div>
			</div>
		</main>
	);
}

export default function ConsentPage() {
	return (
		<Suspense
			fallback={
				<main className="flex min-h-dvh items-center justify-center bg-background">
					<p className="text-foreground/40 text-sm">Loading...</p>
				</main>
			}
		>
			<ConsentForm />
		</Suspense>
	);
}
