"use client";

import {
	AlertCircle,
	ArrowLeft,
	CheckCircle,
	Globe,
	Loader2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AgentAuthLogo } from "@/components/icons/logo";
import { ThemeToggle } from "@/components/theme-toggle";

interface SubmitResult {
	config: {
		provider_name: string;
		description?: string;
		issuer: string;
		modes: string[];
		approval_methods: string[];
	};
	id: string;
	name: string;
}

export default function SubmitPage() {
	const router = useRouter();
	const [url, setUrl] = useState("");
	const [displayName, setDisplayName] = useState("");
	const [categories, setCategories] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [result, setResult] = useState<SubmitResult | null>(null);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);
		setResult(null);
		setLoading(true);

		try {
			const res = await fetch("/api/providers", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					url: url.trim(),
					displayName: displayName.trim() || undefined,
					categories: categories
						.split(",")
						.map((c) => c.trim())
						.filter(Boolean),
				}),
			});

			const data = await res.json();

			if (!res.ok) {
				setError(data.error ?? `Failed to register (${res.status})`);
				return;
			}

			setResult(data as SubmitResult);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Network error");
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="flex min-h-dvh flex-col">
			<nav className="flex shrink-0 items-center border-foreground/[0.06] border-b">
				<Link className="flex items-center gap-2.5 px-5 py-3 sm:px-6" href="/">
					<AgentAuthLogo className="h-3.5 w-auto" />
					<p className="select-none font-mono text-foreground/70 text-xs uppercase tracking-wider">
						Agent-Auth
					</p>
				</Link>
				<div className="ml-auto flex items-center px-5 sm:px-6">
					<ThemeToggle />
				</div>
			</nav>

			<div className="mx-auto w-full max-w-lg flex-1 px-5 py-8 sm:px-6 lg:px-8">
				<Link
					className="mb-8 inline-flex items-center gap-1.5 font-mono text-[11px] text-foreground/40 transition-colors hover:text-foreground/60"
					href="/"
				>
					<ArrowLeft className="h-3 w-3" />
					Back
				</Link>

				<div className="mb-8 space-y-2">
					<h1 className="font-semibold text-foreground text-lg">
						Submit a Provider
					</h1>
					<p className="text-foreground/45 text-xs leading-relaxed">
						Enter the URL of an Agent Auth-capable service. We'll auto-discover
						its configuration from{" "}
						<code className="font-mono text-[10px] text-foreground/55">
							/.well-known/agent-configuration
						</code>
					</p>
				</div>

				{result ? (
					<div className="space-y-6">
						<div className="space-y-3 border border-success/20 bg-success/5 p-5">
							<div className="flex items-center gap-2 text-success">
								<CheckCircle className="h-4 w-4" />
								<span className="font-medium text-sm">Provider registered</span>
							</div>
							<div className="space-y-1.5">
								<p className="font-mono text-foreground/60 text-xs">
									Name: {result.config.provider_name}
								</p>
								{result.config.description && (
									<p className="text-foreground/50 text-xs">
										{result.config.description}
									</p>
								)}
								<p className="font-mono text-foreground/40 text-xs">
									Issuer: {result.config.issuer}
								</p>
								<p className="font-mono text-foreground/40 text-xs">
									Modes: {result.config.modes.join(", ")}
								</p>
							</div>
						</div>

						<div className="flex items-center gap-3">
							<button
								className="flex-1 border border-foreground/[0.12] bg-foreground/[0.04] px-4 py-2.5 text-center font-mono text-foreground/60 text-xs transition-all hover:border-foreground/[0.20] hover:bg-foreground/[0.08]"
								onClick={() =>
									router.push(
										`/providers/${encodeURIComponent(result.config.provider_name)}`
									)
								}
							>
								View Provider
							</button>
							<button
								className="flex-1 border border-foreground/[0.12] bg-foreground/[0.04] px-4 py-2.5 text-center font-mono text-foreground/60 text-xs transition-all hover:border-foreground/[0.20] hover:bg-foreground/[0.08]"
								onClick={() => {
									setResult(null);
									setUrl("");
									setDisplayName("");
									setCategories("");
								}}
							>
								Submit Another
							</button>
						</div>
					</div>
				) : (
					<form className="space-y-5" onSubmit={handleSubmit}>
						<div className="space-y-2">
							<label className="font-mono text-[11px] text-foreground/40 uppercase tracking-wider">
								Service URL *
							</label>
							<div className="relative">
								<Globe className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-foreground/25" />
								<input
									className="w-full border border-foreground/[0.08] bg-foreground/[0.03] py-2.5 pr-4 pl-10 font-mono text-foreground text-xs transition-all placeholder:text-foreground/25 focus:border-foreground/20 focus:bg-foreground/[0.05] focus:outline-none"
									onChange={(e) => setUrl(e.target.value)}
									placeholder="https://myservice.com"
									required
									type="url"
									value={url}
								/>
							</div>
						</div>

						<div className="space-y-2">
							<label className="font-mono text-[11px] text-foreground/40 uppercase tracking-wider">
								Display Name{" "}
								<span className="text-foreground/25">(optional)</span>
							</label>
							<input
								className="w-full border border-foreground/[0.08] bg-foreground/[0.03] px-4 py-2.5 font-mono text-foreground text-xs transition-all placeholder:text-foreground/25 focus:border-foreground/20 focus:bg-foreground/[0.05] focus:outline-none"
								onChange={(e) => setDisplayName(e.target.value)}
								placeholder="My Service"
								type="text"
								value={displayName}
							/>
						</div>

						<div className="space-y-2">
							<label className="font-mono text-[11px] text-foreground/40 uppercase tracking-wider">
								Categories{" "}
								<span className="text-foreground/25">(comma-separated)</span>
							</label>
							<input
								className="w-full border border-foreground/[0.08] bg-foreground/[0.03] px-4 py-2.5 font-mono text-foreground text-xs transition-all placeholder:text-foreground/25 focus:border-foreground/20 focus:bg-foreground/[0.05] focus:outline-none"
								onChange={(e) => setCategories(e.target.value)}
								placeholder="deployment, hosting, devops"
								type="text"
								value={categories}
							/>
						</div>

						{error && (
							<div className="flex items-start gap-2 border border-destructive/20 bg-destructive/5 p-3 text-destructive-foreground text-xs">
								<AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
								{error}
							</div>
						)}

						<button
							className="flex w-full items-center justify-center gap-2 bg-foreground px-4 py-2.5 font-mono text-background text-xs uppercase tracking-wider transition-opacity hover:opacity-90 disabled:opacity-40"
							disabled={loading || !url.trim()}
							type="submit"
						>
							{loading ? (
								<>
									<Loader2 className="h-3.5 w-3.5 animate-spin" />
									Discovering...
								</>
							) : (
								"Discover & Register"
							)}
						</button>

						<p className="text-center font-mono text-[10px] text-foreground/25">
							We'll fetch the{" "}
							<code className="text-foreground/35">
								/.well-known/agent-configuration
							</code>{" "}
							endpoint to verify and populate provider details.
						</p>
					</form>
				)}
			</div>
		</div>
	);
}
