"use client";

import { signOut, useSession } from "@/lib/auth-client";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";

function GmailLogo({ className }: { className?: string }) {
	return (
		<svg className={className} viewBox="0 0 75 75" xmlns="http://www.w3.org/2000/svg">
			<path d="M6.25 18.75v37.5c0 3.45 2.8 6.25 6.25 6.25h6.25V28.125L37.5 43.75l18.75-15.625V62.5H62.5c3.45 0 6.25-2.8 6.25-6.25v-37.5l-3.125 4.688L37.5 43.75l-28.125-20.313L6.25 18.75z" fill="#4285F4"/>
			<path d="M6.25 18.75c0-3.45 2.8-6.25 6.25-6.25h3.125L37.5 28.125 59.375 12.5H62.5c3.45 0 6.25 2.8 6.25 6.25l-6.25 6.25-25 18.75-18.75-15.625L6.25 18.75z" fill="#EA4335"/>
			<path d="M6.25 18.75v37.5c0 3.45 2.8 6.25 6.25 6.25h6.25V28.125L6.25 18.75z" fill="#C5221F"/>
			<path d="M68.75 18.75v37.5c0 3.45-2.8 6.25-6.25 6.25h-6.25V28.125L68.75 18.75z" fill="#1A73E8"/>
			<path d="M68.75 18.75l-6.25 6.25-25 18.75-18.75-15.625L6.25 18.75c0-3.45 2.8-6.25 6.25-6.25h3.125L37.5 28.125 59.375 12.5H62.5c3.45 0 6.25 2.8 6.25 6.25z" fill="#EA4335"/>
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
			<div className="flex min-h-screen items-center justify-center text-muted">
				<svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
					<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
					<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
				</svg>
			</div>
		);
	}

	return (
		<div className="flex min-h-screen flex-col bg-white">
			<header className="border-b border-border bg-white">
				<div className="flex h-16 items-center justify-between px-6">
					<div className="flex items-center gap-3">
						<GmailLogo className="h-6 w-6" />
						<span className="text-[18px] font-normal text-muted">
							Proxy
						</span>
						<div className="ml-2 rounded-full bg-accent/10 px-2.5 py-0.5 text-[11px] font-medium text-accent">
							Agent Auth
						</div>
					</div>
					<div className="flex items-center gap-4">
						<div className="flex items-center gap-2.5">
							{session.user.image && (
								<img
									src={session.user.image}
									alt=""
									className="h-8 w-8 rounded-full"
								/>
							)}
							<span className="text-sm text-foreground">
								{session.user.name}
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
							className="cursor-pointer rounded-full border border-border px-4 py-1.5 text-sm text-muted transition-colors hover:bg-surface hover:text-foreground"
						>
							Sign out
						</button>
					</div>
				</div>
				<nav className="flex gap-0 px-6">
					{navItems.map((item) => {
						const isActive =
							item.href === "/dashboard"
								? pathname === "/dashboard"
								: pathname.startsWith(item.href);
						return (
							<Link
								key={item.href}
								href={item.href}
								className={`relative px-4 pb-3 pt-1 text-sm transition-colors ${
									isActive
										? "text-accent font-medium"
										: "text-muted hover:text-foreground"
								}`}
							>
								{item.label}
								{isActive && (
									<span className="absolute bottom-0 left-1 right-1 h-[3px] rounded-t-full bg-accent" />
								)}
							</Link>
						);
					})}
				</nav>
			</header>
			<main className="flex-1 bg-surface">{children}</main>
		</div>
	);
}
