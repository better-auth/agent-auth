import {
  Bell,
  BellOff,
  ExternalLink,
  Globe,
  Loader2,
  LogOut,
  Radar,
  Timer,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { storage } from "@/lib/storage";
import type { ExtensionSettings, StoredAuthAccount, User } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { cn } from "@/lib/utils";

const POLL_OPTIONS = [
  { value: 0.5, label: "30s" },
  { value: 1, label: "1m" },
  { value: 5, label: "5m" },
];

function SiteCard({
  account,
  isPrimary,
  onRemoved,
  onMakePrimary,
}: {
  account: StoredAuthAccount;
  isPrimary: boolean;
  onRemoved: (id: string) => void;
  onMakePrimary: (id: string) => void;
}) {
  const [removing, setRemoving] = useState(false);
  const hostname = (() => {
    try {
      return new URL(account.idpUrl).hostname;
    } catch {
      return account.idpUrl;
    }
  })();

  const handleRemove = async () => {
    setRemoving(true);
    await storage.removeAccount(account.id);
    onRemoved(account.id);
  };

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 p-2.5 rounded-sm border bg-card/50 transition-colors",
        isPrimary ? "border-emerald-500/30" : "border-border",
      )}
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-muted/60">
        <Globe className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-medium truncate">{hostname}</p>
          {isPrimary && (
            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-sm shrink-0 uppercase tracking-wide bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              Primary
            </span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground truncate">{account.user.email}</p>
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        {!isPrimary && (
          <Button
            variant="ghost"
            size="xs"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => onMakePrimary(account.id)}
            title="Make primary"
          >
            <span className="text-[10px]">Primary</span>
          </Button>
        )}
        <button
          onClick={() => window.open(account.idpUrl, "_blank")}
          className="p-1 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          title="Open in browser"
        >
          <ExternalLink className="h-3 w-3" />
        </button>
        <Button
          variant="ghost"
          size="xs"
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={handleRemove}
          disabled={removing}
          title="Remove site"
        >
          {removing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
        </Button>
      </div>
    </div>
  );
}

export function SettingsPanel({
  user,
  accountCount,
  onSignOut,
  onAddAccount,
}: {
  user: User | null;
  accountCount: number;
  onSignOut: () => void;
  onAddAccount: () => void;
}) {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [accounts, setAccounts] = useState<StoredAuthAccount[]>([]);
  const [primaryId, setPrimaryId] = useState<string | undefined>();
  const [discovering, setDiscovering] = useState(false);
  const [discoveryResult, setDiscoveryResult] = useState<string | null>(null);

  const loadAccounts = useCallback(async () => {
    const all = await storage.getAccounts();
    setAccounts(all);
    const primary = await storage.getPrimaryAccount();
    setPrimaryId(primary?.id);
  }, []);

  const handleDiscover = useCallback(async () => {
    setDiscovering(true);
    setDiscoveryResult(null);
    try {
      const result = await chrome.runtime.sendMessage({
        type: "discover-accounts",
      });
      await loadAccounts();
      if (result?.discovered > 0) {
        setDiscoveryResult(
          `Found ${result.discovered} new site${result.discovered > 1 ? "s" : ""}`,
        );
      } else {
        setDiscoveryResult("No new sites found");
      }
    } catch {
      setDiscoveryResult("Discovery failed");
    }
    setDiscovering(false);
    setTimeout(() => setDiscoveryResult(null), 4000);
  }, [loadAccounts]);

  useEffect(() => {
    loadAccounts();
    storage.getSettings().then(setSettings);
  }, [loadAccounts]);

  const updateSettings = (patch: Partial<ExtensionSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    storage.setSettings(next);
  };

  return (
    <div className="flex-1 overflow-y-auto no-scrollbar">
      <div className="p-4 space-y-5">
        {user && (
          <div className="flex items-center gap-3 p-3 rounded-sm border border-border bg-card/50">
            {user.image ? (
              <img src={user.image} alt="" className="h-9 w-9 rounded-sm object-cover" />
            ) : (
              <div className="h-9 w-9 rounded-sm bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
                {(user.name || user.email).charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{user.name}</p>
              <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
            </div>
          </div>
        )}

        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Connected Sites
            </label>
            <div className="flex items-center gap-1.5">
              <Button
                size="xs"
                variant="outline"
                onClick={handleDiscover}
                disabled={discovering}
                title="Auto-discover sites you're signed in to"
              >
                {discovering ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Radar className="h-3 w-3" />
                )}
                Discover
              </Button>
              <Button size="xs" variant="outline" onClick={onAddAccount}>
                Add Site
              </Button>
            </div>
          </div>
          {discoveryResult && (
            <p className="text-[11px] text-muted-foreground text-center py-1">{discoveryResult}</p>
          )}
          {accounts.length === 0 ? (
            <div className="border border-dashed border-border rounded-sm py-6 text-center">
              <Globe className="h-4 w-4 mx-auto mb-1.5 text-muted-foreground/30" />
              <p className="text-[11px] text-muted-foreground">No sites connected</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {accounts.map((account) => (
                <SiteCard
                  key={account.id}
                  account={account}
                  isPrimary={account.id === primaryId}
                  onRemoved={(id) => {
                    setAccounts((prev) => prev.filter((a) => a.id !== id));
                    if (id === primaryId) {
                      const remaining = accounts.filter((a) => a.id !== id);
                      setPrimaryId(remaining[0]?.id);
                    }
                  }}
                  onMakePrimary={async (id) => {
                    await storage.setPrimaryAccountId(id);
                    setPrimaryId(id);
                  }}
                />
              ))}
            </div>
          )}
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
                  onClick={() => updateSettings({ pollIntervalMinutes: opt.value })}
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
                {settings.notificationsEnabled ? "Notifications on" : "Notifications off"}
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
