"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Copy, Check } from "lucide-react";
import type { ProductView } from "@/components/landing/landing-shell";

const heroContent = {
	plugin: {
		title: "Agent Auth",
		subtitle:
			"Identity, permissions, and sessions for AI agents. Scoped access, signed requests, and full audit trails.",
	},
	gateway: {
		title: "Agent Auth IDP",
		subtitle:
			"One place to manage every AI agent you run. Connect your providers once, control access, and see everything your agents do.",
	},
};

export function LandingHero({
	activeProduct,
}: {
	activeProduct: ProductView;
}) {
	const content = heroContent[activeProduct];
	const [copied, setCopied] = useState(false);

	const handleCopy = () => {
		navigator.clipboard.writeText("npx auth ai");
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<div className="relative w-full flex flex-col items-center text-center pointer-events-none z-10">
			<div className="space-y-3 sm:space-y-4">
				<AnimatePresence mode="wait">
					<motion.h1
						key={activeProduct}
						initial={{ opacity: 0, y: 6 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -6 }}
						transition={{ duration: 0.25, ease: "easeOut" }}
						className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl text-foreground leading-tight font-semibold tracking-tight"
					>
						{content.title}
					</motion.h1>
				</AnimatePresence>

				<AnimatePresence mode="wait">
					<motion.p
						key={activeProduct}
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{
							duration: 0.2,
							delay: 0.05,
							ease: "easeOut",
						}}
						data-hero-fade
						className="text-sm sm:text-base lg:text-lg text-foreground/60 max-w-lg mx-auto leading-relaxed overflow-hidden"
					>
						{content.subtitle}
					</motion.p>
				</AnimatePresence>

				<motion.div
					initial={{ opacity: 0, y: 8 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{
						duration: 0.3,
						delay: 0.15,
						ease: "easeOut",
					}}
					data-hero-fade
					className="pt-2 sm:pt-3"
				>
					<button
						onClick={handleCopy}
						type="button"
						className="pointer-events-auto group inline-flex items-center gap-2.5 border border-foreground/[0.12] bg-foreground/[0.04] hover:bg-foreground/[0.08] hover:border-foreground/[0.20] px-4 py-2 transition-all cursor-pointer"
					>
					<span className="text-[11px] sm:text-xs font-mono text-foreground/40 select-none">
						$
					</span>
					<code className="text-[11px] sm:text-xs font-mono text-foreground/70 group-hover:text-foreground/85 transition-colors tracking-wide">
						npx auth ai
					</code>
					<span className="text-foreground/35 group-hover:text-foreground/55 transition-colors ml-1">
							{copied ? (
								<Check className="h-3 w-3 text-emerald-500" />
							) : (
								<Copy className="h-3 w-3" />
							)}
						</span>
					</button>
				</motion.div>
			</div>
		</div>
	);
}
