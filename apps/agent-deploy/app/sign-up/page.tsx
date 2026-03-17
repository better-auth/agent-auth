"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AgentAuthLogo } from "@/components/icons/logo";
import { signUp, useSession } from "@/lib/auth-client";

export default function SignUpPage() {
	const router = useRouter();
	const { data: session, isPending } = useSession();
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (!isPending && session) {
			router.replace("/dashboard");
		}
	}, [session, isPending, router]);

	if (isPending || session) {
		return (
			<div className="flex min-h-dvh items-center justify-center">
				<div className="animate-pulse font-mono text-[11px] text-foreground/30">
					Loading...
				</div>
			</div>
		);
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError("");
		setLoading(true);
		try {
			const result = await signUp.email({ name, email, password });
			if (result.error) {
				setError(result.error.message ?? "Something went wrong");
			} else {
				router.push("/dashboard");
			}
		} catch {
			setError("Something went wrong");
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="flex min-h-dvh flex-col">
			<nav className="flex items-center justify-between border-foreground/[0.06] border-b px-5 py-3 sm:px-6">
				<Link className="flex items-center gap-3" href="/">
					<AgentAuthLogo className="h-4 w-auto" />
					<span className="font-mono text-[11px] text-foreground/40 uppercase tracking-wider">
						Deploy
					</span>
				</Link>
			</nav>

			<div className="flex flex-1 items-center justify-center px-5 py-12">
				<div className="w-full max-w-sm space-y-8">
					<div className="space-y-2 text-center">
						<h1 className="font-semibold text-xl tracking-tight">
							Create an account
						</h1>
						<p className="text-foreground/45 text-sm">
							Start deploying HTML sites in seconds
						</p>
					</div>

					<form className="space-y-4" onSubmit={handleSubmit}>
						<div className="space-y-1.5">
							<label className="font-mono text-[11px] text-foreground/40 uppercase tracking-wider">
								Name
							</label>
							<input
								className="w-full border border-foreground/[0.08] bg-foreground/[0.03] px-3 py-2.5 font-mono text-xs outline-none transition-colors placeholder:text-foreground/25 focus:border-foreground/20 focus:bg-foreground/[0.05]"
								onChange={(e) => setName(e.target.value)}
								placeholder="Your name"
								required
								type="text"
								value={name}
							/>
						</div>

						<div className="space-y-1.5">
							<label className="font-mono text-[11px] text-foreground/40 uppercase tracking-wider">
								Email
							</label>
							<input
								className="w-full border border-foreground/[0.08] bg-foreground/[0.03] px-3 py-2.5 font-mono text-xs outline-none transition-colors placeholder:text-foreground/25 focus:border-foreground/20 focus:bg-foreground/[0.05]"
								onChange={(e) => setEmail(e.target.value)}
								placeholder="you@example.com"
								required
								type="email"
								value={email}
							/>
						</div>

						<div className="space-y-1.5">
							<label className="font-mono text-[11px] text-foreground/40 uppercase tracking-wider">
								Password
							</label>
							<input
								className="w-full border border-foreground/[0.08] bg-foreground/[0.03] px-3 py-2.5 font-mono text-xs outline-none transition-colors placeholder:text-foreground/25 focus:border-foreground/20 focus:bg-foreground/[0.05]"
								minLength={8}
								onChange={(e) => setPassword(e.target.value)}
								placeholder="Min. 8 characters"
								required
								type="password"
								value={password}
							/>
						</div>

						{error && (
							<div className="border border-destructive/20 bg-destructive/5 px-3 py-2 font-mono text-destructive-foreground text-xs">
								{error}
							</div>
						)}

						<button
							className="w-full bg-foreground py-2.5 font-mono text-background text-xs transition-opacity hover:opacity-90 disabled:opacity-50"
							disabled={loading}
							type="submit"
						>
							{loading ? "Creating account..." : "Create Account"}
						</button>
					</form>

					<p className="text-center font-mono text-[11px] text-foreground/35">
						Already have an account?{" "}
						<Link
							className="text-foreground/60 transition-colors hover:text-foreground/80"
							href="/sign-in"
						>
							Sign in
						</Link>
					</p>
				</div>
			</div>
		</div>
	);
}
