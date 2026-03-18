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
			<div className="flex min-h-screen items-center justify-center text-gray-400">
				<svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
					<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
					<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
				</svg>
			</div>
		);
	}

	return (
		<div className="flex min-h-screen flex-col bg-white">
			<header className="border-b border-gray-200 bg-white">
				<div className="flex h-14 items-center justify-between px-6">
					<div className="flex items-center gap-2.5">
						<GmailLogo className="h-5 w-5" />
						<span className="text-[15px] text-gray-400">
							Proxy
						</span>
						<span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
							Agent Auth
						</span>
					</div>
					<div className="flex items-center gap-3">
						<div className="flex items-center gap-2">
							{session.user.image && (
								<img
									src={session.user.image}
									alt=""
									className="h-7 w-7 rounded-full"
								/>
							)}
							<span className="text-[13px] text-gray-700">
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
							className="cursor-pointer rounded-md border border-gray-200 px-3 py-1 text-[13px] text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700"
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
								className={`relative px-3.5 pb-2.5 pt-1 text-[13px] transition-colors ${
									isActive
										? "text-gray-900 font-medium"
										: "text-gray-400 hover:text-gray-600"
								}`}
							>
								{item.label}
								{isActive && (
									<span className="absolute bottom-0 left-1 right-1 h-[2px] rounded-t-full bg-gray-900" />
								)}
							</Link>
						);
					})}
				</nav>
			</header>
			<main className="flex-1 bg-gray-50/50">{children}</main>
		</div>
	);
}
