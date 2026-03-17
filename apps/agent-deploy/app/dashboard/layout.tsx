"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AgentAuthLogo } from "@/components/icons/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { signOut, useSession } from "@/lib/auth-client";

export default function DashboardLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const router = useRouter();
	const { data: session, isPending } = useSession();

	useEffect(() => {
		if (!(isPending || session)) {
			router.push("/sign-in");
		}
	}, [session, isPending, router]);

	if (isPending) {
		return (
			<div className="flex min-h-dvh items-center justify-center">
				<div className="animate-pulse font-mono text-[11px] text-foreground/30">
					Loading...
				</div>
			</div>
		);
	}

	if (!session) {
		return null;
	}

	return (
		<div className="min-h-dvh">
			<nav className="flex items-center justify-between border-foreground/[0.06] border-b px-5 py-3 sm:px-6">
				<div className="flex items-center gap-6">
					<Link className="flex items-center gap-3" href="/">
						<AgentAuthLogo className="h-4 w-auto" />
						<span className="font-mono text-[11px] text-foreground/40 uppercase tracking-wider">
							Deploy
						</span>
					</Link>
					<div className="hidden items-center gap-4 sm:flex">
						<Link
							className="font-mono text-[11px] text-foreground/45 transition-colors hover:text-foreground/70"
							href="/dashboard"
						>
							Sites
						</Link>
					</div>
				</div>
				<div className="flex items-center gap-4">
					<span className="hidden font-mono text-[10px] text-foreground/30 sm:inline">
						{session.user.email}
					</span>
					<button
						className="font-mono text-[11px] text-foreground/35 transition-colors hover:text-foreground/60"
						onClick={() => signOut().then(() => router.push("/"))}
					>
						Sign out
					</button>
					<ThemeToggle />
				</div>
			</nav>
			{children}
		</div>
	);
}
