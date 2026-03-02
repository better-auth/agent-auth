"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export default function SignIn() {
	const router = useRouter();
	const [isSignUp, setIsSignUp] = useState(false);
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [name, setName] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);
		setLoading(true);

		try {
			if (isSignUp) {
				const res = await authClient.signUp.email({
					email,
					password,
					name: name || email.split("@")[0],
				});
				if (res.error) {
					setError(res.error.message ?? "Sign up failed");
					return;
				}
			} else {
				const res = await authClient.signIn.email({ email, password });
				if (res.error) {
					setError(res.error.message ?? "Sign in failed");
					return;
				}
			}
			router.push("/dashboard");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Something went wrong");
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="flex min-h-dvh items-center justify-center p-4">
			<div className="w-full max-w-sm space-y-6">
				<div className="text-center">
					<h1 className="text-2xl font-bold tracking-tight">Agent Auth</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						{isSignUp ? "Create an account" : "Sign in to your account"}
					</p>
				</div>

				<form onSubmit={handleSubmit} className="space-y-4">
					{isSignUp && (
						<div>
							<label className="mb-1.5 block text-sm font-medium">Name</label>
							<input
								type="text"
								value={name}
								onChange={(e) => setName(e.target.value)}
								className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
								placeholder="Your name"
							/>
						</div>
					)}

					<div>
						<label className="mb-1.5 block text-sm font-medium">Email</label>
						<input
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							required
							className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
							placeholder="you@example.com"
						/>
					</div>

					<div>
						<label className="mb-1.5 block text-sm font-medium">Password</label>
						<input
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							required
							minLength={8}
							className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
							placeholder="••••••••"
						/>
					</div>

					{error && (
						<p className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive-foreground">
							{error}
						</p>
					)}

					<button
						type="submit"
						disabled={loading}
						className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
					>
						{loading ? "Loading..." : isSignUp ? "Create Account" : "Sign In"}
					</button>
				</form>

				<p className="text-center text-sm text-muted-foreground">
					{isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
					<button
						onClick={() => {
							setIsSignUp(!isSignUp);
							setError(null);
						}}
						className="font-medium text-foreground underline-offset-4 hover:underline"
					>
						{isSignUp ? "Sign In" : "Sign Up"}
					</button>
				</p>
			</div>
		</div>
	);
}
