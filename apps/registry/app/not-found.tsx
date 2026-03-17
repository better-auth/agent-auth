import Link from "next/link";

export default function NotFound() {
	return (
		<div className="min-h-dvh flex flex-col items-center justify-center px-5 text-center">
			<div className="relative">
				<div
					className="absolute inset-0 pointer-events-none select-none -m-32"
					aria-hidden="true"
					style={{
						backgroundImage: `
							linear-gradient(to right, var(--foreground) 1px, transparent 1px),
							linear-gradient(to bottom, var(--foreground) 1px, transparent 1px)
						`,
						backgroundSize: "40px 40px",
						opacity: 0.03,
						maskImage:
							"radial-gradient(ellipse 60% 60% at 50% 50%, black 10%, transparent 70%)",
						WebkitMaskImage:
							"radial-gradient(ellipse 60% 60% at 50% 50%, black 10%, transparent 70%)",
					}}
				/>

				<div className="relative space-y-6">
					<div className="space-y-2">
						<p className="text-[11px] font-mono uppercase tracking-[0.3em] text-foreground/30">
							404
						</p>
						<h1 className="text-2xl sm:text-3xl font-semibold text-foreground tracking-tight">
							Page not found
						</h1>
						<p className="text-sm text-foreground/40 max-w-sm mx-auto leading-relaxed">
							The resource you're looking for doesn't exist or has been moved.
						</p>
					</div>

					<div className="flex items-center justify-center gap-3">
						<Link
							href="/"
							className="border border-foreground/[0.12] bg-foreground/[0.04] hover:bg-foreground/[0.08] hover:border-foreground/[0.20] px-4 py-2 transition-all text-xs font-mono text-foreground/60"
						>
							Home
						</Link>
						<Link
							href="/providers"
							className="border border-foreground/[0.12] bg-foreground/[0.04] hover:bg-foreground/[0.08] hover:border-foreground/[0.20] px-4 py-2 transition-all text-xs font-mono text-foreground/60"
						>
							Browse Providers
						</Link>
					</div>

					<p className="text-[10px] font-mono text-foreground/20">
						AGENT-AUTH — Registry
					</p>
				</div>
			</div>
		</div>
	);
}
