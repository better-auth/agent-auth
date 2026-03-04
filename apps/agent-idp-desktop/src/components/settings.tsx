import { Bell, BellOff, ExternalLink, LogOut, Timer } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { storage } from "@/lib/storage";
import type { AppSettings, User } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { cn } from "@/lib/utils";

const POLL_OPTIONS = [
	{ value: 0.5, label: "30s" },
	{ value: 1, label: "1m" },
	{ value: 5, label: "5m" },
];

export function SettingsPanel({
	user,
	onSignOut,
}: {
	user: User | null;
	onSignOut: () => void;
}) {
	const [idpUrl, setIdpUrl] = useState("");
	const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

	useEffect(() => {
		storage.getIdpUrl().then((url) => setIdpUrl(url ?? ""));
		storage.getSettings().then(setSettings);
	}, []);

	const updateSettings = (patch: Partial<AppSettings>) => {
		const next = { ...settings, ...patch };
		setSettings(next);
		storage.setSettings(next);
		window.electronAPI.restartPolling();
	};

	return (
		<div className="flex-1 overflow-y-auto no-scrollbar">
			<div className="p-4 space-y-5">
				{user && (
					<div className="flex items-center gap-3 p-3 rounded-sm border border-border bg-card/50">
						{user.image ? (
							<img
								src={user.image}
								alt=""
								className="h-9 w-9 rounded-sm object-cover"
							/>
						) : (
							<div className="h-9 w-9 rounded-sm bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
								{(user.name || user.email).charAt(0).toUpperCase()}
							</div>
						)}
						<div className="min-w-0 flex-1">
							<p className="text-sm font-medium truncate">{user.name}</p>
							<p className="text-[11px] text-muted-foreground truncate">
								{user.email}
							</p>
						</div>
					</div>
				)}

				<div className="space-y-1.5">
					<label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
						Server
					</label>
					<div className="flex items-center gap-2 p-2.5 rounded-sm border border-border bg-card/50">
						<span className="text-xs font-mono text-foreground truncate flex-1">
							{idpUrl || "Not configured"}
						</span>
						{idpUrl && (
							<button
								onClick={() => window.electronAPI.openExternal(idpUrl)}
								className="shrink-0 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
								title="Open in browser"
							>
								<ExternalLink className="h-3.5 w-3.5" />
							</button>
						)}
					</div>
				</div>

				<div className="space-y-2.5">
					<label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
						Poll Interval
					</label>
					<div className="flex items-center gap-2">
						<Timer className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
						<div className="flex gap-0.5 p-0.5 bg-muted/50 rounded-sm">
							{POLL_OPTIONS.map((opt) => (
								<button
									key={opt.value}
									onClick={() =>
										updateSettings({ pollIntervalMinutes: opt.value })
									}
									className={cn(
										"px-2.5 py-1 text-[11px] font-medium rounded-sm transition-all cursor-pointer",
										settings.pollIntervalMinutes === opt.value
											? "bg-background text-foreground shadow-sm"
											: "text-muted-foreground hover:text-foreground",
									)}
								>
									{opt.label}
								</button>
							))}
						</div>
					</div>
				</div>

				<div className="space-y-2.5">
					<label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
						Notifications
					</label>
					<button
						onClick={() =>
							updateSettings({
								notificationsEnabled: !settings.notificationsEnabled,
							})
						}
						className={cn(
							"flex items-center gap-2.5 w-full p-2.5 rounded-sm border transition-colors cursor-pointer",
							settings.notificationsEnabled
								? "border-emerald-500/30 bg-emerald-500/5"
								: "border-border bg-card/50",
						)}
					>
						{settings.notificationsEnabled ? (
							<Bell className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
						) : (
							<BellOff className="h-3.5 w-3.5 text-muted-foreground" />
						)}
						<div className="flex-1 text-left">
							<p className="text-xs font-medium">
								{settings.notificationsEnabled
									? "Notifications on"
									: "Notifications off"}
							</p>
							<p className="text-[11px] text-muted-foreground">
								{settings.notificationsEnabled
									? "You'll be alerted for new approval requests"
									: "Enable to get notified of new requests"}
							</p>
						</div>
					</button>
				</div>

				<div className="pt-2 border-t border-border">
					<Button
						variant="outline"
						size="sm"
						className="w-full text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
						onClick={onSignOut}
					>
						<LogOut className="h-3.5 w-3.5" />
						Sign Out
					</Button>
				</div>
			</div>
		</div>
	);
}
