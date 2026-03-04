import {
	ArrowLeft,
	Bot,
	ExternalLink,
	Loader2,
	PlugZap,
	Settings,
	ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Agents } from "@/components/agents";
import { Approvals } from "@/components/approvals";
import { Connect } from "@/components/connect";
import { BetterAuthLogo } from "@/components/icons/logo";
import { SettingsPanel } from "@/components/settings";
import { SignIn } from "@/components/sign-in";
import { Button } from "@/components/ui/button";
import { verifySession } from "@/lib/api";
import { storage } from "@/lib/storage";
import type { User } from "@/lib/types";
import { cn } from "@/lib/utils";

type AppState = "loading" | "setup" | "ready";
type Tab = "approvals" | "agents" | "connect";

const TABS: { id: Tab; label: string; icon: typeof ShieldCheck }[] = [
	{ id: "approvals", label: "Approvals", icon: ShieldCheck },
	{ id: "agents", label: "Agents", icon: Bot },
	{ id: "connect", label: "Connect", icon: PlugZap },
];

export function App() {
	const [state, setState] = useState<AppState>("loading");
	const [user, setUser] = useState<User | null>(null);
	const [tab, setTab] = useState<Tab>("approvals");
	const [showSettings, setShowSettings] = useState(false);
	const [pendingCount, setPendingCount] = useState(0);

	useEffect(() => {
		(async () => {
			const token = await storage.getSessionToken();
			const idpUrl = await storage.getIdpUrl();
			if (!token || !idpUrl) {
				setState("setup");
				return;
			}
			const valid = await verifySession();
			if (!valid) {
				await storage.clearSession();
				setState("setup");
				return;
			}
			const u = await storage.getUser();
			setUser(u ?? null);
			setState("ready");
		})();
	}, []);

	const handleSignedIn = useCallback((u: User) => {
		setUser(u);
		setState("ready");
	}, []);

	const handleSignOut = useCallback(async () => {
		await storage.clearSession();
		setUser(null);
		setState("setup");
		setShowSettings(false);
	}, []);

	const handleOpenDashboard = useCallback(async () => {
		const idpUrl = await storage.getIdpUrl();
		if (idpUrl) window.open(idpUrl, "_blank");
	}, []);

	if (state === "loading") {
		return (
			<div className="flex items-center justify-center h-screen">
				<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
			</div>
		);
	}

	if (state === "setup") {
		return <SignIn onSuccess={handleSignedIn} />;
	}

	if (showSettings) {
		return (
			<div className="flex flex-col h-screen">
				<header className="flex items-center gap-2 px-4 py-3 border-b border-border">
					<Button
						variant="ghost"
						size="icon"
						className="size-7"
						onClick={() => setShowSettings(false)}
					>
						<ArrowLeft className="h-4 w-4" />
					</Button>
					<span className="text-sm font-medium tracking-tight">Settings</span>
				</header>
				<SettingsPanel user={user} onSignOut={handleSignOut} />
			</div>
		);
	}

	return (
		<div className="flex flex-col h-screen">
			<header className="flex items-center justify-between px-4 py-2.5 border-b border-border">
				<div className="flex items-center gap-2">
					<BetterAuthLogo className="h-3.5 w-auto" />
					<span className="text-[11px] font-mono uppercase tracking-wider text-foreground select-none">
						Better-Auth.
					</span>
				</div>
				<div className="flex items-center gap-0.5">
					<Button
						variant="ghost"
						size="icon"
						className="size-7"
						onClick={handleOpenDashboard}
						title="Open Dashboard"
					>
						<ExternalLink className="h-3.5 w-3.5" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						className="size-7"
						onClick={() => setShowSettings(true)}
						title="Settings"
					>
						<Settings className="h-3.5 w-3.5" />
					</Button>
				</div>
			</header>

			<nav className="flex border-b border-border">
				{TABS.map((t) => (
					<button
						key={t.id}
						onClick={() => setTab(t.id)}
						className={cn(
							"relative flex-1 flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors cursor-pointer first:pl-0 last:pr-0",
							tab === t.id
								? "text-foreground"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						<t.icon className="h-3.5 w-3.5" />
						{t.label}
						{t.id === "approvals" && pendingCount > 0 && (
							<span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-sm bg-amber-500/15 px-1 text-[10px] font-semibold tabular-nums text-amber-600 dark:text-amber-400">
								{pendingCount}
							</span>
						)}
						{tab === t.id && (
							<span className="absolute bottom-0 inset-x-0 h-[2px] bg-foreground" />
						)}
					</button>
				))}
			</nav>

			<main className="flex-1 overflow-y-auto no-scrollbar">
				{tab === "approvals" && <Approvals onCountChange={setPendingCount} />}
				{tab === "agents" && <Agents />}
				{tab === "connect" && <Connect />}
			</main>

			{user && (
				<footer className="flex items-center justify-between px-4 py-2 border-t border-border bg-muted/20">
					<span className="text-[11px] text-muted-foreground truncate max-w-[280px]">
						{user.email}
					</span>
					<div className="flex items-center gap-1.5">
						<div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
						<span className="text-[10px] text-muted-foreground/70">
							Connected
						</span>
					</div>
				</footer>
			)}
		</div>
	);
}
