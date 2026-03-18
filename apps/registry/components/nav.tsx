"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { useSession, signOut } from "@/lib/auth-client";
import { AgentAuthLogo } from "@/components/icons/logo";
import { ThemeToggle } from "@/components/theme-toggle";

function MobileMenu({
	session,
	isPending,
}: {
	session: { user: { name?: string | null; email?: string | null; image?: string | null } } | null;
	isPending: boolean;
}) {
	const [open, setOpen] = useState(false);
	const { setTheme, resolvedTheme } = useTheme();

	useEffect(() => {
		if (open) {
			document.body.style.overflow = "hidden";
			return () => {
				document.body.style.overflow = "";
			};
		}
	}, [open]);

	return (
		<div className="sm:hidden">
			<button
				onClick={() => setOpen((prev) => !prev)}
				className="p-1.5 text-foreground/50 hover:text-foreground/80 transition-colors"
				aria-label={open ? "Close menu" : "Open menu"}
			>
				{open ? (
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
						<line x1="18" y1="6" x2="6" y2="18" />
						<line x1="6" y1="6" x2="18" y2="18" />
					</svg>
				) : (
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
						<line x1="4" y1="8" x2="20" y2="8" />
						<line x1="4" y1="16" x2="20" y2="16" />
					</svg>
				)}
			</button>

			{open && (
				<div className="fixed inset-0 top-[calc(var(--nav-h,45px))] z-50 bg-background border-t border-foreground/[0.06]">
					<div className="flex flex-col p-5 space-y-1">
						<Link
							href="/providers"
							onClick={() => setOpen(false)}
							className="flex items-center gap-2.5 px-3 py-2.5 text-sm font-mono text-foreground/60 hover:text-foreground/90 hover:bg-foreground/[0.04] transition-colors"
						>
							Browse
						</Link>
						<Link
							href="/submit"
							onClick={() => setOpen(false)}
							className="flex items-center gap-2.5 px-3 py-2.5 text-sm font-mono text-foreground/60 hover:text-foreground/90 hover:bg-foreground/[0.04] transition-colors"
						>
							Submit
						</Link>
						{session && (
							<Link
								href="/my-providers"
								onClick={() => setOpen(false)}
								className="flex items-center gap-2.5 px-3 py-2.5 text-sm font-mono text-foreground/60 hover:text-foreground/90 hover:bg-foreground/[0.04] transition-colors"
							>
								My Providers
							</Link>
						)}

						<div className="border-t border-foreground/[0.06] my-2" />

						<button
							onClick={() =>
								setTheme(resolvedTheme === "light" ? "dark" : "light")
							}
							className="flex items-center justify-between px-3 py-2.5 text-sm font-mono text-foreground/60 hover:text-foreground/90 hover:bg-foreground/[0.04] transition-colors"
						>
							<span>Theme</span>
							<span className="text-xs text-foreground/30 capitalize">
								{resolvedTheme}
							</span>
						</button>

						{!isPending && (
							<>
								<div className="border-t border-foreground/[0.06] my-2" />
								{session ? (
									<button
										onClick={() => {
											setOpen(false);
											signOut();
										}}
										className="flex items-center gap-2.5 px-3 py-2.5 text-sm font-mono text-foreground/40 hover:text-red-500/80 transition-colors"
									>
										Sign Out
									</button>
								) : (
								<Link
									href="/sign-in"
									onClick={() => setOpen(false)}
									className="flex items-center gap-2.5 px-3 py-2.5 text-sm font-mono text-foreground/60 hover:text-foreground/90 transition-colors"
								>
									Sign in
								</Link>
								)}
							</>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

function AccountDropdown({
	user,
}: {
	user: { name?: string | null; email?: string | null; image?: string | null };
}) {
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);
	const { setTheme, resolvedTheme } = useTheme();

	useEffect(() => {
		function onClickOutside(e: MouseEvent) {
			if (ref.current && !ref.current.contains(e.target as Node))
				setOpen(false);
		}
		function onEscape(e: KeyboardEvent) {
			if (e.key === "Escape") setOpen(false);
		}
		if (open) {
			document.addEventListener("mousedown", onClickOutside);
			document.addEventListener("keydown", onEscape);
			return () => {
				document.removeEventListener("mousedown", onClickOutside);
				document.removeEventListener("keydown", onEscape);
			};
		}
	}, [open]);

	return (
		<div className="relative" ref={ref}>
			<button
				onClick={() => setOpen((prev) => !prev)}
				className="flex items-center gap-1.5 rounded-full transition-opacity hover:opacity-80"
			>
				{user.image ? (
					<img
						src={user.image}
						alt=""
						className="h-6 w-6 rounded-full border border-foreground/10"
					/>
				) : (
					<div className="h-6 w-6 rounded-full bg-foreground/10 flex items-center justify-center text-[10px] font-mono text-foreground/50">
						{user.name?.[0]?.toUpperCase() ?? "?"}
					</div>
				)}
				<svg
					width="10"
					height="10"
					viewBox="0 0 10 10"
					fill="none"
					className={`text-foreground/30 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
				>
					<path
						d="M2.5 4L5 6.5L7.5 4"
						stroke="currentColor"
						strokeWidth="1.2"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			</button>

			{open && (
				<div className="absolute right-0 top-full mt-2 z-50 min-w-[200px] border border-foreground/[0.08] bg-background shadow-lg shadow-black/[0.08]">
					<div className="px-3.5 py-3 border-b border-foreground/[0.06]">
						{user.name && (
							<p className="text-xs font-medium text-foreground/80 truncate">
								{user.name}
							</p>
						)}
						{user.email && (
							<p className="text-[10px] font-mono text-foreground/35 truncate mt-0.5">
								{user.email}
							</p>
						)}
					</div>

					<div className="py-1">
						<Link
							href="/my-providers"
							onClick={() => setOpen(false)}
							className="flex items-center gap-2.5 px-3.5 py-2 text-[11px] font-mono text-foreground/50 hover:text-foreground/80 hover:bg-foreground/[0.04] transition-colors"
						>
							<svg
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="1.5"
								strokeLinecap="round"
								strokeLinejoin="round"
								className="text-foreground/30"
							>
								<rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
								<path d="M16 3H8l-2 4h12l-2-4z" />
							</svg>
							My Providers
						</Link>
						<Link
							href="/submit"
							onClick={() => setOpen(false)}
							className="flex items-center gap-2.5 px-3.5 py-2 text-[11px] font-mono text-foreground/50 hover:text-foreground/80 hover:bg-foreground/[0.04] transition-colors"
						>
							<svg
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="1.5"
								strokeLinecap="round"
								strokeLinejoin="round"
								className="text-foreground/30"
							>
								<circle cx="12" cy="12" r="10" />
								<line x1="12" y1="8" x2="12" y2="16" />
								<line x1="8" y1="12" x2="16" y2="12" />
							</svg>
							Submit Provider
						</Link>
						<Link
							href="/providers"
							onClick={() => setOpen(false)}
							className="flex items-center gap-2.5 px-3.5 py-2 text-[11px] font-mono text-foreground/50 hover:text-foreground/80 hover:bg-foreground/[0.04] transition-colors"
						>
							<svg
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="1.5"
								strokeLinecap="round"
								strokeLinejoin="round"
								className="text-foreground/30"
							>
								<circle cx="11" cy="11" r="8" />
								<line x1="21" y1="21" x2="16.65" y2="16.65" />
							</svg>
							Browse Registry
						</Link>
					</div>

					<div className="border-t border-foreground/[0.06] py-1">
						<button
							onClick={() =>
								setTheme(resolvedTheme === "light" ? "dark" : "light")
							}
							className="flex items-center justify-between px-3.5 py-2 w-full text-left text-[11px] font-mono text-foreground/50 hover:text-foreground/80 hover:bg-foreground/[0.04] transition-colors"
						>
							<span className="flex items-center gap-2.5">
								<svg
									width="14"
									height="14"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="1.5"
									strokeLinecap="round"
									strokeLinejoin="round"
									className="text-foreground/30"
								>
									{resolvedTheme === "dark" ? (
										<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
									) : (
										<>
											<circle cx="12" cy="12" r="5" />
											<line x1="12" y1="1" x2="12" y2="3" />
											<line x1="12" y1="21" x2="12" y2="23" />
											<line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
											<line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
											<line x1="1" y1="12" x2="3" y2="12" />
											<line x1="21" y1="12" x2="23" y2="12" />
											<line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
											<line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
										</>
									)}
								</svg>
								Theme
							</span>
							<span className="text-[10px] text-foreground/30 capitalize">
								{resolvedTheme}
							</span>
						</button>
					</div>

					<div className="border-t border-foreground/[0.06] py-1">
						<button
							onClick={() => {
								setOpen(false);
								signOut();
							}}
							className="flex items-center gap-2.5 px-3.5 py-2 w-full text-left text-[11px] font-mono text-foreground/40 hover:text-red-500/80 hover:bg-red-500/[0.04] transition-colors"
						>
							<svg
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="1.5"
								strokeLinecap="round"
								strokeLinejoin="round"
								className="text-foreground/30"
							>
								<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
								<polyline points="16 17 21 12 16 7" />
								<line x1="21" y1="12" x2="9" y2="12" />
							</svg>
							Sign Out
						</button>
					</div>
				</div>
			)}
		</div>
	);
}

export function Nav() {
	const { data: session, isPending } = useSession();

	return (
		<nav className="shrink-0 flex items-center border-b border-foreground/[0.06]" style={{ "--nav-h": "45px" } as React.CSSProperties}>
			<Link href="/" className="flex items-center gap-2 sm:gap-2.5 px-4 sm:px-6 py-3 min-w-0">
				<AgentAuthLogo className="h-3 w-auto shrink-0" />
				<p className="select-none font-mono text-xs uppercase tracking-wider text-foreground/70">
					Agent-Auth
				</p>
				<span className="text-foreground/20 text-[10px] font-mono">/</span>
				<p className="select-none font-mono text-[10px] uppercase tracking-wider text-foreground/40">
					Registry
				</p>
			</Link>

			<div className="ml-auto flex items-center gap-2 px-4 sm:px-6">
				<div className="hidden sm:flex items-center gap-2">
					<Link
						href="/providers"
						className="text-[11px] font-mono text-foreground/45 hover:text-foreground/70 transition-colors"
					>
						Browse
					</Link>
					<span className="text-foreground/15 text-[10px] select-none">/</span>
					<Link
						href="/submit"
						className="text-[11px] font-mono text-foreground/45 hover:text-foreground/70 transition-colors"
					>
						Submit
					</Link>
					{!session && (
						<>
							<span className="text-foreground/15 text-[10px] select-none ml-2">
								|
							</span>
							<ThemeToggle />
						</>
					)}
					<span className="text-foreground/15 text-[10px] select-none ml-2">
						|
					</span>

				{isPending ? (
					<div className="h-6 w-6 rounded-full bg-foreground/[0.06] animate-pulse" />
				) : session ? (
					<AccountDropdown user={session.user} />
				) : (
					<Link
						href="/sign-in"
						className="flex items-center gap-1.5 text-[11px] font-mono text-foreground/45 hover:text-foreground/70 transition-colors"
					>
						Sign in
					</Link>
				)}
				</div>

				<MobileMenu session={session} isPending={isPending} />
			</div>
		</nav>
	);
}
