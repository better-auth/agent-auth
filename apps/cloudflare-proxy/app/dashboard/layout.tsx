"use client";

import { signOut, useSession } from "@/lib/auth-client";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";

function CloudflareLogo({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			viewBox="0 0 65 65"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path
				d="M44.214 40.877a1.418 1.418 0 0 0-.103-1.344c-.257-.386-.67-.617-1.12-.644L20.92 37.78a.47.47 0 0 1-.38-.228.493.493 0 0 1-.035-.45c.077-.184.245-.31.44-.335l22.39-1.12c1.948-.097 4.063-1.66 4.825-3.56l.967-2.413a.836.836 0 0 0 .047-.44C47.74 20.47 40.05 13.5 30.8 13.5c-8.406 0-15.548 5.737-17.62 13.51a7.86 7.86 0 0 0-5.45-1.554c-3.72.344-6.724 3.316-7.1 7.033a7.95 7.95 0 0 0 .443 3.562C.487 36.23 0 37.006 0 38.23c0 .36.04.71.116 1.05.102.452.5.773.965.773h42.163c.44 0 .838-.293.97-.71l-.001-.466Z"
				fill="currentColor"
			/>
			<path
				d="M52.058 25.092a.397.397 0 0 0-.393.05 10.27 10.27 0 0 0-3.168 4.05l-.967 2.414c-.762 1.9.012 3.462 1.722 3.56l3.753.188c.193.019.362.145.44.335a.493.493 0 0 1-.036.45.468.468 0 0 1-.38.228l-3.83.192c-1.947.097-3.28 1.66-2.962 3.464.18 1.018.556 1.95 1.09 2.77.19.293.55.437.9.37A12.456 12.456 0 0 0 58.5 30.875a12.409 12.409 0 0 0-6.048-5.63.396.396 0 0 0-.393-.152Z"
				fill="currentColor"
				opacity="0.7"
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
						fill="currentColor"
						d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
					/>
				</svg>
			</div>
		);
	}

	return (
		<div className="flex min-h-screen flex-col">
			<header className="border-b border-border">
				<div className="flex h-14 items-center justify-between px-6">
					<div className="flex items-center gap-3">
						<CloudflareLogo className="h-4 w-6 text-white" />
						<div className="h-4 w-px bg-border" />
						<span className="text-sm font-medium text-muted">
							Agent Auth
						</span>
					</div>
					<div className="flex items-center gap-4">
						<div className="flex items-center gap-2">
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
							className="cursor-pointer rounded-md border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:border-foreground/20 hover:text-foreground"
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
								className={`relative px-3 pb-3 pt-1 text-sm transition-colors ${
									isActive
										? "text-white"
										: "text-muted hover:text-foreground"
								}`}
							>
								{item.label}
								{isActive && (
									<span className="absolute bottom-0 left-0 right-0 h-px bg-white" />
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
