"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Rocket, ArrowLeft } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SignInPage() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const isAddingAccount = searchParams.get("add") === "true";
	const redirectTo = searchParams.get("redirect");

	const [isSignUp, setIsSignUp] = useState(isAddingAccount);
	const [email, setEmail] = useState(isAddingAccount ? "" : "demo@agentdeploy.com");
	const [password, setPassword] = useState(isAddingAccount ? "" : "password123");
	const [name, setName] = useState(isAddingAccount ? "" : "Demo User");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError("");
		setLoading(true);

		try {
			if (isSignUp) {
				const res = await authClient.signUp.email({
					email,
					password,
					name,
				});
				if (res.error) {
					setError(res.error.message ?? "Sign up failed");
					setLoading(false);
					return;
				}
			} else {
				const res = await authClient.signIn.email({
					email,
					password,
				});
				if (res.error) {
					setError(res.error.message ?? "Sign in failed");
					setLoading(false);
					return;
				}
			}

			await fetch("/api/seed", { method: "POST", credentials: "include" });
			router.push(redirectTo || "/dashboard");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Something went wrong");
			setLoading(false);
		}
	}

	return (
		<div className="flex min-h-screen items-center justify-center bg-background">
			<div className="w-full max-w-sm space-y-8">
				{isAddingAccount && (
					<button
						type="button"
						onClick={() => router.push("/dashboard")}
						className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
					>
						<ArrowLeft className="size-4" />
						Back to dashboard
					</button>
				)}

				<div className="flex flex-col items-center gap-3">
					<div className="flex size-12 items-center justify-center rounded-xl bg-primary">
						<Rocket className="size-6 text-primary-foreground" />
					</div>
					<div className="text-center">
						<h1 className="text-xl font-semibold tracking-tight">
							{isAddingAccount ? "Add Account" : "AgentDeploy"}
						</h1>
						<p className="mt-1 text-sm text-muted-foreground">
							{isAddingAccount
								? "Sign in with another account to add it"
								: "AI-powered deployment platform"}
						</p>
					</div>
				</div>

				<form onSubmit={handleSubmit} className="space-y-4">
					{isSignUp && (
						<div className="space-y-2">
							<Label htmlFor="name">Name</Label>
							<Input
								id="name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="Your name"
							/>
						</div>
					)}

					<div className="space-y-2">
						<Label htmlFor="email">Email</Label>
						<Input
							id="email"
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							placeholder="you@example.com"
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="password">Password</Label>
						<Input
							id="password"
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							placeholder="••••••••"
						/>
					</div>

					{error && (
						<p className="text-sm text-destructive-foreground">{error}</p>
					)}

					<Button type="submit" className="w-full" disabled={loading}>
						{loading
							? "Loading..."
							: isSignUp
								? "Create account"
								: isAddingAccount
									? "Add account"
									: "Sign in"}
					</Button>
				</form>

				<p className="text-center text-sm text-muted-foreground">
					{isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
					<button
						type="button"
						onClick={() => {
							setIsSignUp(!isSignUp);
							setError("");
						}}
						className="font-medium text-primary hover:underline"
					>
						{isSignUp ? "Sign in" : "Sign up"}
					</button>
				</p>

				{!isAddingAccount && (
					<div className="rounded-lg border border-border bg-card p-4">
						<p className="text-xs font-medium text-muted-foreground">
							Demo credentials
						</p>
						<p className="mt-1 font-mono text-xs text-foreground">
							demo@agentdeploy.com / password123
						</p>
						<p className="mt-2 text-xs text-muted-foreground">
							Sign up with these or any credentials to get started. Mock
							projects will be seeded automatically.
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
