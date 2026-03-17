import { eq } from "drizzle-orm";
import Link from "next/link";
import { AgentAuthLogo } from "@/components/icons/logo";
import { ProviderCard } from "@/components/provider-card";
import { SearchBar } from "@/components/search-bar";
import { ThemeToggle } from "@/components/theme-toggle";
import { db } from "@/lib/db/index";
import { provider } from "@/lib/db/schema";

export default async function LandingPage() {
	const providers = await db
		.select()
		.from(provider)
		.where(eq(provider.status, "active"))
		.limit(12);

	return (
		<div className="flex min-h-dvh flex-col">
			<nav className="flex shrink-0 items-center border-foreground/[0.06] border-b">
				<Link className="flex items-center gap-2.5 px-5 py-3 sm:px-6" href="/">
					<AgentAuthLogo className="h-3 w-auto" />
					<p className="select-none font-mono text-foreground/70 text-xs uppercase tracking-wider">
						Agent-Auth
					</p>
					<span className="font-mono text-[10px] text-foreground/20">/</span>
					<p className="select-none font-mono text-[10px] text-foreground/40 uppercase tracking-wider">
						Registry
					</p>
				</Link>
				<div className="ml-auto flex items-center gap-2 px-5 sm:px-6">
					<Link
						className="font-mono text-[11px] text-foreground/45 transition-colors hover:text-foreground/70"
						href="/providers"
					>
						Browse
					</Link>
					<span className="select-none text-[10px] text-foreground/15">/</span>
					<Link
						className="font-mono text-[11px] text-foreground/45 transition-colors hover:text-foreground/70"
						href="/submit"
					>
						Submit
					</Link>
					<span className="ml-2 select-none text-[10px] text-foreground/15">
						|
					</span>
					<ThemeToggle />
				</div>
			</nav>

			<div className="relative overflow-hidden">
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-0 select-none"
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
					aria-hidden="true"
					className="pointer-events-none absolute -top-20 left-1/2 h-[300px] w-[600px] -translate-x-1/2 select-none rounded-full"
					style={{
						background:
							"radial-gradient(circle, var(--foreground) 0%, transparent 70%)",
						opacity: 0.03,
						filter: "blur(60px)",
					}}
				/>

				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-0 select-none overflow-hidden"
				>
					<svg
						className="absolute top-3 left-3 text-foreground/20 sm:top-4 sm:left-4"
						fill="none"
						height="16"
						viewBox="0 0 20 20"
						width="16"
					>
						<path d="M0 8V0H8" stroke="currentColor" strokeWidth="1" />
					</svg>
					<svg
						className="absolute top-3 right-3 text-foreground/20 sm:top-4 sm:right-4"
						fill="none"
						height="16"
						viewBox="0 0 20 20"
						width="16"
					>
						<path d="M20 8V0H12" stroke="currentColor" strokeWidth="1" />
					</svg>
					<span className="absolute top-3.5 left-8 font-mono text-[7px] text-foreground/15 uppercase tracking-[0.2em] sm:top-5 sm:left-9">
						agent-auth.directory
					</span>
				</div>

				<div className="relative z-10 mx-auto flex max-w-2xl flex-col items-center space-y-6 px-5 py-16 text-center sm:px-6 sm:py-20 lg:px-8 lg:py-28">
					<div className="space-y-3">
						<h1 className="font-semibold text-2xl text-foreground leading-tight tracking-tight sm:text-3xl md:text-4xl lg:text-5xl">
							Agent Registry
						</h1>
						<p className="mx-auto max-w-md text-foreground/50 text-sm leading-relaxed sm:text-base">
							Discover Agent Auth-capable services by intent. The searchable
							index for AI agent infrastructure.
						</p>
					</div>

					<div className="w-full max-w-lg">
						<SearchBar autoFocus size="large" />
					</div>

					<div className="flex items-center gap-4 font-mono text-[10px] text-foreground/30">
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
					className="absolute right-0 bottom-0 left-0 h-px"
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
						aria-hidden="true"
						className="pointer-events-none absolute inset-0 select-none"
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

					<div className="relative px-5 py-10 sm:px-6 sm:py-14 lg:px-8">
						<div className="mb-6 flex items-center justify-between">
							<h2 className="font-mono text-[11px] text-foreground/40 uppercase tracking-wider">
								Registered Providers
							</h2>
							<Link
								className="font-mono text-[11px] text-foreground/35 transition-colors hover:text-foreground/60"
								href="/providers"
							>
								View all →
							</Link>
						</div>

						<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
							{providers.map((p) => (
								<ProviderCard
									categories={JSON.parse(p.categories) as string[]}
									description={p.description}
									displayName={p.displayName}
									key={p.id}
									modes={JSON.parse(p.modes) as string[]}
									name={p.name}
									url={p.url}
									verified={p.verified}
								/>
							))}
						</div>
					</div>
				</div>
			)}

			{providers.length === 0 && (
				<div className="flex flex-1 flex-col items-center justify-center px-5 py-20 text-center">
					<div className="space-y-3">
						<p className="text-foreground/40 text-sm">
							No providers registered yet.
						</p>
						<Link
							className="inline-flex items-center gap-2 border border-foreground/[0.12] bg-foreground/[0.04] px-4 py-2 font-mono text-foreground/60 text-xs transition-all hover:border-foreground/[0.20] hover:bg-foreground/[0.08]"
							href="/submit"
						>
							Submit the first provider
						</Link>
						<p className="pt-2 font-mono text-[10px] text-foreground/25">
							Or seed the database: GET /api/seed
						</p>
					</div>
				</div>
			)}

			<footer className="border-foreground/[0.06] border-t px-5 py-5 sm:px-6">
				<div className="flex items-center justify-between">
					<span className="font-mono text-[10px] text-foreground/30">
						AGENT-AUTH — Registry
					</span>
					<div className="flex items-center gap-3 font-mono text-[10px] text-foreground/30">
						<Link
							className="transition-colors hover:text-foreground/50"
							href="https://github.com/agent-auth"
							rel="noopener noreferrer"
							target="_blank"
						>
							GitHub
						</Link>
						<span className="text-foreground/15">/</span>
						<Link
							className="transition-colors hover:text-foreground/50"
							href="https://agent-auth.directory/docs"
							rel="noopener noreferrer"
							target="_blank"
						>
							Docs
						</Link>
					</div>
				</div>
			</footer>
		</div>
	);
}
