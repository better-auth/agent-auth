"use client";

import { signOut, useSession } from "@/lib/auth-client";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";

function OnePasswordLogo({ className }: { className?: string }) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
			<path d="M12 1C5.92 1 1 5.92 1 12s4.92 11 11 11s11-4.92 11-11S18.08 1 12 1m0 19a8 8 0 0 1-8-8a8 8 0 0 1 8-8a8 8 0 0 1 8 8a8 8 0 0 1-8 8m1-6.5c0 .63.4 1.2 1 1.41V18h-4v-6.09c.78-.27 1.19-1.11.93-1.91a1.5 1.5 0 0 0-.93-.91V6h4v6.09c-.6.21-1 .78-1 1.41" />
		</svg>
	);
}

const navItems = [
	{ label: "Overview", href: "/dashboard" },
	{ label: "Agents", href: "/dashboard/agents" },
	{ label: "Hosts", href: "/dashboard/hosts" },
	{ label: "Approvals", href: "/dashboard/approvals" },
	{ label: "Logs", href: "/dashboard/logs" },
	{ label: "Settings", href: "/dashboard/settings" },
];

export default function DashboardLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const { data: session, isPending } = useSession();
	const router = useRouter();
	const pathname = usePathname();

	useEffect(() => {
		if (!isPending && !session) {
			router.push("/");
		}
	}, [session, isPending, router]);

	if (isPending || !session) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<svg
					className="animate-spin h-4 w-4 text-muted"
					viewBox="0 0 24 24"
					fill="none"
				>
					<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
					<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
				</svg>
			</div>
		);
	}

	return (
		<div className="flex min-h-screen flex-col">
			<header className="bg-header">
				<div className="flex h-14 items-center justify-between px-4">
					<div className="flex items-center gap-4">
						<Link href="/dashboard" className="text-accent hover:text-accent/80 transition-colors">
							<OnePasswordLogo className="h-8 w-8" />
						</Link>
						<span className="text-sm font-semibold text-white">
							Agent Auth Proxy
						</span>
					</div>
					<div className="flex items-center gap-3">
						<div className="flex items-center gap-2">
							<span className="text-sm text-foreground">
								{session.user.name || session.user.email}
							</span>
						</div>
						<button
							onClick={() =>
								signOut({
									fetchOptions: {
										onSuccess: () => router.push("/"),
									},
								})
							}
							className="cursor-pointer rounded-md border border-border bg-surface px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-surface-hover hover:border-muted"
						>
							Sign out
						</button>
					</div>
				</div>
			</header>
			<div className="border-b border-border bg-surface">
				<nav className="flex gap-0 px-4">
					{navItems.map((item) => {
						const isActive =
							item.href === "/dashboard"
								? pathname === "/dashboard"
								: pathname.startsWith(item.href);
						return (
							<Link
								key={item.href}
								href={item.href}
								className={`relative px-4 py-3 text-sm transition-colors ${
									isActive
										? "text-white font-semibold"
										: "text-muted hover:text-foreground"
								}`}
							>
								{item.label}
								{isActive && (
									<span className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full bg-op-tab-active" />
								)}
							</Link>
						);
					})}
				</nav>
			</div>
			<main className="flex-1">{children}</main>
		</div>
	);
}
