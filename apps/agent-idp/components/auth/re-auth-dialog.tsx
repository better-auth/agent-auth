"use client";

import { Fingerprint, KeyRound, Loader2, Mail } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth/client";
import { cn } from "@/lib/utils";

export type ReAuthMethod = "password" | "passkey" | "email_otp";

interface ReAuthDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSuccess: () => void;
	allowedMethods?: ReAuthMethod[];
	userEmail?: string;
	title?: string;
	description?: string;
}

export function ReAuthDialog({
	open,
	onOpenChange,
	onSuccess,
	allowedMethods = ["password", "passkey"],
	userEmail,
	title = "Confirm your identity",
	description = "Re-authenticate to continue with this action.",
}: ReAuthDialogProps) {
	const [method, setMethod] = useState<ReAuthMethod>(
		allowedMethods.includes("passkey")
			? "passkey"
			: (allowedMethods[0] ?? "password"),
	);
	const [password, setPassword] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const reset = () => {
		setPassword("");
		setOtp("");
		setOtpSent(false);
		setLoading(false);
		setError(null);
	};

	const handleOpenChange = (v: boolean) => {
		if (!v) reset();
		onOpenChange(v);
	};

	const handlePassword = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!userEmail || !password) return;
		setLoading(true);
		setError(null);

		try {
			const res = await authClient.signIn.email({
				email: userEmail,
				password,
			});
			if (res.error) {
				setError(res.error.message ?? "Incorrect password");
				setLoading(false);
				return;
			}
			reset();
			onSuccess();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Authentication failed");
			setLoading(false);
		}
	};

	const handlePasskey = async () => {
		setLoading(true);
		setError(null);

		try {
			const res = await authClient.signIn.passkey();
			if (res?.error) {
				setError(res.error.message ?? "Passkey verification failed");
				setLoading(false);
				return;
			}
			reset();
			onSuccess();
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Passkey verification failed",
			);
			setLoading(false);
		}
	};

	const [otpSent, setOtpSent] = useState(false);
	const [otp, setOtp] = useState("");

	const handleSendOtp = async () => {
		if (!userEmail) return;
		setLoading(true);
		setError(null);
		try {
			await authClient.emailOtp.sendVerificationOtp({
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
			const res = await authClient.signIn.emailOtp({
				email: userEmail,
				otp,
			});
			if (res.error) {
				setError(res.error.message ?? "Invalid code");
				setLoading(false);
				return;
			}
			reset();
			onSuccess();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Verification failed");
			setLoading(false);
		}
	};

	const methodOptions: {
		id: ReAuthMethod;
		label: string;
		icon: typeof Fingerprint;
	}[] = [
		{ id: "passkey", label: "Passkey", icon: Fingerprint },
		{ id: "password", label: "Password", icon: KeyRound },
		{ id: "email_otp", label: "Email OTP", icon: Mail },
	];

	const visibleMethods = methodOptions.filter((m) =>
		allowedMethods.includes(m.id),
	);

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="max-w-sm">
				<DialogHeader>
					<DialogTitle className="text-base tracking-tight">
						{title}
					</DialogTitle>
					<DialogDescription className="text-[13px]">
						{description}
					</DialogDescription>
				</DialogHeader>

				<div className="px-6 pb-6 space-y-4">
					{visibleMethods.length > 1 && (
						<div className="inline-flex gap-px p-px bg-muted/50 rounded-md border border-border/40 w-full">
							{visibleMethods.map((m) => (
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
					)}

					{method === "passkey" && (
						<div className="space-y-3">
							<div className="flex flex-col items-center py-4 space-y-3">
								<div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/50">
									<Fingerprint className="h-6 w-6 text-muted-foreground" />
								</div>
								<p className="text-[13px] text-muted-foreground text-center leading-relaxed">
									Use your fingerprint, face, or security key to verify.
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
							{userEmail && (
								<p className="text-[12px] text-muted-foreground">
									Enter the password for{" "}
									<span className="font-medium text-foreground">
										{userEmail}
									</span>
								</p>
							)}
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
								<>
									<p className="text-[12px] text-muted-foreground">
										We'll send a verification code to{" "}
										{userEmail ? (
											<span className="font-medium text-foreground">
												{userEmail}
											</span>
										) : (
											"your email"
										)}
										.
									</p>
									<Button
										className="w-full"
										onClick={handleSendOtp}
										disabled={loading || !userEmail}
									>
										{loading && (
											<Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
										)}
										Send Code
									</Button>
								</>
							) : (
								<form onSubmit={handleVerifyOtp} className="space-y-3">
									<p className="text-[12px] text-muted-foreground">
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
									<button
										type="button"
										onClick={() => {
											setOtpSent(false);
											setOtp("");
											setError(null);
										}}
										className="text-[11px] text-muted-foreground hover:text-foreground transition-colors w-full text-center"
									>
										Resend code
									</button>
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
			</DialogContent>
		</Dialog>
	);
}

export function useReAuth() {
	const [open, setOpen] = useState(false);
	const [resolver, setResolver] = useState<{
		resolve: () => void;
		reject: (reason?: unknown) => void;
	} | null>(null);

	const requestReAuth = (): Promise<void> => {
		return new Promise((resolve, reject) => {
			setResolver({ resolve, reject });
			setOpen(true);
		});
	};

	const handleSuccess = () => {
		setOpen(false);
		resolver?.resolve();
		setResolver(null);
	};

	const handleOpenChange = (v: boolean) => {
		setOpen(v);
		if (!v) {
			resolver?.reject(new Error("Re-authentication cancelled"));
			setResolver(null);
		}
	};

	return {
		open,
		onOpenChange: handleOpenChange,
		onSuccess: handleSuccess,
		requestReAuth,
	};
}
