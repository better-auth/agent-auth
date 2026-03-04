"use client";

import { Loader2, Shield } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { authClient, useSession } from "@/lib/auth/client";

interface OAuthClientInfo {
	name?: string;
	icon?: string;
	uri?: string;
}

const SCOPE_LABELS: Record<string, { label: string; description: string }> = {
	openid: {
		label: "OpenID",
		description: "Verify your identity",
	},
	profile: {
		label: "Profile",
		description: "Access your name and profile picture",
	},
	email: {
		label: "Email",
		description: "Access your email address",
	},
	offline_access: {
		label: "Offline Access",
		description: "Maintain access when you're not actively using the app",
	},
};

export default function OAuthConsentPage() {
	const searchParams = useSearchParams();
	const clientId = searchParams.get("client_id");
	const scope = searchParams.get("scope");
	const { data: session } = useSession();

	const [clientInfo, setClientInfo] = useState<OAuthClientInfo | null>(null);
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const scopes = scope?.split(" ").filter(Boolean) ?? [];

	useEffect(() => {
		if (!clientId) {
			setLoading(false);
			return;
		}
		authClient.oauth2
			.publicClient({ query: { client_id: clientId } })
			.then(({ data }) => {
				setClientInfo(data as OAuthClientInfo);
			})
			.catch(() => {})
			.finally(() => setLoading(false));
	}, [clientId]);

	const handleConsent = async (accept: boolean) => {
		setSubmitting(true);
		setError(null);
		try {
			const res = await authClient.oauth2.consent({
				accept,
				scope: accept ? (scope ?? undefined) : undefined,
			});
			if (res.error) {
				setError(res.error.message ?? "Failed to process consent");
				setSubmitting(false);
			}
		} catch {
			setError("Something went wrong");
			setSubmitting(false);
		}
	};

	if (!session) return null;

	if (loading) {
		return (
			<div className="flex min-h-dvh items-center justify-center p-4">
				<div className="w-full max-w-md border border-border bg-card p-8 text-center">
					<Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto" />
				</div>
			</div>
		);
	}

	return (
		<div className="flex min-h-dvh items-center justify-center p-4">
			<div className="w-full max-w-md border border-border bg-card">
				<div className="p-6 pb-4 text-center border-b border-border/50">
					<div className="flex items-center justify-center gap-3 mb-3">
						{clientInfo?.icon ? (
							<img
								src={clientInfo.icon}
								alt=""
								className="h-10 w-10 rounded-lg"
							/>
						) : (
							<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
								<Shield className="h-5 w-5 text-muted-foreground" />
							</div>
						)}
					</div>
					<h1 className="text-lg font-medium tracking-tight">
						Authorize{" "}
						<span className="font-semibold">
							{clientInfo?.name || clientId || "Application"}
						</span>
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						wants to access your account
					</p>
				</div>

				<div className="p-6 space-y-4">
					<div className="rounded-lg bg-muted/50 p-3">
						<p className="text-xs font-medium text-muted-foreground">
							Signed in as
						</p>
						<p className="text-sm font-medium">{session.user.email}</p>
					</div>

					{scopes.length > 0 && (
						<div className="space-y-1.5">
							<p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
								Permissions requested
							</p>
							<div className="space-y-1">
								{scopes.map((s) => {
									const info = SCOPE_LABELS[s];
									return (
										<div
											key={s}
											className="flex items-start gap-2.5 rounded-md border border-border/50 px-3 py-2"
										>
											<Shield className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
											<div className="min-w-0">
												<p className="text-sm font-medium">
													{info?.label ?? s}
												</p>
												{info?.description && (
													<p className="text-xs text-muted-foreground">
														{info.description}
													</p>
												)}
											</div>
										</div>
									);
								})}
							</div>
						</div>
					)}

					{error && (
						<p className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive-foreground">
							{error}
						</p>
					)}

					<div className="flex gap-3 pt-2">
						<button
							type="button"
							onClick={() => handleConsent(false)}
							disabled={submitting}
							className="flex-1 rounded-md border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
						>
							Deny
						</button>
						<button
							type="button"
							onClick={() => handleConsent(true)}
							disabled={submitting}
							className="flex-1 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
						>
							{submitting ? (
								<Loader2 className="h-4 w-4 animate-spin mx-auto" />
							) : (
								"Authorize"
							)}
						</button>
					</div>
				</div>

				<div className="border-t border-border/50 px-6 py-3">
					<p className="text-center text-xs text-muted-foreground">
						You can revoke access at any time from your settings.
					</p>
				</div>
			</div>
		</div>
	);
}
