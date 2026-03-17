import { CheckCircle, ExternalLink, Shield } from "lucide-react";
import Link from "next/link";

interface ProviderCardProps {
	categories: string[];
	description: string;
	displayName: string;
	modes: string[];
	name: string;
	url: string;
	verified: boolean;
}

export function ProviderCard({
	name,
	displayName,
	description,
	categories,
	verified,
	modes,
	url,
}: ProviderCardProps) {
	const providerPath = `/providers/${encodeURIComponent(name)}`;

	return (
		<Link
			className="group block border border-foreground/[0.08] bg-foreground/[0.02] transition-all hover:border-foreground/[0.14] hover:bg-foreground/[0.04]"
			href={providerPath}
		>
			<div className="space-y-3 p-5">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2">
							<h3 className="truncate font-medium text-foreground text-sm">
								{displayName}
							</h3>
							{verified && (
								<CheckCircle className="h-3.5 w-3.5 shrink-0 text-success" />
							)}
						</div>
						<p className="mt-0.5 font-mono text-[11px] text-foreground/40">
							{name}
						</p>
					</div>
					<ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground/20 transition-colors group-hover:text-foreground/40" />
				</div>

				<p className="line-clamp-2 text-foreground/55 text-xs leading-relaxed">
					{description}
				</p>

				<div className="flex flex-wrap items-center gap-2">
					{modes.map((mode) => (
						<span
							className="inline-flex items-center gap-1 border border-foreground/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-foreground/35"
							key={mode}
						>
							<Shield className="h-2.5 w-2.5" />
							{mode}
						</span>
					))}
					{categories.slice(0, 3).map((cat) => (
						<span
							className="border border-foreground/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-foreground/35"
							key={cat}
						>
							{cat}
						</span>
					))}
				</div>
			</div>

			<div className="border-foreground/[0.06] border-t px-5 py-2.5">
				<span className="block truncate font-mono text-[10px] text-foreground/30">
					{url}
				</span>
			</div>
		</Link>
	);
}
