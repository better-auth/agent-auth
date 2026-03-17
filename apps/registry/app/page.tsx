import { eq } from "drizzle-orm";
import Link from "next/link";
import { AgentAuthLogo } from "@/components/icons/logo";
import { ProviderCard } from "@/components/provider-card";
import { SearchBar } from "@/components/search-bar";
import { ThemeToggle } from "@/components/theme-toggle";
import { db } from "@/lib/db";
import { provider } from "@/lib/db/schema";

export default async function LandingPage() {
	const providers = await db
		.select()
		.from(provider)
		.where(eq(provider.status, "active"))
		.limit(12);

	return (
		<div className="min-h-dvh flex flex-col">
			<nav className="shrink-0 flex items-center border-b border-foreground/[0.06]">
				<Link href="/" className="flex items-center gap-2.5 px-5 sm:px-6 py-3">
					<AgentAuthLogo className="h-3 w-auto" />
					<p className="select-none font-mono text-xs uppercase tracking-wider text-foreground/70">
						Agent-Auth
					</p>
					<span className="text-foreground/20 text-[10px] font-mono">/</span>
					<p className="select-none font-mono text-[10px] uppercase tracking-wider text-foreground/40">
						Registry
					</p>
				</Link>
				<div className="ml-auto flex items-center gap-2 px-5 sm:px-6">
					<Link
						href="/providers"
						className="text-[11px] font-mono text-foreground/45 hover:text-foreground/70 transition-colors"
					>
						Browse
					</Link>
					<span className="text-foreground/15 text-[10px] select-none">/</span>
					<Link
						href="/submit"
						className="text-[11px] font-mono text-foreground/45 hover:text-foreground/70 transition-colors"
					>
						Submit
					</Link>
					<span className="text-foreground/15 text-[10px] select-none ml-2">
						|
					</span>
					<ThemeToggle />
				</div>
			</nav>

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
					className="absolute -top-20 left-1/2 -translate-x-1/2 w-[600px] h-[300px] pointer-events-none select-none rounded-full"
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

				<div className="relative z-10 px-5 sm:px-6 lg:px-8 py-16 sm:py-20 lg:py-28 flex flex-col items-center text-center max-w-2xl mx-auto space-y-6">
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

					<div className="flex items-center gap-4 text-[10px] font-mono text-foreground/30">
						<span>
							{providers.length} provider
							{providers.length !== 1 && "s"} registered
						</span>
						<span className="text-foreground/15">|</span>
						<span>intent-based discovery</span>
						<span className="text-foreground/15">|</span>
						<span>SS6.2 compliant</span>
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

					<div className="relative px-5 sm:px-6 lg:px-8 py-10 sm:py-14">
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
									categories={JSON.parse(p.categories) as string[]}
									verified={p.verified}
									modes={JSON.parse(p.modes) as string[]}
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
						<p className="text-[10px] font-mono text-foreground/25 pt-2">
							Or seed the database: GET /api/seed
						</p>
					</div>
				</div>
			)}

			<footer className="border-t border-foreground/[0.06] px-5 sm:px-6 py-5">
				<div className="flex items-center justify-between">
					<span className="text-[10px] text-foreground/30 font-mono">
						AGENT-AUTH — Registry
					</span>
					<div className="flex items-center gap-3 text-[10px] font-mono text-foreground/30">
						<Link
							href="https://github.com/agent-auth"
							target="_blank"
							rel="noopener noreferrer"
							className="hover:text-foreground/50 transition-colors"
						>
							GitHub
						</Link>
						<span className="text-foreground/15">/</span>
						<Link
							href="https://agent-auth.directory/docs"
							target="_blank"
							rel="noopener noreferrer"
							className="hover:text-foreground/50 transition-colors"
						>
							Docs
						</Link>
					</div>
				</div>
			</footer>
		</div>
	);
}
