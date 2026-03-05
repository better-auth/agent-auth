"use client";

import {
	Activity,
	Bot,
	Cable,
	Fingerprint,
	KeyRound,
	Layers,
	LogOut,
	Plug,
	Settings,
	ShieldCheck,
	Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { SVGProps } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { listPendingCibaRequests } from "@/lib/auth/agent-api";
import { cn } from "@/lib/utils";

function OverviewIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="1em"
			height="1em"
			viewBox="0 0 24 24"
			{...props}
		>
			<path
				fill="currentColor"
				d="M1.77 18V6h12v12zm1-1h10V7h-10zM17 18V6h1v12zm4.23 0V6h1v12zM2.77 17V7z"
			/>
		</svg>
	);
}

import { ConnectDialog } from "@/components/dashboard/connect-dialog";
import { AgentBotIcon } from "@/components/icons/agent-bot";
import { BetterAuthLogo } from "@/components/icons/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut, useSession } from "@/lib/auth/client";

type NavItem = {
	name: string;
	href: string;
	icon: React.ComponentType<{ className?: string }>;
};

function isNavItemActive(
	pathname: string,
	href: string,
	name: string,
): boolean {
	if (pathname === href) return true;
	if (name === "Overview" || href.match(/^\/dashboard\/[^/]+$/))
		return pathname === href;
	if (name === "Connections" && pathname.includes("/connections")) return true;
	if (name === "Agents" && pathname.includes("/agents")) return true;
	if (name === "Hosts" && pathname.includes("/hosts")) return true;
	if (name === "Activity" && pathname.includes("/activity")) return true;
	if (name === "Approvals" && pathname.includes("/approvals")) return true;
	if (name === "Members" && pathname.includes("/members")) return true;
	if (name === "Scopes" && pathname.includes("/scopes")) return true;
	if (name === "Security" && pathname.includes("/security")) return true;
	if (name === "Settings" && pathname.includes("/settings")) return true;
	if (pathname.startsWith(href + "/") || pathname.startsWith(href + "?"))
		return true;
	return false;
}

function OrgBadge({ slug, orgName }: { slug: string; orgName: string }) {
	return (
		<div className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left">
			<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-foreground/[0.06] text-[11px] font-semibold uppercase">
				{orgName[0]}
			</div>
			<div className="flex-1 min-w-0">
				<p className="text-[13px] font-medium truncate leading-tight">
					{orgName}
				</p>
				<p className="text-[10px] text-muted-foreground/60 font-mono truncate leading-tight">
					/{slug}
				</p>
			</div>
		</div>
	);
}

function usePendingCibaCount() {
	const [count, setCount] = useState(0);
	const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const fetch = useCallback(async () => {
		try {
			const res = await listPendingCibaRequests();
			setCount(res.data?.length ?? 0);
		} catch {
			// silent
		}
	}, []);

	useEffect(() => {
		void fetch();
		pollRef.current = setInterval(fetch, 30_000);
		return () => {
			if (pollRef.current) clearInterval(pollRef.current);
		};
	}, [fetch]);

	return count;
}

import type { OrgType } from "@/lib/db/queries";

const PERSONAL_HIDDEN_NAV = new Set([
	"Members",
	"Approvals",
	"Security",
]);

function SidebarNavLinks({
	slug,
	orgType,
}: { slug: string; orgType: OrgType }) {
	const pathname = usePathname();
	const pendingCount = usePendingCibaCount();

	const navItems: NavItem[] = [
		{ name: "Overview", href: `/dashboard/${slug}`, icon: OverviewIcon },
		{ name: "Agents", href: `/dashboard/${slug}/agents`, icon: AgentBotIcon },
		{ name: "Hosts", href: `/dashboard/${slug}/hosts`, icon: KeyRound },
		{
			name: "Connections",
			href: `/dashboard/${slug}/connections`,
			icon: Cable,
		},
		{ name: "Scopes", href: `/dashboard/${slug}/scopes`, icon: Layers },
		{
			name: "Approvals",
			href: `/dashboard/${slug}/approvals`,
			icon: Fingerprint,
		},
		{ name: "Activity", href: `/dashboard/${slug}/activity`, icon: Activity },
		{ name: "Members", href: `/dashboard/${slug}/members`, icon: Users },
		{
			name: "Security",
			href: `/dashboard/${slug}/security`,
			icon: ShieldCheck,
		},
		{ name: "Settings", href: `/dashboard/${slug}/settings`, icon: Settings },
	].filter(
		(item) =>
			orgType !== "personal" || !PERSONAL_HIDDEN_NAV.has(item.name),
	);
	return (
		<nav className="flex flex-col gap-px px-3">
			{navItems.map((item) => {
				const active = isNavItemActive(pathname, item.href, item.name);
				const Icon = item.icon;
				const badge =
					item.name === "Approvals" && pendingCount > 0 ? pendingCount : null;
				return (
					<Link
						key={item.name}
						href={item.href}
						prefetch
						className={cn(
							"flex items-center gap-3 px-2.5 py-[7px] text-[13px] transition-colors rounded-md",
							active
								? "bg-foreground/[0.06] text-foreground font-medium"
								: "text-muted-foreground hover:bg-foreground/[0.03] hover:text-foreground",
						)}
					>
						<Icon
							className={cn(
								"h-4 w-4 shrink-0",
								active ? "text-foreground" : "text-muted-foreground/70",
							)}
						/>
						<span className="flex-1">{item.name}</span>
						{badge !== null && (
							<span className="flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-amber-500/15 px-1 text-[10px] font-semibold tabular-nums text-amber-600 dark:text-amber-400">
								{badge}
							</span>
						)}
					</Link>
				);
			})}
		</nav>
	);
}

function UserMenu({ orgSlug }: { orgSlug: string }) {
	const { data: session } = useSession();
	const router = useRouter();
	if (!session?.user) return null;
	const user = session.user;
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				className="w-full flex items-center gap-2.5 mx-3 px-2.5 py-2 hover:bg-foreground/[0.04] rounded-lg transition-colors"
				style={{ width: "calc(100% - 1.5rem)" }}
			>
				<Avatar className="h-6 w-6">
					<AvatarImage
						src={user.image || undefined}
						alt={user.name || user.email}
					/>
					<AvatarFallback className="text-[10px] bg-foreground/[0.06]">
						{user.name
							? user.name
									.split(" ")
									.map((n) => n[0])
									.join("")
									.toUpperCase()
							: user.email[0].toUpperCase()}
					</AvatarFallback>
				</Avatar>
				<div className="flex-1 min-w-0 text-left">
					<p className="text-[12px] font-medium truncate leading-tight">
						{user.name || user.email}
					</p>
					<p className="text-[10px] text-muted-foreground/60 truncate leading-tight">
						{user.email}
					</p>
				</div>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-52">
				<DropdownMenuItem
					className="cursor-pointer"
					onClick={() => router.push(`/dashboard/${orgSlug}/settings`)}
				>
					<Settings className="mr-2 h-3.5 w-3.5" />
					<span className="text-sm">Settings</span>
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					className="cursor-pointer text-muted-foreground"
					onClick={async () => {
						await signOut({
							fetchOptions: {
								onSuccess: () => {
									router.push("/");
									router.refresh();
								},
							},
						});
					}}
				>
					<LogOut className="mr-2 h-3.5 w-3.5" />
					<span className="text-sm">Sign out</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export default function Sidebar({
	slug,
	orgId,
	orgName,
	orgType,
}: {
	slug: string;
	orgId: string;
	orgName: string;
	orgType: OrgType;
	session: { user: { name: string; email: string; image?: string | null } };
}) {
	return (
		<aside className="fixed left-0 top-0 z-40 flex h-dvh w-[252px] flex-col border-r border-border/50 bg-background">
			<div className="px-5 pt-5 pb-1">
				<Link
					href={`/dashboard/${slug}`}
					className="flex items-center gap-2 text-foreground transition-colors"
				>
					<BetterAuthLogo className="h-4 w-4" />
					<p>BETTER-AUTH.</p>
				</Link>
			</div>
			<div className="px-2 py-2">
				<OrgBadge slug={slug} orgName={orgName} />
			</div>
			<div className="px-3 pb-1">
				<ConnectDialog orgId={orgId} orgSlug={slug}>
					<button className="w-full flex items-center gap-2.5 px-2.5 py-2 text-[13px] font-medium rounded-lg border border-dashed border-border/70 text-muted-foreground hover:text-foreground hover:border-foreground/20 hover:bg-foreground/[0.03] transition-all group">
						<Plug className="h-4 w-4 shrink-0 text-muted-foreground/60 group-hover:text-foreground transition-colors" />
						<span>Connect Agent</span>
					</button>
				</ConnectDialog>
			</div>
			<div className="flex-1 overflow-y-auto pt-2 pb-2">
				<SidebarNavLinks slug={slug} orgType={orgType} />
			</div>
			<div className="border-t border-border/40 pt-2.5 pb-3 space-y-1.5">
				<div className="flex items-center justify-between px-4">
					<span className="text-[10px] text-muted-foreground/70 uppercase tracking-wider font-medium">
						Theme
					</span>
					<ThemeToggle />
				</div>
				<UserMenu orgSlug={slug} />
			</div>
		</aside>
	);
}
