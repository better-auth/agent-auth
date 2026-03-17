"use client";

import { signIn, signUp, useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function OnePasswordLogo({ className }: { className?: string }) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
			<path d="M12 1C5.92 1 1 5.92 1 12s4.92 11 11 11s11-4.92 11-11S18.08 1 12 1m0 19a8 8 0 0 1-8-8a8 8 0 0 1 8-8a8 8 0 0 1 8 8a8 8 0 0 1-8 8m1-6.5c0 .63.4 1.2 1 1.41V18h-4v-6.09c.78-.27 1.19-1.11.93-1.91a1.5 1.5 0 0 0-.93-.91V6h4v6.09c-.6.21-1 .78-1 1.41" />
		</svg>
	);
}

function Spinner() {
	return (
		<svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
			<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
			<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
		</svg>
	);
}

export default function Home() {
	const { data: session, isPending } = useSession();
	const router = useRouter();
	const [mode, setMode] = useState<"sign_in" | "sign_up">("sign_in");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [name, setName] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState("");

	useEffect(() => {
		if (session) {
			router.push("/dashboard");
		}
	}, [session, router]);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setSubmitting(true);
		setError("");

		try {
			if (mode === "sign_up") {
				const res = await signUp.email({
					email,
					password,
					name: name || email.split("@")[0],
					callbackURL: "/dashboard",
				});
				if (res.error) {
					setError(res.error.message || "Sign up failed");
				}
			} else {
				const res = await signIn.email({
					email,
					password,
					callbackURL: "/dashboard",
				});
				if (res.error) {
					setError(res.error.message || "Invalid credentials");
				}
			}
		} catch {
			setError("Something went wrong. Please try again.");
		} finally {
			setSubmitting(false);
		}
	};

	if (isPending) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-inset">
				<Spinner />
			</div>
		);
	}

	return (
		<div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-inset">
			<div className="pointer-events-none absolute inset-0">
				<div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/3 h-[700px] w-[700px] rounded-full bg-accent/4 blur-[160px]" />
			</div>

			<main className="relative z-10 flex w-full max-w-sm flex-col items-center gap-10 px-6">
				<div className="flex flex-col items-center gap-5">
					<div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 ring-1 ring-accent/20">
						<OnePasswordLogo className="h-8 w-8 text-accent" />
					</div>

					<div className="flex flex-col items-center gap-2 text-center">
						<h1 className="text-2xl font-semibold tracking-tight text-white">
							{mode === "sign_in" ? "Sign in to 1Password Proxy" : "Create an account"}
						</h1>
						<p className="max-w-xs text-sm leading-relaxed text-muted">
							Proxy 1Password Connect API access for AI agents through the Agent Auth Protocol.
						</p>
					</div>
				</div>

				<div className="w-full rounded-xl border border-border bg-surface p-6">
					<form onSubmit={handleSubmit} className="flex flex-col gap-4">
						{mode === "sign_up" && (
							<div>
								<label htmlFor="name" className="mb-1.5 block text-xs font-medium text-muted">
									Name
								</label>
								<input
									id="name"
									type="text"
									value={name}
									onChange={(e) => setName(e.target.value)}
									placeholder="Your name"
									className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-white placeholder:text-muted/50 outline-none focus:border-accent/50 transition-colors"
								/>
							</div>
						)}

						<div>
							<label htmlFor="email" className="mb-1.5 block text-xs font-medium text-muted">
								Email
							</label>
							<input
								id="email"
								type="email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								placeholder="you@example.com"
								required
								className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-white placeholder:text-muted/50 outline-none focus:border-accent/50 transition-colors"
							/>
						</div>

						<div>
							<label htmlFor="password" className="mb-1.5 block text-xs font-medium text-muted">
								Password
							</label>
							<input
								id="password"
								type="password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								placeholder="••••••••"
								required
								minLength={8}
								className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-white placeholder:text-muted/50 outline-none focus:border-accent/50 transition-colors"
							/>
						</div>

						{error && (
							<p className="text-xs text-op-danger">{error}</p>
						)}

						<button
							type="submit"
							disabled={submitting}
							className="group flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-accent text-sm font-medium text-white transition-colors hover:bg-accent-hover active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
						>
							{submitting ? <Spinner /> : mode === "sign_in" ? "Sign in" : "Create account"}
						</button>

						<p className="text-center text-xs text-muted">
							{mode === "sign_in" ? (
								<>
									Don&apos;t have an account?{" "}
									<button
										type="button"
										onClick={() => { setMode("sign_up"); setError(""); }}
										className="cursor-pointer text-accent hover:underline"
									>
										Sign up
									</button>
								</>
							) : (
								<>
									Already have an account?{" "}
									<button
										type="button"
										onClick={() => { setMode("sign_in"); setError(""); }}
										className="cursor-pointer text-accent hover:underline"
									>
										Sign in
									</button>
								</>
							)}
						</p>
					</form>
				</div>

				<div className="flex items-center gap-4 text-xs text-muted/50">
					<span>Connect API</span>
					<span className="h-0.5 w-0.5 rounded-full bg-muted/30" />
					<span>Secrets Automation</span>
					<span className="h-0.5 w-0.5 rounded-full bg-muted/30" />
					<span>Agent Auth Protocol</span>
				</div>
			</main>
		</div>
	);
}
