"use client";

import {
	Fingerprint,
	KeyRound,
	Loader2,
	Mail,
	ShieldCheck,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient, useSession } from "@/lib/auth/client";
import { cn } from "@/lib/utils";

type ReAuthMethod = "password" | "passkey" | "email_otp";

const METHODS: { id: ReAuthMethod; label: string; icon: typeof Fingerprint }[] =
	[
		{ id: "passkey", label: "Passkey", icon: Fingerprint },
		{ id: "password", label: "Password", icon: KeyRound },
		{ id: "email_otp", label: "Email OTP", icon: Mail },
	];

export default function ReAuthPage() {
	const searchParams = useSearchParams();
	const returnTo = searchParams.get("returnTo");
	const { data: session } = useSession();
	const userEmail = session?.user?.email ?? "";

	const [method, setMethod] = useState<ReAuthMethod>("passkey");
	const [password, setPassword] = useState("");
	const [otp, setOtp] = useState("");
	const [otpSent, setOtpSent] = useState(false);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [done, setDone] = useState(false);

	const handleSuccess = () => {
		setDone(true);
		if (returnTo === "extension") {
			setTimeout(() => window.close(), 1500);
		}
	};

	const handlePassword = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!userEmail || !password) return;
		setLoading(true);
		setError(null);
		try {
			const res = await authClient.signIn.email({ email: userEmail, password });
			if (res.error) {
				setError(res.error.message ?? "Incorrect password");
				setLoading(false);
				return;
			}
			handleSuccess();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Authentication failed");
			setLoading(false);
		}
	};

	const handlePasskey = async () => {
		setLoading(true);
		setError(null);
		try {
			const res = await (
				authClient.signIn as {
					passkey: () => Promise<{ error?: { message?: string } } | null>;
				}
			).passkey();
			if (res?.error) {
				setError(res.error.message ?? "Passkey verification failed");
				setLoading(false);
				return;
			}
			handleSuccess();
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Passkey verification failed",
			);
			setLoading(false);
		}
	};

	const handleSendOtp = async () => {
		if (!userEmail) return;
		setLoading(true);
		setError(null);
		try {
			await (
				authClient as {
					emailOtp: {
						sendVerificationOtp: (args: {
							email: string;
							type: string;
						}) => Promise<void>;
					};
				}
			).emailOtp.sendVerificationOtp({
				email: userEmail,
				type: "sign-in",
			});
			setOtpSent(true);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to send OTP");
		}
		setLoading(false);
	};

	const handleVerifyOtp = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!userEmail || !otp) return;
		setLoading(true);
		setError(null);
		try {
			const res = await (
				authClient.signIn as {
					emailOtp: (args: {
						email: string;
						otp: string;
					}) => Promise<{ error?: { message?: string } }>;
				}
			).emailOtp({
				email: userEmail,
				otp,
			});
			if (res.error) {
				setError(res.error.message ?? "Invalid code");
				setLoading(false);
				return;
			}
			handleSuccess();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Verification failed");
			setLoading(false);
		}
	};

	if (!session) {
		return (
			<div className="flex min-h-dvh items-center justify-center p-4">
				<div className="w-full max-w-sm border border-border bg-card p-8 text-center">
					<Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto" />
				</div>
			</div>
		);
	}

	if (done) {
		return (
			<div className="flex min-h-dvh items-center justify-center p-4">
				<div className="w-full max-w-sm border border-border bg-card p-8 text-center space-y-3">
					<ShieldCheck className="h-8 w-8 text-emerald-500 mx-auto" />
					<h1 className="text-base font-medium">Identity confirmed</h1>
					<p className="text-sm text-muted-foreground">
						{returnTo === "extension"
							? "You can return to the extension. This tab will close automatically."
							: "You can close this tab and retry your action."}
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex min-h-dvh items-center justify-center p-4">
			<div className="w-full max-w-sm border border-border bg-card">
				<div className="p-6 pb-4 border-b border-border/50">
					<h1 className="text-base font-medium tracking-tight">
						Confirm your identity
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Re-authenticate to approve the pending request.
					</p>
				</div>

				<div className="p-6 space-y-4">
					<div className="rounded-lg bg-muted/50 p-3">
						<p className="text-xs text-muted-foreground">Signed in as</p>
						<p className="text-sm font-medium">{userEmail}</p>
					</div>

					<div className="inline-flex gap-px p-px bg-muted/50 rounded-md border border-border/40 w-full">
						{METHODS.map((m) => (
							<button
								key={m.id}
								type="button"
								onClick={() => {
									setMethod(m.id);
									setError(null);
								}}
								className={cn(
									"flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-[3px] transition-all",
									method === m.id
										? "bg-background text-foreground shadow-xs"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								<m.icon className="h-3 w-3" />
								{m.label}
							</button>
						))}
					</div>

					{method === "passkey" && (
						<div className="space-y-3">
							<div className="flex flex-col items-center py-4 space-y-3">
								<div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/50">
									<Fingerprint className="h-6 w-6 text-muted-foreground" />
								</div>
								<p className="text-[13px] text-muted-foreground text-center">
									Use your fingerprint, face, or security key.
								</p>
							</div>
							<Button
								className="w-full"
								onClick={handlePasskey}
								disabled={loading}
							>
								{loading && (
									<Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
								)}
								Verify with Passkey
							</Button>
						</div>
					)}

					{method === "password" && (
						<form onSubmit={handlePassword} className="space-y-3">
							<Input
								type="password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								placeholder="Password"
								required
								autoFocus
								className="h-9"
							/>
							<Button
								type="submit"
								className="w-full"
								disabled={loading || !password}
							>
								{loading && (
									<Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
								)}
								Verify
							</Button>
						</form>
					)}

					{method === "email_otp" && (
						<div className="space-y-3">
							{!otpSent ? (
								<Button
									className="w-full"
									onClick={handleSendOtp}
									disabled={loading || !userEmail}
								>
									{loading && (
										<Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
									)}
									Send Code to {userEmail}
								</Button>
							) : (
								<form onSubmit={handleVerifyOtp} className="space-y-3">
									<p className="text-xs text-muted-foreground">
										Enter the code sent to{" "}
										<span className="font-medium text-foreground">
											{userEmail}
										</span>
									</p>
									<Input
										value={otp}
										onChange={(e) => setOtp(e.target.value)}
										placeholder="Enter code"
										required
										autoFocus
										className="h-9 text-center font-mono tracking-widest"
									/>
									<Button
										type="submit"
										className="w-full"
										disabled={loading || !otp}
									>
										{loading && (
											<Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
										)}
										Verify
									</Button>
								</form>
							)}
						</div>
					)}

					{error && (
						<p className="text-[12px] text-destructive-foreground bg-destructive/5 border border-destructive/20 rounded-md px-3 py-2">
							{error}
						</p>
					)}
				</div>
			</div>
		</div>
	);
}
