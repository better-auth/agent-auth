"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AgentAuthLogo } from "@/components/icons/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { useSession } from "@/lib/auth-client";

const CAPABILITIES = [
	{
		name: "sites.create",
		label: "Deploy",
		description: "Create a new HTML site with a unique URL in seconds",
	},
	{
		name: "sites.update",
		label: "Update",
		description: "Push new HTML content to an existing deployment",
	},
	{
		name: "sites.list",
		label: "List",
		description: "Enumerate all sites owned by the authenticated user",
	},
	{
		name: "sites.get",
		label: "Read",
		description: "Fetch full site details including HTML content",
	},
	{
		name: "sites.delete",
		label: "Remove",
		description: "Permanently delete a site and free its URL slug",
	},
];

const CODE_EXAMPLE = `import { AgentAuthClient } from "@auth/agent"

const client = new AgentAuthClient({ storage })
const provider = await client.discoverProvider(
  "http://localhost:3100"
)

const agent = await client.connectAgent({
  provider: "http://localhost:3100",
  capabilities: ["sites.create", "sites.list"],
})

const result = await client.executeCapability({
  agentId: agent.agent_id,
  capability: "sites.create",
  arguments: {
    name: "My Landing Page",
    html: "<h1>Hello from an AI agent!</h1>",
  },
})`;

export default function LandingPage() {
	const router = useRouter();
	const { data: session, isPending } = useSession();

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

	return (
		<div className="min-h-dvh">
			{/* Nav */}
			<nav className="flex items-center justify-between border-foreground/[0.06] border-b px-5 py-3 sm:px-6">
				<div className="flex items-center gap-3">
					<AgentAuthLogo className="h-4 w-auto" />
					<span className="font-mono text-[11px] text-foreground/40 uppercase tracking-wider">
						Deploy
					</span>
				</div>
				<div className="flex items-center gap-4">
					<Link
						className="font-mono text-[11px] text-foreground/45 transition-colors hover:text-foreground/70"
						href="/sign-in"
					>
						Sign in
					</Link>
					<Link
						className="inline-flex items-center bg-foreground px-3 py-1.5 font-mono text-[11px] text-background transition-opacity hover:opacity-90"
						href="/sign-up"
					>
						Get Started
					</Link>
					<ThemeToggle />
				</div>
			</nav>

			{/* Hero */}
			<section className="relative px-5 pt-20 pb-16 sm:px-6 sm:pt-28 sm:pb-20 lg:px-8">
				{/* Grid background */}
				<div className="pointer-events-none absolute inset-0 overflow-hidden">
					<div
						className="absolute inset-0 bg-grid text-foreground opacity-[0.03]"
						style={{
							maskImage:
								"radial-gradient(ellipse 70% 50% at 50% 0%, black 30%, transparent 100%)",
							WebkitMaskImage:
								"radial-gradient(ellipse 70% 50% at 50% 0%, black 30%, transparent 100%)",
						}}
					/>
					<div className="absolute top-0 left-1/2 h-[400px] w-[600px] -translate-x-1/2 rounded-full bg-foreground/[0.02] blur-[100px]" />
				</div>

				<div className="relative mx-auto max-w-3xl space-y-6 text-center">
					<div className="inline-flex items-center gap-2 border border-foreground/[0.08] bg-foreground/[0.02] px-3 py-1 font-mono text-[10px] text-foreground/40 uppercase tracking-wider">
						<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
						Agent Auth Protocol
					</div>

					<h1 className="font-semibold text-3xl leading-[1.1] tracking-tight sm:text-5xl">
						Deploy HTML sites
						<br />
						<span className="text-foreground/40">with AI agents</span>
					</h1>

					<p className="mx-auto max-w-lg text-foreground/50 text-sm leading-relaxed sm:text-base">
						A deployment platform powered by the Agent Auth Protocol. Deploy
						from the dashboard or let AI agents create, update, and manage your
						sites autonomously.
					</p>

					<div className="flex items-center justify-center gap-3 pt-2">
						<Link
							className="inline-flex items-center bg-foreground px-5 py-2.5 font-mono text-background text-xs transition-opacity hover:opacity-90"
							href="/sign-up"
						>
							Start Deploying
						</Link>
						<Link
							className="inline-flex items-center border border-foreground/[0.12] bg-foreground/[0.04] px-5 py-2.5 font-mono text-xs transition-colors hover:border-foreground/[0.20] hover:bg-foreground/[0.08]"
							href="/sign-in"
						>
							Sign In
						</Link>
					</div>
				</div>
			</section>

			{/* Capabilities */}
			<section className="border-foreground/[0.06] border-t px-5 py-16 sm:px-6 lg:px-8">
				<div className="mx-auto max-w-4xl">
					<div className="mb-10">
						<span className="font-mono text-[10px] text-foreground/35 uppercase tracking-wider">
							Agent Capabilities
						</span>
						<h2 className="mt-2 font-semibold text-xl tracking-tight">
							Five operations, full control
						</h2>
						<p className="mt-2 max-w-md text-foreground/45 text-sm">
							Every capability is scoped, auditable, and requires explicit user
							approval before an AI agent can use it.
						</p>
					</div>

					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{CAPABILITIES.map((cap) => (
							<div
								className="group space-y-3 border border-foreground/[0.08] bg-foreground/[0.02] p-5 transition-colors hover:border-foreground/[0.14] hover:bg-foreground/[0.04]"
								key={cap.name}
							>
								<div className="flex items-center justify-between">
									<span className="font-medium font-mono text-xs">
										{cap.label}
									</span>
									<span className="border border-foreground/[0.06] px-1.5 py-0.5 font-mono text-[9px] text-foreground/30">
										{cap.name}
									</span>
								</div>
								<p className="text-[13px] text-foreground/50 leading-relaxed">
									{cap.description}
								</p>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* Code Example */}
			<section className="border-foreground/[0.06] border-t px-5 py-16 sm:px-6 lg:px-8">
				<div className="mx-auto max-w-4xl">
					<div className="mb-10">
						<span className="font-mono text-[10px] text-foreground/35 uppercase tracking-wider">
							SDK Integration
						</span>
						<h2 className="mt-2 font-semibold text-xl tracking-tight">
							Deploy from any AI agent
						</h2>
						<p className="mt-2 max-w-md text-foreground/45 text-sm">
							Use the Agent Auth SDK to discover, connect, and execute
							deployment capabilities programmatically.
						</p>
					</div>

					<div className="overflow-hidden border border-foreground/[0.08] bg-foreground/[0.02]">
						<div className="flex items-center gap-2 border-foreground/[0.06] border-b px-4 py-2.5">
							<div className="h-2 w-2 rounded-full bg-foreground/10" />
							<div className="h-2 w-2 rounded-full bg-foreground/10" />
							<div className="h-2 w-2 rounded-full bg-foreground/10" />
							<span className="ml-2 font-mono text-[10px] text-foreground/30">
								deploy.ts
							</span>
						</div>
						<pre className="overflow-x-auto p-5 font-mono text-[12px] text-foreground/70 leading-[1.7]">
							<code>{CODE_EXAMPLE}</code>
						</pre>
					</div>
				</div>
			</section>

			{/* How it works */}
			<section className="border-foreground/[0.06] border-t px-5 py-16 sm:px-6 lg:px-8">
				<div className="mx-auto max-w-4xl">
					<div className="mb-10">
						<span className="font-mono text-[10px] text-foreground/35 uppercase tracking-wider">
							How It Works
						</span>
						<h2 className="mt-2 font-semibold text-xl tracking-tight">
							Three modes of deployment
						</h2>
					</div>

					<div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
						{[
							{
								step: "01",
								title: "Dashboard",
								desc: "Sign in with email and password. Create, edit, and manage your HTML sites directly in the browser.",
							},
							{
								step: "02",
								title: "Delegated Agent",
								desc: "An AI agent connects on your behalf. You approve which capabilities it can use, then it deploys for you.",
							},
							{
								step: "03",
								title: "Autonomous Agent",
								desc: "An agent registers without a user account, deploys sites independently, and transfers them when you claim the host.",
							},
						].map((item) => (
							<div className="space-y-3" key={item.step}>
								<span className="font-mono text-[10px] text-foreground/25">
									{item.step}
								</span>
								<h3 className="font-medium text-sm">{item.title}</h3>
								<p className="text-[13px] text-foreground/45 leading-relaxed">
									{item.desc}
								</p>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* Footer */}
			<footer className="border-foreground/[0.06] border-t px-5 py-6 sm:px-6">
				<div className="mx-auto flex max-w-4xl items-center justify-between">
					<div className="flex items-center gap-3">
						<AgentAuthLogo className="h-3 w-auto opacity-30" />
						<span className="font-mono text-[10px] text-foreground/25">
							Agent Deploy Demo
						</span>
					</div>
					<div className="flex items-center gap-4">
						<a
							className="font-mono text-[10px] text-foreground/30 transition-colors hover:text-foreground/50"
							href="https://github.com/nicepkg/agent-auth"
							rel="noopener noreferrer"
							target="_blank"
						>
							GitHub
						</a>
						<a
							className="font-mono text-[10px] text-foreground/30 transition-colors hover:text-foreground/50"
							href="https://agent-auth.better-auth.com"
							rel="noopener noreferrer"
							target="_blank"
						>
							Docs
						</a>
					</div>
				</div>
			</footer>
		</div>
	);
}
