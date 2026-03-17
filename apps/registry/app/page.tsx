import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { Nav } from "@/components/nav";
import { ProviderCard } from "@/components/provider-card";
import { SearchBar } from "@/components/search-bar";
import { db } from "@/lib/db";
import { provider } from "@/lib/db/schema";
import { safeJsonParse } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
	const providers = await db
		.select()
		.from(provider)
		.where(and(eq(provider.status, "active"), eq(provider.public, true)))
		.limit(12);

	return (
		<div className="min-h-dvh flex flex-col">
			<Nav />

			<div className="relative overflow-hidden">
				<div
					className="absolute inset-0 pointer-events-none select-none"
					aria-hidden="true"
					style={{
						backgroundImage: `
							linear-gradient(to right, var(--foreground) 1px, transparent 1px),
							linear-gradient(to bottom, var(--foreground) 1px, transparent 1px)
						`,
						backgroundSize: "60px 60px",
						opacity: 0.03,
						maskImage:
							"radial-gradient(ellipse 70% 60% at 50% 50%, black 20%, transparent 70%)",
						WebkitMaskImage:
							"radial-gradient(ellipse 70% 60% at 50% 50%, black 20%, transparent 70%)",
					}}
				/>

				<div
					className="absolute -top-20 left-1/2 -translate-x-1/2 w-[80vw] max-w-[600px] h-[40vw] max-h-[300px] pointer-events-none select-none rounded-full"
					aria-hidden="true"
					style={{
						background:
							"radial-gradient(circle, var(--foreground) 0%, transparent 70%)",
						opacity: 0.03,
						filter: "blur(60px)",
					}}
				/>

				<div
					className="absolute inset-0 pointer-events-none select-none overflow-hidden"
					aria-hidden="true"
				>
					<svg
						className="absolute top-3 left-3 sm:top-4 sm:left-4 text-foreground/20"
						width="16"
						height="16"
						viewBox="0 0 20 20"
						fill="none"
					>
						<path d="M0 8V0H8" stroke="currentColor" strokeWidth="1" />
					</svg>
					<svg
						className="absolute top-3 right-3 sm:top-4 sm:right-4 text-foreground/20"
						width="16"
						height="16"
						viewBox="0 0 20 20"
						fill="none"
					>
						<path d="M20 8V0H12" stroke="currentColor" strokeWidth="1" />
					</svg>
					<span className="absolute top-3.5 left-8 sm:top-5 sm:left-9 text-[7px] font-mono text-foreground/15 tracking-[0.2em] uppercase">
						agent-auth.directory
					</span>
				</div>

				<div className="relative z-10 px-4 sm:px-6 lg:px-8 py-12 sm:py-20 lg:py-28 flex flex-col items-center text-center max-w-2xl mx-auto space-y-6">
					<div className="space-y-3">
						<h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl text-foreground leading-tight font-semibold tracking-tight">
							Agent Registry
						</h1>
						<p className="text-sm sm:text-base text-foreground/50 max-w-md mx-auto leading-relaxed">
							Discover Agent Auth-capable services by intent. The searchable
							index for AI agent infrastructure.
						</p>
					</div>

					<div className="w-full max-w-lg">
						<SearchBar size="large" autoFocus />
					</div>

					<div className="flex items-center justify-center gap-3 sm:gap-4 text-[10px] font-mono text-foreground/30 flex-wrap">
						<span>
							{providers.length} provider
							{providers.length !== 1 && "s"} registered
						</span>
						<span className="text-foreground/15 hidden sm:inline">|</span>
						<span className="hidden sm:inline">intent-based discovery</span>
						<span className="text-foreground/15 hidden sm:inline">|</span>
						<span className="hidden sm:inline">SS6.2 compliant</span>
					</div>
				</div>

				<div
					className="absolute bottom-0 left-0 right-0 h-px"
					style={{
						background:
							"linear-gradient(to right, transparent 0%, var(--foreground) 30%, var(--foreground) 70%, transparent 100%)",
						opacity: 0.08,
					}}
				/>
			</div>

			{providers.length > 0 && (
				<div className="relative flex-1">
					<div
						className="absolute inset-0 pointer-events-none select-none"
						aria-hidden="true"
						style={{
							backgroundImage: `
								linear-gradient(to right, var(--foreground) 1px, transparent 1px),
								linear-gradient(to bottom, var(--foreground) 1px, transparent 1px)
							`,
							backgroundSize: "80px 80px",
							opacity: 0.015,
							maskImage:
								"linear-gradient(to bottom, black 0%, transparent 50%)",
							WebkitMaskImage:
								"linear-gradient(to bottom, black 0%, transparent 50%)",
						}}
					/>

					<div className="relative px-4 sm:px-6 lg:px-8 py-8 sm:py-14">
						<div className="flex items-center justify-between mb-6">
							<h2 className="text-[11px] font-mono uppercase tracking-wider text-foreground/40">
								Registered Providers
							</h2>
							<Link
								href="/providers"
								className="text-[11px] font-mono text-foreground/35 hover:text-foreground/60 transition-colors"
							>
								View all →
							</Link>
						</div>

						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
							{providers.map((p) => (
								<ProviderCard
									key={p.id}
									name={p.name}
									displayName={p.displayName}
									description={p.description}
									categories={safeJsonParse<string[]>(p.categories, [])}
									verified={p.verified}
									modes={safeJsonParse<string[]>(p.modes, [])}
									url={p.url}
								/>
							))}
						</div>
					</div>
				</div>
			)}

			{providers.length === 0 && (
				<div className="flex-1 flex flex-col items-center justify-center py-20 px-5 text-center">
					<div className="space-y-3">
						<p className="text-sm text-foreground/40">
							No providers registered yet.
						</p>
						<Link
							href="/submit"
							className="inline-flex items-center gap-2 border border-foreground/[0.12] bg-foreground/[0.04] hover:bg-foreground/[0.08] hover:border-foreground/[0.20] px-4 py-2 transition-all text-xs font-mono text-foreground/60"
						>
							Submit the first provider
						</Link>
					</div>
				</div>
			)}

			<footer className="relative w-full border-t border-foreground/[0.06] bg-background overflow-hidden">
				<div
					className="absolute inset-0 pointer-events-none select-none"
					aria-hidden="true"
					style={{
						backgroundImage:
							"radial-gradient(circle, currentColor 0.5px, transparent 0.5px)",
						backgroundSize: "24px 24px",
						opacity: 0.03,
					}}
				/>
				<div className="relative px-4 sm:px-6 lg:px-7 py-5 sm:py-6">
					<div className="flex items-center justify-between gap-3">
						<span className="text-[10px] text-foreground/40 flex items-center gap-2 flex-wrap">
							<Link
								href="https://better-auth.com"
								target="_blank"
								rel="noopener noreferrer"
								className="hover:text-foreground/60 transition-colors"
							>
								© Better Auth Inc.
							</Link>
							<span className="text-foreground/20 hidden sm:inline">·</span>
							<Link
								href="https://agent-auth.directory/docs"
								target="_blank"
								rel="noopener noreferrer"
								className="hover:text-foreground/60 transition-colors hidden sm:inline"
							>
								Docs
							</Link>
						</span>
						<div className="flex items-center gap-3 shrink-0">
							<Link
								href="https://discord.gg/GYC3W7tZzb"
								aria-label="Discord"
								target="_blank"
								rel="noopener noreferrer"
								className="text-foreground/45 hover:text-foreground/70 transition-colors"
							>
								<svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true">
									<path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.947 2.418-2.157 2.418z" />
								</svg>
							</Link>
							<Link
								href="https://github.com/better-auth/agent-auth"
								aria-label="GitHub"
								target="_blank"
								rel="noopener noreferrer"
								className="text-foreground/45 hover:text-foreground/70 transition-colors"
							>
								<svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true">
									<path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
								</svg>
							</Link>
						</div>
					</div>
				</div>
			</footer>
		</div>
	);
}
