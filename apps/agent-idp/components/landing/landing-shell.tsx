"use client";

import Link from "next/link";
import { HalftoneBackground } from "@/components/ui/halftone-background";

export function LandingShell() {
	return (
		<div className="relative flex-1 flex items-center justify-center">
			<HalftoneBackground />
			<div className="relative z-10 text-center px-6">
				<h1 className="text-4xl sm:text-5xl font-semibold tracking-tight mb-4">
					Agent Auth
				</h1>
				<p className="text-lg text-muted-foreground max-w-md mx-auto mb-8">
					Identity provider for AI agents. Manage connections, permissions, and
					tool access.
				</p>
				<Link
					href="/sign-in"
					className="inline-flex items-center gap-2 px-6 py-3 bg-foreground text-background hover:opacity-90 transition-opacity font-mono text-sm uppercase tracking-wider"
				>
					Get Started
				</Link>
			</div>
		</div>
	);
}
