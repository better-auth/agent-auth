"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle() {
	const { setTheme, resolvedTheme } = useTheme();
	const [mounted, setMounted] = useState(false);

	useEffect(() => setMounted(true), []);

	return (
		<button
			aria-label="Toggle theme"
			className="relative h-7 w-[52px] rounded-full border border-foreground/[0.06] bg-foreground/[0.06] transition-colors hover:bg-foreground/[0.1] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
			onClick={() => setTheme(resolvedTheme === "light" ? "dark" : "light")}
		>
			<span
				className={`absolute top-0.5 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-foreground/10 transition-transform duration-200 ${
					mounted && resolvedTheme === "dark"
						? "translate-x-[26px]"
						: "translate-x-0.5"
				}`}
			>
				{mounted && resolvedTheme === "dark" ? (
					<svg
						className="text-foreground/70"
						fill="none"
						height="12"
						stroke="currentColor"
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth="2"
						viewBox="0 0 24 24"
						width="12"
					>
						<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
					</svg>
				) : (
					<svg
						className="text-foreground/70"
						fill="none"
						height="12"
						stroke="currentColor"
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth="2"
						viewBox="0 0 24 24"
						width="12"
					>
						<circle cx="12" cy="12" r="5" />
						<path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
					</svg>
				)}
			</span>
		</button>
	);
}
