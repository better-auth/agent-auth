import { eq } from "drizzle-orm";
import {
	ArrowLeft,
	CheckCircle,
	Clock,
	ExternalLink,
	Globe,
	Key,
	Shield,
	XCircle,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AgentAuthLogo } from "@/components/icons/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { db } from "@/lib/db/index";
import { provider } from "@/lib/db/schema";

export default async function ProviderDetailPage({
	params,
}: {
	params: Promise<{ name: string }>;
}) {
	const { name: encodedName } = await params;
	const name = decodeURIComponent(encodedName);

	const [row] = await db
		.select()
		.from(provider)
		.where(eq(provider.name, name))
		.limit(1);

	if (!row) {
		notFound();
	}

	const modes = JSON.parse(row.modes) as string[];
	const approvalMethods = JSON.parse(row.approvalMethods) as string[];
	const algorithms = JSON.parse(row.algorithms) as string[];
	const categories = JSON.parse(row.categories) as string[];
	const endpoints = JSON.parse(row.endpoints) as Record<string, string>;

	return (
		<div className="flex h-dvh flex-col">
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

			<div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-5 py-8 sm:px-6 lg:px-8">
				<Link
					className="mb-8 inline-flex items-center gap-1.5 font-mono text-[11px] text-foreground/40 transition-colors hover:text-foreground/60"
					href="/providers"
				>
					<ArrowLeft className="h-3 w-3" />
					All Providers
				</Link>

				<div className="mb-10 space-y-4">
					<div className="flex items-start justify-between gap-4">
						<div>
							<div className="flex items-center gap-2.5">
								<h1 className="font-semibold text-foreground text-xl sm:text-2xl">
									{row.displayName}
								</h1>
								{row.verified ? (
									<CheckCircle className="h-4 w-4 text-success" />
								) : (
									<XCircle className="h-4 w-4 text-foreground/25" />
								)}
							</div>
							<p className="mt-1 font-mono text-foreground/40 text-xs">
								{row.name}
							</p>
						</div>
						<a
							className="inline-flex shrink-0 items-center gap-1.5 border border-foreground/[0.12] bg-foreground/[0.04] px-3 py-1.5 font-mono text-[11px] text-foreground/60 transition-all hover:border-foreground/[0.20] hover:bg-foreground/[0.08]"
							href={row.url}
							rel="noopener noreferrer"
							target="_blank"
						>
							<ExternalLink className="h-3 w-3" />
							Visit
						</a>
					</div>

					<p className="text-foreground/55 text-sm leading-relaxed">
						{row.description}
					</p>

					{categories.length > 0 && (
						<div className="flex flex-wrap items-center gap-2">
							{categories.map((cat) => (
								<span
									className="border border-foreground/[0.08] px-2 py-0.5 font-mono text-[10px] text-foreground/40"
									key={cat}
								>
									{cat}
								</span>
							))}
						</div>
					)}
				</div>

				<div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
					<InfoCard
						icon={<Globe className="h-3.5 w-3.5" />}
						label="Issuer"
						value={row.issuer}
					/>
					<InfoCard
						icon={<Shield className="h-3.5 w-3.5" />}
						label="Protocol"
						value={row.version}
					/>
					<InfoCard
						icon={<Key className="h-3.5 w-3.5" />}
						label="Algorithms"
						value={algorithms.join(", ")}
					/>
					<InfoCard
						icon={<Clock className="h-3.5 w-3.5" />}
						label="Last Verified"
						value={
							row.lastCheckedAt
								? new Date(row.lastCheckedAt).toLocaleDateString()
								: "Never"
						}
					/>
				</div>

				<div className="mb-10 grid grid-cols-1 gap-6 sm:grid-cols-2">
					<div>
						<h3 className="mb-3 font-mono text-[11px] text-foreground/40 uppercase tracking-wider">
							Modes
						</h3>
						<div className="space-y-2">
							{modes.map((mode) => (
								<div
									className="flex items-center gap-2 border border-foreground/[0.06] px-3 py-2 font-mono text-foreground/60 text-xs"
									key={mode}
								>
									<Shield className="h-3 w-3 text-foreground/30" />
									{mode}
								</div>
							))}
						</div>
					</div>
					<div>
						<h3 className="mb-3 font-mono text-[11px] text-foreground/40 uppercase tracking-wider">
							Approval Methods
						</h3>
						<div className="space-y-2">
							{approvalMethods.map((method) => (
								<div
									className="flex items-center gap-2 border border-foreground/[0.06] px-3 py-2 font-mono text-foreground/60 text-xs"
									key={method}
								>
									<Key className="h-3 w-3 text-foreground/30" />
									{method}
								</div>
							))}
						</div>
					</div>
				</div>

				<div className="mb-10">
					<h3 className="mb-3 font-mono text-[11px] text-foreground/40 uppercase tracking-wider">
						Endpoints
					</h3>
					<div className="divide-y divide-foreground/[0.06] border border-foreground/[0.06]">
						{Object.entries(endpoints).map(([key, value]) => (
							<div
								className="flex items-center justify-between px-4 py-2.5 font-mono text-xs"
								key={key}
							>
								<span className="text-foreground/50">{key}</span>
								<span className="text-foreground/30">{value}</span>
							</div>
						))}
					</div>
				</div>

				<div>
					<h3 className="mb-3 font-mono text-[11px] text-foreground/40 uppercase tracking-wider">
						Quick Start
					</h3>
					<div className="space-y-3">
						<div className="border border-foreground/[0.06] bg-foreground/[0.02] p-4">
							<p className="mb-2 font-mono text-[10px] text-foreground/30 uppercase tracking-wider">
								Discovery
							</p>
							<code className="block whitespace-pre font-mono text-foreground/60 text-xs">
								{`curl ${row.url}/.well-known/agent-configuration`}
							</code>
						</div>
						<div className="border border-foreground/[0.06] bg-foreground/[0.02] p-4">
							<p className="mb-2 font-mono text-[10px] text-foreground/30 uppercase tracking-wider">
								Register an Agent
							</p>
							<code className="block whitespace-pre font-mono text-foreground/60 text-xs">
								{`curl -X POST ${row.url}${endpoints.register} \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "my-agent",
    "public_key": "<your-ed25519-public-key>",
    "mode": "${modes[0] ?? "delegated"}"
  }'`}
							</code>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

function InfoCard({
	icon,
	label,
	value,
}: {
	icon: React.ReactNode;
	label: string;
	value: string;
}) {
	return (
		<div className="space-y-2 border border-foreground/[0.06] bg-foreground/[0.02] p-4">
			<div className="flex items-center gap-2 text-foreground/35">
				{icon}
				<span className="font-mono text-[10px] uppercase tracking-wider">
					{label}
				</span>
			</div>
			<p className="break-all font-mono text-foreground/60 text-xs">{value}</p>
		</div>
	);
}
