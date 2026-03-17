"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { signOut, useSession } from "@/lib/auth-client";

function GitHubLogo({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			fill="currentColor"
			viewBox="0 0 98 96"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path
				clipRule="evenodd"
				d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z"
				fillRule="evenodd"
			/>
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
		if (!(isPending || session)) {
			router.push("/");
		}
	}, [session, isPending, router]);

	if (isPending || !session) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<svg
					className="h-4 w-4 animate-spin text-muted"
					fill="none"
					viewBox="0 0 24 24"
				>
					<circle
						className="opacity-25"
						cx="12"
						cy="12"
						r="10"
						stroke="currentColor"
						strokeWidth="4"
					/>
					<path
						className="opacity-75"
						d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
						fill="currentColor"
					/>
				</svg>
			</div>
		);
	}

	return (
		<div className="flex min-h-screen flex-col">
			<header className="bg-header">
				<div className="flex h-14 items-center justify-between px-4">
					<div className="flex items-center gap-4">
						<Link
							className="text-white transition-colors hover:text-white/80"
							href="/dashboard"
						>
							<GitHubLogo className="h-8 w-8" />
						</Link>
						<span className="font-semibold text-sm text-white">
							Agent Auth Proxy
						</span>
					</div>
					<div className="flex items-center gap-3">
						<div className="flex items-center gap-2">
							{session.user.image && (
								<img
									alt=""
									className="h-5 w-5 rounded-full ring-1 ring-border"
									src={session.user.image}
								/>
							)}
							<span className="text-foreground text-sm">
								{session.user.name}
							</span>
						</div>
						<button
							className="cursor-pointer rounded-md border border-border bg-surface px-3 py-1 font-medium text-foreground text-xs transition-colors hover:border-muted hover:bg-surface-hover"
							onClick={() =>
								signOut({
									fetchOptions: {
										onSuccess: () => router.push("/"),
									},
								})
							}
						>
							Sign out
						</button>
					</div>
				</div>
			</header>
			<div className="border-border border-b bg-surface">
				<nav className="flex gap-0 px-4">
					{navItems.map((item) => {
						const isActive =
							item.href === "/dashboard"
								? pathname === "/dashboard"
								: pathname.startsWith(item.href);
						return (
							<Link
								className={`relative px-4 py-3 text-sm transition-colors ${
									isActive
										? "font-semibold text-white"
										: "text-muted hover:text-foreground"
								}`}
								href={item.href}
								key={item.href}
							>
								{item.label}
								{isActive && (
									<span className="absolute right-4 bottom-0 left-4 h-0.5 rounded-full bg-gh-tab-active" />
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
