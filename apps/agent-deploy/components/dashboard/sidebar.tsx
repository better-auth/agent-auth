"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
	LayoutDashboard,
	Globe,
	Bot,
	Activity,
	LogOut,
	Rocket,
	ChevronsUpDown,
	Check,
	Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NAV_ITEMS = [
	{ href: "/dashboard", label: "Overview", icon: LayoutDashboard },
	{ href: "/dashboard/sites", label: "Sites", icon: Globe },
	{ href: "/dashboard/agents", label: "Agents", icon: Bot },
	{ href: "/dashboard/activity", label: "Activity", icon: Activity },
];

interface DeviceSession {
	session: { token: string };
	user: { id: string; name: string; email: string; image?: string | null };
}

interface SidebarProps {
	user: { id: string; name: string; email: string; image?: string | null };
	deviceSessions: DeviceSession[];
}

function initials(name: string) {
	return name
		.split(" ")
		.map((w) => w[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);
}

export function Sidebar({ user, deviceSessions }: SidebarProps) {
	const pathname = usePathname();
	const router = useRouter();
	const [switching, setSwitching] = useState(false);

	const otherSessions = deviceSessions.filter(
		(s) => s.user.id !== user.id,
	);

	async function switchAccount(sessionToken: string) {
		setSwitching(true);
		try {
			await authClient.multiSession.setActive({ sessionToken });
			router.refresh();
		} finally {
			setSwitching(false);
		}
	}

	async function handleSignOut() {
		await authClient.signOut();
		window.location.href = "/";
	}

	function handleAddAccount() {
		window.location.href = "/?add=true";
	}

	return (
		<aside className="fixed left-0 top-0 z-30 flex h-screen w-60 flex-col border-r border-border bg-sidebar text-sidebar-foreground">
			<div className="flex h-14 items-center gap-2.5 border-b border-sidebar-border px-5">
				<div className="flex size-7 items-center justify-center rounded-md bg-primary">
					<Rocket className="size-4 text-primary-foreground" />
				</div>
				<span className="text-sm font-semibold tracking-tight">
					AgentDeploy
				</span>
			</div>

			<nav className="flex-1 space-y-1 px-3 py-4">
				{NAV_ITEMS.map((item) => {
					const isActive =
						pathname === item.href ||
						(item.href !== "/dashboard" &&
							pathname.startsWith(item.href));
					return (
						<Link
							key={item.href}
							href={item.href}
							className={cn(
								"flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
								isActive
									? "bg-sidebar-accent text-sidebar-accent-foreground"
									: "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
							)}
						>
							<item.icon className="size-4" />
							{item.label}
						</Link>
					);
				})}
			</nav>

			<div className="border-t border-sidebar-border p-3">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-sidebar-accent/50"
						>
							<Avatar className="size-8">
								<AvatarImage src={user.image ?? undefined} />
								<AvatarFallback className="text-[10px] bg-primary/10 text-primary">
									{initials(user.name)}
								</AvatarFallback>
							</Avatar>
							<div className="flex-1 min-w-0">
								<p className="text-sm font-medium truncate">
									{user.name}
								</p>
								<p className="text-xs text-muted-foreground truncate">
									{user.email}
								</p>
							</div>
							<ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						side="top"
						align="start"
						className="w-[232px]"
					>
						{otherSessions.length > 0 && (
							<>
								<DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
									Switch account
								</DropdownMenuLabel>
								{otherSessions.map((s) => (
									<DropdownMenuItem
										key={s.user.id}
										disabled={switching}
										onClick={() =>
											switchAccount(s.session.token)
										}
										className="gap-3"
									>
										<Avatar className="size-6">
											<AvatarImage
												src={
													s.user.image ?? undefined
												}
											/>
											<AvatarFallback className="text-[9px] bg-primary/10 text-primary">
												{initials(s.user.name)}
											</AvatarFallback>
										</Avatar>
										<div className="flex-1 min-w-0">
											<p className="text-sm truncate">
												{s.user.name}
											</p>
											<p className="text-xs text-muted-foreground truncate">
												{s.user.email}
											</p>
										</div>
									</DropdownMenuItem>
								))}
								<DropdownMenuSeparator />
							</>
						)}

						<DropdownMenuLabel className="text-xs text-muted-foreground font-normal flex items-center gap-2">
							<Check className="size-3" />
							{user.name}
						</DropdownMenuLabel>

						<DropdownMenuSeparator />

						<DropdownMenuItem
							onClick={handleAddAccount}
							className="gap-2"
						>
							<Plus className="size-4" />
							Add account
						</DropdownMenuItem>

						<DropdownMenuItem
							onClick={handleSignOut}
							className="gap-2 text-destructive-foreground focus:text-destructive-foreground"
						>
							<LogOut className="size-4" />
							Sign out
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</aside>
	);
}
