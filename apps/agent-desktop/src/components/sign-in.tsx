import { AlertCircle, ExternalLink, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { BetterAuthLogo } from "@/components/icons/logo";
import { Button } from "@/components/ui/button";
import { storage } from "@/lib/storage";
import type { User } from "@/lib/types";

export function SignIn({
	onSuccess,
	onCancel,
}: {
	onSuccess: (user: User) => void;
	onCancel?: () => void;
}) {
	const [step, setStep] = useState<"url" | "signing-in">("url");
	const [idpUrl, setIdpUrl] = useState("");
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		storage.getIdpUrl().then((url) => {
			if (url) setIdpUrl(url);
		});
	}, []);

	const handleUrlSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);
		const trimmed = idpUrl.trim().replace(/\/+$/, "");
		if (!trimmed) {
			setError("Enter your server URL");
			return;
		}
		try {
			new URL(trimmed);
		} catch {
			setError("Enter a valid URL (e.g. http://localhost:3000)");
			return;
		}
		setIdpUrl(trimmed);
		setStep("signing-in");

		const result = await window.electronAPI.openSignIn(trimmed);

		if (result) {
			await storage.upsertAccount({
				idpUrl: trimmed,
				sessionToken: result.token,
				user: result.user as User,
				lastSeenIds: [],
			});
			await window.electronAPI.startPolling();
			onSuccess(result.user as User);
		} else {
			setStep("url");
			setError("Sign-in was cancelled or failed. Please try again.");
		}
	};

	return (
		<div className="flex flex-col items-center justify-center h-screen px-8 py-10">
			<div className="mb-5 flex flex-col items-center gap-2">
				<BetterAuthLogo className="h-6 w-auto" />
				<span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground select-none">
					Better-Auth.
				</span>
			</div>

			{step === "url" ? (
				<>
					<p className="text-xs text-muted-foreground text-center mb-6">
						Connect to your identity provider
					</p>

					{error && (
						<div className="w-full flex items-start gap-2 p-2.5 mb-4 border border-destructive/30 bg-destructive/5 text-[11px] text-destructive rounded-sm">
							<AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
							<span>{error}</span>
						</div>
					)}

					<form onSubmit={handleUrlSubmit} className="w-full space-y-3">
						<div className="space-y-1.5">
							<label
								htmlFor="idp-url"
								className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider"
							>
								Server URL
							</label>
							<input
								id="idp-url"
								type="url"
								placeholder="http://localhost:3000"
								value={idpUrl}
								onChange={(e) => setIdpUrl(e.target.value)}
								className="flex h-9 w-full rounded-sm border border-input bg-background px-3 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring transition-colors"
								autoFocus
							/>
						</div>
						<Button type="submit" className="w-full">
							<ExternalLink className="h-3.5 w-3.5" />
							{onCancel ? "Add Site" : "Sign in with Browser"}
						</Button>
						{onCancel && (
							<Button
								type="button"
								variant="ghost"
								className="w-full"
								onClick={onCancel}
							>
								Cancel
							</Button>
						)}
					</form>
				</>
			) : (
				<>
					<p className="text-xs text-muted-foreground text-center mb-6 max-w-[260px]">
						Sign in on the window that just opened. We'll connect automatically
						once you're done.
					</p>

					<div className="flex flex-col items-center gap-3 mb-6">
						<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
						<span className="text-[10px] font-mono text-muted-foreground/60 truncate max-w-[280px]">
							{idpUrl}
						</span>
					</div>

					<div className="w-full space-y-2">
						<Button
							variant="ghost"
							className="w-full text-muted-foreground"
							onClick={() => setStep("url")}
						>
							Cancel
						</Button>
					</div>
				</>
			)}
		</div>
	);
}
