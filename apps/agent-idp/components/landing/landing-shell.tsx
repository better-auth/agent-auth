"use client";

import { useRef, useEffect } from "react";
import { HalftoneBackground } from "@/components/ui/halftone-background";
import { LandingHero } from "@/components/landing/hero";
import { LandingReadme } from "@/components/landing/readme";
import { LandingFooter } from "@/components/landing/footer";

export type ProductView = "plugin" | "gateway";

export function LandingShell() {
	const activeProduct: ProductView = "gateway";
	const scrollRef = useRef<HTMLDivElement>(null);
	const heroInnerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const scrollEl = scrollRef.current;
		const innerEl = heroInnerRef.current;
		if (!scrollEl || !innerEl) return;

		const faders = Array.from(
			innerEl.querySelectorAll("[data-hero-fade]"),
		) as HTMLElement[];

		let prevT = -1;
		const PARALLAX_PX = 200;

		const onScroll = () => {
			const scrollTop = scrollEl.scrollTop;
			const t = Math.min(scrollTop / PARALLAX_PX, 1);

			if (Math.abs(t - prevT) < 0.001) return;
			prevT = t;

			const yOffset = scrollTop * 0.35;
			const scale = 1 - t * 0.04;
			const opacity = 1 - t * 0.7;

			innerEl.style.transform = `translateY(${yOffset}px) scale(${scale})`;
			innerEl.style.opacity = String(Math.max(opacity, 0));

			const fadeT = Math.min(t * 2.5, 1);
			for (const el of faders) {
				el.style.opacity = String(1 - fadeT);
			}
		};

		scrollEl.addEventListener("scroll", onScroll, { passive: true });
		return () => scrollEl.removeEventListener("scroll", onScroll);
	}, []);

	return (
		<div
			ref={scrollRef}
			className="relative flex-1 overflow-y-auto min-h-0"
		>
			{/* Hero */}
			<div className="relative overflow-hidden py-10 sm:py-14 lg:py-20">
				<HalftoneBackground />

				{/* Grid overlay */}
				<div
					className="absolute inset-0 z-1 pointer-events-none select-none"
					aria-hidden="true"
					style={{
						backgroundImage: `
							linear-gradient(to right, var(--foreground) 1px, transparent 1px),
							linear-gradient(to bottom, var(--foreground) 1px, transparent 1px)
						`,
						backgroundSize: "60px 60px",
						opacity: 0.04,
						maskImage: "radial-gradient(ellipse 70% 60% at 50% 50%, black 20%, transparent 70%)",
						WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 50% 50%, black 20%, transparent 70%)",
					}}
				/>

				{/* Scan lines */}
				<div
					className="absolute inset-0 z-1 pointer-events-none select-none"
					aria-hidden="true"
					style={{
						background: "linear-gradient(to bottom, transparent 0%, var(--foreground) 50%, transparent 100%)",
						backgroundSize: "100% 3px",
						backgroundRepeat: "repeat",
						opacity: 0.015,
					}}
				/>

				{/* Glow orbs */}
				<div
					className="absolute -top-20 -right-20 w-[400px] h-[400px] z-1 pointer-events-none select-none rounded-full"
					aria-hidden="true"
					style={{
						background: "radial-gradient(circle, var(--foreground) 0%, transparent 70%)",
						opacity: 0.035,
						filter: "blur(60px)",
					}}
				/>
				<div
					className="absolute -bottom-32 -left-32 w-[500px] h-[500px] z-1 pointer-events-none select-none rounded-full"
					aria-hidden="true"
					style={{
						background: "radial-gradient(circle, var(--foreground) 0%, transparent 70%)",
						opacity: 0.03,
						filter: "blur(80px)",
					}}
				/>

				{/* Corner marks */}
				<div className="absolute inset-0 z-1 pointer-events-none select-none overflow-hidden" aria-hidden="true">
					<svg className="absolute top-3 left-3 sm:top-4 sm:left-4 text-foreground/25" width="20" height="20" viewBox="0 0 20 20" fill="none">
						<path d="M0 8V0H8" stroke="currentColor" strokeWidth="1" />
					</svg>
					<svg className="absolute top-3 right-3 sm:top-4 sm:right-4 text-foreground/25" width="20" height="20" viewBox="0 0 20 20" fill="none">
						<path d="M20 8V0H12" stroke="currentColor" strokeWidth="1" />
					</svg>
					<svg className="absolute bottom-3 left-3 sm:bottom-4 sm:left-4 text-foreground/25" width="20" height="20" viewBox="0 0 20 20" fill="none">
						<path d="M0 12V20H8" stroke="currentColor" strokeWidth="1" />
					</svg>
					<svg className="absolute bottom-3 right-3 sm:bottom-4 sm:right-4 text-foreground/25" width="20" height="20" viewBox="0 0 20 20" fill="none">
						<path d="M20 12V20H12" stroke="currentColor" strokeWidth="1" />
					</svg>
					<span className="absolute top-3.5 left-8 sm:top-5 sm:left-9 text-[7px] sm:text-[8px] font-mono text-foreground/22 tracking-[0.2em] uppercase">
						agent.auth
					</span>
					<span className="absolute bottom-3.5 right-8 sm:bottom-5 sm:right-9 text-[7px] sm:text-[8px] font-mono text-foreground/22 tracking-[0.2em] uppercase">
						v1.0
					</span>
				</div>

				<div
					ref={heroInnerRef}
					className="relative z-10 px-5 sm:px-6 lg:px-8"
					style={{ transformOrigin: "center center", willChange: "transform, opacity" }}
				>
					<LandingHero activeProduct={activeProduct} />
				</div>

				{/* Bottom border */}
				<div
					className="absolute bottom-0 left-0 right-0 h-px"
					style={{
						background: "linear-gradient(to right, transparent 0%, var(--foreground) 30%, var(--foreground) 70%, transparent 100%)",
						opacity: 0.12,
					}}
				/>
			</div>

			{/* Content */}
			<div className="relative">
				<div
					className="absolute inset-0 pointer-events-none select-none"
					aria-hidden="true"
					style={{
						backgroundImage: `
							linear-gradient(to right, var(--foreground) 1px, transparent 1px),
							linear-gradient(to bottom, var(--foreground) 1px, transparent 1px)
						`,
						backgroundSize: "80px 80px",
						opacity: 0.018,
						maskImage: "linear-gradient(to bottom, black 0%, transparent 40%)",
						WebkitMaskImage: "linear-gradient(to bottom, black 0%, transparent 40%)",
					}}
				/>
				<LandingReadme activeProduct={activeProduct} />
				<LandingFooter />
			</div>

			{/* Bottom smoke */}
			<div
				className="pointer-events-none sticky bottom-0 left-0 right-0 h-24 sm:h-32 lg:h-40 z-10 -mt-24 sm:-mt-32 lg:-mt-40"
				style={{
					background: "linear-gradient(to top, var(--background) 0%, transparent 100%)",
				}}
			/>
		</div>
	);
}
