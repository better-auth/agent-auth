"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Rocket, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export default function DeviceAuthPage() {
	const searchParams = useSearchParams();
	const router = useRouter();
	const codeFromUrl = searchParams.get("user_code") ?? "";

	const [userCode, setUserCode] = useState(codeFromUrl);
	const [status, setStatus] = useState<
		"checking" | "input" | "verifying" | "confirm" | "approving" | "success" | "error"
	>("checking");
	const [error, setError] = useState("");
	const [scope, setScope] = useState("");

	useEffect(() => {
		checkSession();
	}, []);

	async function checkSession() {
		const { data: session } = await authClient.getSession();
		if (!session) {
			const returnUrl = `/device${codeFromUrl ? `?user_code=${encodeURIComponent(codeFromUrl)}` : ""}`;
			router.replace(`/?redirect=${encodeURIComponent(returnUrl)}`);
			return;
		}
		if (codeFromUrl) {
			verifyCode(codeFromUrl);
		} else {
			setStatus("input");
		}
	}

	async function verifyCode(code: string) {
		setStatus("verifying");
		setError("");

		try {
			const res = await fetch(
				`/api/auth/device?user_code=${encodeURIComponent(code)}`,
				{ credentials: "include" },
			);

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				setError(
					data.error_description ||
						data.message ||
						"Invalid or expired code",
				);
				setStatus("error");
				return;
			}

			const data = await res.json();
			setScope(data.scope ?? "");
			setStatus("confirm");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Something went wrong");
			setStatus("error");
		}
	}

	async function approveCode() {
		setStatus("approving");
		setError("");

		try {
			const res = await fetch("/api/auth/device/approve", {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ userCode }),
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				setError(
					data.error_description ||
						data.message ||
						"Failed to approve",
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
						<Rocket className="size-6 text-primary-foreground" />
					</div>
					<h1 className="text-xl font-semibold tracking-tight">
						Authorize Agent
					</h1>
					<p className="text-center text-sm text-muted-foreground">
						Enter the code shown by your AI agent to grant it access
					</p>
				</div>

				{status === "input" && (
					<form
						onSubmit={(e) => {
							e.preventDefault();
							verifyCode(userCode);
						}}
						className="space-y-4"
					>
						<div className="space-y-2">
							<Label htmlFor="code">Device Code</Label>
							<Input
								id="code"
								value={userCode}
								onChange={(e) =>
									setUserCode(e.target.value.toUpperCase())
								}
								placeholder="XXXX-XXXX"
								className="text-center text-lg font-mono tracking-widest"
								autoFocus
							/>
						</div>
						<Button
							type="submit"
							className="w-full"
							disabled={!userCode}
						>
							Continue
						</Button>
					</form>
				)}

				{(status === "verifying" || status === "approving") && (
					<div className="flex flex-col items-center gap-3 py-8">
						<Loader2 className="size-8 text-primary animate-spin" />
						<p className="text-sm text-muted-foreground">
							{status === "verifying"
								? "Verifying code..."
								: "Approving..."}
						</p>
					</div>
				)}

				{status === "confirm" && (
					<div className="space-y-4">
						<div className="rounded-lg border border-border bg-card p-4 text-center">
							<p className="text-xs text-muted-foreground mb-1">
								Device Code
							</p>
							<p className="text-lg font-mono font-semibold tracking-widest">
								{userCode}
							</p>
							{scope && (
								<p className="mt-3 text-xs text-muted-foreground">
									Requested scopes:{" "}
									<span className="font-mono">{scope}</span>
								</p>
							)}
						</div>
						<p className="text-xs text-center text-muted-foreground">
							An AI agent is requesting access to your account.
							Only approve if you initiated this.
						</p>
						<Button onClick={approveCode} className="w-full">
							Approve
						</Button>
						<Button
							variant="outline"
							className="w-full"
							onClick={() => {
								setStatus("input");
								setUserCode("");
							}}
						>
							Cancel
						</Button>
					</div>
				)}

				{status === "success" && (
					<div className="flex flex-col items-center gap-3 py-8">
						<div className="flex size-12 items-center justify-center rounded-full bg-success/10">
							<CheckCircle2 className="size-6 text-success" />
						</div>
						<p className="text-sm font-medium">Agent authorized</p>
						<p className="text-xs text-muted-foreground text-center">
							The agent now has access. You can manage its
							permissions in the dashboard.
						</p>
						<Button
							variant="outline"
							onClick={() => router.push("/dashboard/agents")}
							className="mt-2"
						>
							Go to Agents
						</Button>
					</div>
				)}

				{status === "error" && (
					<div className="flex flex-col items-center gap-3 py-8">
						<div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
							<XCircle className="size-6 text-destructive-foreground" />
						</div>
						<p className="text-sm font-medium">
							Authorization failed
						</p>
						<p className="text-xs text-destructive-foreground">
							{error}
						</p>
						<Button
							variant="outline"
							onClick={() => {
								setStatus("input");
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
