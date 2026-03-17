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
import { db } from "@/lib/db";
import { provider } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

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

	if (!row) notFound();

	const modes = JSON.parse(row.modes) as string[];
	const approvalMethods = JSON.parse(row.approvalMethods) as string[];
	const algorithms = JSON.parse(row.algorithms) as string[];
	const categories = JSON.parse(row.categories) as string[];
	const endpoints = JSON.parse(row.endpoints) as Record<string, string>;

	return (
		<div className="h-dvh flex flex-col">
			<nav className="shrink-0 flex items-center border-b border-foreground/[0.06]">
				<Link href="/" className="flex items-center gap-2.5 px-5 sm:px-6 py-3">
					<AgentAuthLogo className="h-3.5 w-auto" />
					<p className="select-none font-mono text-xs uppercase tracking-wider text-foreground/70">
						Agent-Auth
					</p>
				</Link>
				<div className="ml-auto flex items-center px-5 sm:px-6">
					<ThemeToggle />
				</div>
			</nav>

			<div className="flex-1 overflow-y-auto px-5 sm:px-6 lg:px-8 py-8 max-w-3xl mx-auto w-full">
				<Link
					href="/providers"
					className="inline-flex items-center gap-1.5 text-[11px] font-mono text-foreground/40 hover:text-foreground/60 transition-colors mb-8"
				>
					<ArrowLeft className="h-3 w-3" />
					All Providers
				</Link>

				<div className="space-y-4 mb-10">
					<div className="flex items-start justify-between gap-4">
						<div>
							<div className="flex items-center gap-2.5">
								<h1 className="text-xl sm:text-2xl font-semibold text-foreground">
									{row.displayName}
								</h1>
								{row.verified ? (
									<CheckCircle className="h-4 w-4 text-success" />
								) : (
									<XCircle className="h-4 w-4 text-foreground/25" />
								)}
							</div>
							<p className="text-xs font-mono text-foreground/40 mt-1">
								{row.name}
							</p>
						</div>
						<a
							href={row.url}
							target="_blank"
							rel="noopener noreferrer"
							className="shrink-0 inline-flex items-center gap-1.5 border border-foreground/[0.12] bg-foreground/[0.04] hover:bg-foreground/[0.08] hover:border-foreground/[0.20] px-3 py-1.5 transition-all text-[11px] font-mono text-foreground/60"
						>
							<ExternalLink className="h-3 w-3" />
							Visit
						</a>
					</div>

					<p className="text-sm text-foreground/55 leading-relaxed">
						{row.description}
					</p>

					{categories.length > 0 && (
						<div className="flex items-center gap-2 flex-wrap">
							{categories.map((cat) => (
								<span
									key={cat}
									className="text-[10px] font-mono text-foreground/40 border border-foreground/[0.08] px-2 py-0.5"
								>
									{cat}
								</span>
							))}
						</div>
					)}
				</div>

				<div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
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

				<div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-10">
					<div>
						<h3 className="text-[11px] font-mono uppercase tracking-wider text-foreground/40 mb-3">
							Modes
						</h3>
						<div className="space-y-2">
							{modes.map((mode) => (
								<div
									key={mode}
									className="flex items-center gap-2 text-xs text-foreground/60 font-mono border border-foreground/[0.06] px-3 py-2"
								>
									<Shield className="h-3 w-3 text-foreground/30" />
									{mode}
								</div>
							))}
						</div>
					</div>
					<div>
						<h3 className="text-[11px] font-mono uppercase tracking-wider text-foreground/40 mb-3">
							Approval Methods
						</h3>
						<div className="space-y-2">
							{approvalMethods.map((method) => (
								<div
									key={method}
									className="flex items-center gap-2 text-xs text-foreground/60 font-mono border border-foreground/[0.06] px-3 py-2"
								>
									<Key className="h-3 w-3 text-foreground/30" />
									{method}
								</div>
							))}
						</div>
					</div>
				</div>

				<div className="mb-10">
					<h3 className="text-[11px] font-mono uppercase tracking-wider text-foreground/40 mb-3">
						Endpoints
					</h3>
					<div className="border border-foreground/[0.06] divide-y divide-foreground/[0.06]">
						{Object.entries(endpoints).map(([key, value]) => (
							<div
								key={key}
								className="flex items-center justify-between px-4 py-2.5 text-xs font-mono"
							>
								<span className="text-foreground/50">{key}</span>
								<span className="text-foreground/30">{value}</span>
							</div>
						))}
					</div>
				</div>

				<div>
					<h3 className="text-[11px] font-mono uppercase tracking-wider text-foreground/40 mb-3">
						Quick Start
					</h3>
					<div className="space-y-3">
						<div className="border border-foreground/[0.06] bg-foreground/[0.02] p-4">
							<p className="text-[10px] font-mono uppercase tracking-wider text-foreground/30 mb-2">
								Discovery
							</p>
							<code className="text-xs font-mono text-foreground/60 block whitespace-pre">
								{`curl ${row.url}/.well-known/agent-configuration`}
							</code>
						</div>
						<div className="border border-foreground/[0.06] bg-foreground/[0.02] p-4">
							<p className="text-[10px] font-mono uppercase tracking-wider text-foreground/30 mb-2">
								Register an Agent
							</p>
							<code className="text-xs font-mono text-foreground/60 block whitespace-pre">
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
		<div className="border border-foreground/[0.06] bg-foreground/[0.02] p-4 space-y-2">
			<div className="flex items-center gap-2 text-foreground/35">
				{icon}
				<span className="text-[10px] font-mono uppercase tracking-wider">
					{label}
				</span>
			</div>
			<p className="text-xs font-mono text-foreground/60 break-all">{value}</p>
		</div>
	);
}
