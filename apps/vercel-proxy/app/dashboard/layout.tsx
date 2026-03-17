"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { signOut, useSession } from "@/lib/auth-client";

function VercelLogo({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			fill="currentColor"
			viewBox="0 0 76 65"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
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
			<header className="border-border border-b">
				<div className="flex h-14 items-center justify-between px-6">
					<div className="flex items-center gap-3">
						<VercelLogo className="h-4 w-4 text-white" />
						<div className="h-4 w-px bg-border" />
						<span className="font-medium text-muted text-sm">Agent Auth</span>
					</div>
					<div className="flex items-center gap-4">
						<div className="flex items-center gap-2">
							{session.user.image && (
								<img
									alt=""
									className="h-6 w-6 rounded-full"
									src={session.user.image}
								/>
							)}
							<span className="text-foreground text-sm">
								{session.user.name}
							</span>
						</div>
						<button
							className="cursor-pointer rounded-md border border-border px-3 py-1.5 text-muted text-xs transition-colors hover:border-foreground/20 hover:text-foreground"
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
				<nav className="flex gap-0 px-6">
					{navItems.map((item) => {
						const isActive =
							item.href === "/dashboard"
								? pathname === "/dashboard"
								: pathname.startsWith(item.href);
						return (
							<Link
								className={`relative px-3 pt-1 pb-3 text-sm transition-colors ${
									isActive ? "text-white" : "text-muted hover:text-foreground"
								}`}
								href={item.href}
								key={item.href}
							>
								{item.label}
								{isActive && (
									<span className="absolute right-0 bottom-0 left-0 h-px bg-white" />
								)}
							</Link>
						);
					})}
				</nav>
			</header>
			<main className="flex-1">{children}</main>
		</div>
	);
}
