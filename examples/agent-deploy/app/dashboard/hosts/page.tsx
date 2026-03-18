"use client";

import { useState, useEffect } from "react";

interface HostData {
  id: string;
  name: string | null;
  default_capabilities: string[];
  status: string;
  activated_at: string | null;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

function timeAgo(date: string | null) {
  if (!date) return "Never";
  const now = Date.now();
  const then = new Date(date).getTime();
  const diff = now - then;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const statusStyles: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20",
  pending: "bg-amber-500/15 text-amber-600 dark:text-amber-400 ring-amber-500/20",
  pending_enrollment: "bg-amber-500/15 text-amber-600 dark:text-amber-400 ring-amber-500/20",
  revoked: "bg-red-500/15 text-red-600 dark:text-red-400 ring-red-500/20",
  rejected: "bg-red-500/15 text-red-600 dark:text-red-400 ring-red-500/20",
};

const defaultStatusStyle = "bg-foreground/[0.06] text-foreground/40 ring-foreground/[0.08]";

function StatusBadge({ status }: { status: string }) {
  const style = statusStyles[status] ?? defaultStatusStyle;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-mono ring-1 ${style}`}>
      {status.replace("_", " ")}
    </span>
  );
}

function Spinner() {
  return (
    <div className="text-[11px] font-mono text-foreground/30 animate-pulse">
      Loading...
    </div>
  );
}

export default function HostsPage() {
  const [hosts, setHosts] = useState<HostData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [editingHost, setEditingHost] = useState<string | null>(null);
  const [availableCaps, setAvailableCaps] = useState<{ name: string; description: string }[]>([]);
  const [selectedCaps, setSelectedCaps] = useState<Set<string>>(new Set());
  const [savingCaps, setSavingCaps] = useState(false);
  const [loadingCaps, setLoadingCaps] = useState(false);

  const startEditingCaps = async (host: HostData) => {
    setEditingHost(host.id);
    setLoadingCaps(true);
    setSelectedCaps(new Set(host.default_capabilities));
    try {
      const res = await fetch("/api/auth/capability/list?limit=500");
      if (res.ok) {
        const data = await res.json();
        setAvailableCaps(data.capabilities ?? []);
      }
    } catch { /* ignore */ }
    setLoadingCaps(false);
  };

  const saveCaps = async (hostId: string) => {
    setSavingCaps(true);
    try {
      const res = await fetch("/api/auth/host/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host_id: hostId, default_capabilities: [...selectedCaps] }),
      });
      if (res.ok) {
        setHosts((prev) =>
          prev.map((h) => h.id === hostId ? { ...h, default_capabilities: [...selectedCaps] } : h),
        );
      }
    } catch { /* ignore */ }
    setSavingCaps(false);
    setEditingHost(null);
  };

  useEffect(() => {
    setLoading(true);
    const params = filter !== "all" ? `?status=${filter}` : "";
    fetch(`/api/auth/host/list${params}`)
      .then((r) => (r.ok ? r.json() : { hosts: [] }))
      .then((data) => setHosts(data.hosts ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filter]);

  const handleRevoke = async (hostId: string) => {
    setRevoking(hostId);
    try {
      const res = await fetch("/api/auth/host/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host_id: hostId }),
      });
      if (res.ok) {
        setHosts((prev) =>
          prev.map((h) => (h.id === hostId ? { ...h, status: "revoked" } : h)),
        );
      }
    } catch {
      /* ignore */
    } finally {
      setRevoking(null);
    }
  };

  const filters = ["all", "active", "pending", "pending_enrollment", "revoked"];

  return (
    <div className="px-5 sm:px-6 lg:px-8 py-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Hosts</h1>
            <p className="mt-1 text-[11px] font-mono text-foreground/35">
              Agent host environments and their configurations
            </p>
          </div>
          <div className="flex gap-0.5 border border-foreground/[0.08] bg-foreground/[0.02] p-0.5">
            {filters.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`cursor-pointer px-3 py-1.5 text-[10px] font-mono transition-colors ${
                  filter === f
                    ? "bg-foreground text-background"
                    : "text-foreground/40 hover:text-foreground/70 hover:bg-foreground/[0.04]"
                }`}
              >
                {f === "pending_enrollment" ? "enrolling" : f}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Spinner />
          </div>
        ) : hosts.length === 0 ? (
          <div className="text-center py-20 space-y-4">
            <div className="text-foreground/15">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mx-auto"
              >
                <path d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground/50">No hosts found</p>
              <p className="mt-1 text-xs text-foreground/30">
                Hosts are created when agents register from new environments.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {hosts.map((host) => {
              const isExpanded = expanded === host.id;

              return (
                <div
                  key={host.id}
                  className={`border border-foreground/[0.08] bg-foreground/[0.02] transition-all ${isExpanded ? "border-foreground/[0.14]" : "hover:border-foreground/[0.12]"}`}
                >
                  <button
                    onClick={() => setExpanded(isExpanded ? null : host.id)}
                    className="flex w-full cursor-pointer items-center gap-4 px-5 py-3.5 text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {host.name ?? host.id.slice(0, 12) + "..."}
                        </span>
                        <StatusBadge status={host.status} />
                      </div>
                      <p className="mt-1 text-[10px] font-mono text-foreground/30">
                        {host.default_capabilities.length > 0
                          ? `${host.default_capabilities.length} default capabilities`
                          : "No default capabilities"}
                        {" / "}
                        {timeAgo(host.created_at)}
                      </p>
                    </div>
                    <svg
                      className={`h-3.5 w-3.5 shrink-0 text-foreground/25 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-foreground/[0.06] px-5 py-4">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                        <MetaItem label="Host ID">
                          <code className="text-[11px] font-mono break-all">{host.id}</code>
                        </MetaItem>
                        <MetaItem label="Name">
                          {host.name ?? "\u2014"}
                        </MetaItem>
                        <MetaItem label="Last Used">
                          {timeAgo(host.last_used_at)}
                        </MetaItem>
                        <MetaItem label="Activated">
                          {host.activated_at ? new Date(host.activated_at).toLocaleString() : "\u2014"}
                        </MetaItem>
                        <MetaItem label="Expires">
                          {host.expires_at ? new Date(host.expires_at).toLocaleString() : "Never"}
                        </MetaItem>
                        <MetaItem label="Updated">
                          {timeAgo(host.updated_at)}
                        </MetaItem>
                      </div>

                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-2.5">
                          <span className="text-[10px] font-mono uppercase tracking-wider text-foreground/30">
                            Default Capabilities
                          </span>
                          {editingHost === host.id ? (
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => saveCaps(host.id)}
                                disabled={savingCaps}
                                className="cursor-pointer px-3 py-1 text-[10px] font-mono bg-foreground text-background transition-opacity hover:opacity-90 disabled:opacity-50"
                              >
                                {savingCaps ? "Saving..." : "Save"}
                              </button>
                              <button
                                onClick={() => setEditingHost(null)}
                                className="cursor-pointer px-3 py-1 text-[10px] font-mono border border-foreground/[0.10] text-foreground/45 transition-colors hover:text-foreground/70"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : host.status === "active" ? (
                            <button
                              onClick={() => startEditingCaps(host)}
                              className="cursor-pointer px-3 py-1 text-[10px] font-mono border border-foreground/[0.10] text-foreground/40 transition-colors hover:text-foreground/70 hover:bg-foreground/[0.04]"
                            >
                              Edit
                            </button>
                          ) : null}
                        </div>
                        {editingHost === host.id ? (
                          loadingCaps ? (
                            <div className="flex justify-center py-6"><Spinner /></div>
                          ) : (
                            <div className="flex flex-col gap-1 max-h-60 overflow-y-auto">
                              {availableCaps.map((cap) => {
                                const isSelected = selectedCaps.has(cap.name);
                                return (
                                  <label
                                    key={cap.name}
                                    className={`flex items-center gap-3 px-3.5 py-2.5 cursor-pointer transition-colors ${
                                      isSelected
                                        ? "bg-emerald-500/10 border border-emerald-500/20"
                                        : "bg-foreground/[0.02] border border-foreground/[0.06] hover:bg-foreground/[0.04]"
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => {
                                        setSelectedCaps((prev) => {
                                          const next = new Set(prev);
                                          if (next.has(cap.name)) next.delete(cap.name);
                                          else next.add(cap.name);
                                          return next;
                                        });
                                      }}
                                      className="h-3.5 w-3.5 accent-emerald-500"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <code className="text-[11px] font-mono text-foreground/70 truncate block">{cap.name}</code>
                                      {cap.description && (
                                        <p className="text-[10px] text-foreground/30 truncate">{cap.description}</p>
                                      )}
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                          )
                        ) : host.default_capabilities.length > 0 ? (
                          <div className="flex flex-col gap-1">
                            {host.default_capabilities.map((cap) => (
                              <div key={cap} className="bg-foreground/[0.02] border border-foreground/[0.06] px-3.5 py-2.5">
                                <code className="text-[11px] font-mono text-foreground/60">{cap}</code>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] font-mono text-foreground/25 py-2">No default capabilities set.</p>
                        )}
                      </div>

                      {host.status === "active" && (
                        <button
                          onClick={() => handleRevoke(host.id)}
                          disabled={revoking === host.id}
                          className="cursor-pointer px-4 py-2 text-[11px] font-mono border border-red-500/15 bg-red-500/5 text-red-600 dark:text-red-400 transition-all hover:bg-red-500/10 hover:border-red-500/25 disabled:opacity-50"
                        >
                          {revoking === host.id ? "Revoking..." : "Revoke Host"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function MetaItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 bg-foreground/[0.02] border border-foreground/[0.06] px-3.5 py-2.5">
      <span className="text-[9px] font-mono uppercase tracking-wider text-foreground/30">{label}</span>
      <div className="text-[12px] text-foreground/70">{children}</div>
    </div>
  );
}
