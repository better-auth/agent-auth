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
  active:
    "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50",
  pending:
    "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800/50",
  pending_enrollment:
    "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800/50",
  revoked:
    "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800/50",
  rejected:
    "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800/50",
};

const defaultStatusStyle = "bg-muted text-muted-foreground border-border";

function StatusBadge({ status }: { status: string }) {
  const style = statusStyles[status] ?? defaultStatusStyle;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-px text-[10px] font-medium border ${style}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

function Spinner() {
  return (
    <div className="h-4 w-4 rounded-full border-2 border-foreground/10 border-t-foreground/60 animate-spin" />
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
  const [enrollModal, setEnrollModal] = useState<{
    token: string;
    hostId: string;
    expiresAt: string;
  } | null>(null);
  const [creatingHost, setCreatingHost] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleConnectHost = async () => {
    setCreatingHost(true);
    try {
      const res = await fetch("/api/auth/host/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.enrollmentToken) {
          setEnrollModal({
            token: data.enrollmentToken,
            hostId: data.hostId,
            expiresAt: data.enrollmentTokenExpiresAt,
          });
          setFilter("all");
          const listRes = await fetch("/api/auth/host/list");
          if (listRes.ok) {
            const listData = await listRes.json();
            setHosts(listData.hosts ?? []);
          }
        }
      }
    } catch {
      /* ignore */
    }
    setCreatingHost(false);
  };

  const enrollCommand = enrollModal
    ? `Enroll as a host on ${typeof window !== "undefined" ? window.location.origin : ""} using this enrollment token: ${enrollModal.token}`
    : "";

  const copyToClipboard = () => {
    navigator.clipboard.writeText(enrollCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
    } catch {
      /* ignore */
    }
    setLoadingCaps(false);
  };

  const saveCaps = async (hostId: string) => {
    setSavingCaps(true);
    try {
      const res = await fetch("/api/auth/host/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host_id: hostId,
          default_capabilities: [...selectedCaps],
        }),
      });
      if (res.ok) {
        setHosts((prev) =>
          prev.map((h) =>
            h.id === hostId ? { ...h, default_capabilities: [...selectedCaps] } : h,
          ),
        );
      }
    } catch {
      /* ignore */
    }
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
        setHosts((prev) => prev.map((h) => (h.id === hostId ? { ...h, status: "revoked" } : h)));
      }
    } catch {
      /* ignore */
    } finally {
      setRevoking(null);
    }
  };

  const filters = ["all", "active", "pending", "pending_enrollment", "revoked"];

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Hosts</h1>
          <p className="mt-0.5 text-[13px] text-foreground/40">
            Agent host environments and their configurations
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-px rounded-md border border-border bg-card overflow-hidden">
            {filters.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`cursor-pointer px-2.5 py-1.5 text-[11px] font-medium rounded-none transition-all ${
                  filter === f
                    ? "bg-foreground text-background"
                    : "text-foreground/40 hover:text-foreground hover:bg-foreground/[0.05]"
                }`}
              >
                {f === "pending_enrollment" ? "enrolling" : f}
              </button>
            ))}
          </div>
          <button
            onClick={handleConnectHost}
            disabled={creatingHost}
            className="cursor-pointer flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium rounded-lg bg-foreground text-background transition-all hover:opacity-90 disabled:opacity-50"
          >
            {creatingHost ? (
              <Spinner />
            ) : (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            )}
            Connect Host
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner />
        </div>
      ) : hosts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 border border-border rounded-lg border-dashed">
          <div className="h-10 w-10 rounded-lg bg-foreground/[0.04] flex items-center justify-center mb-4">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-foreground/25"
            >
              <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
              <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
              <line x1="6" y1="6" x2="6.01" y2="6" />
              <line x1="6" y1="18" x2="6.01" y2="18" />
            </svg>
          </div>
          <h3 className="text-[13px] font-medium text-foreground/60">No hosts found</h3>
          <p className="mt-1 text-[12px] text-foreground/35">
            Hosts are created when agents register from new environments.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          {hosts.map((host, idx) => {
            const isExpanded = expanded === host.id;

            return (
              <div key={host.id} className={idx > 0 ? "border-t border-border" : ""}>
                <button
                  onClick={() => setExpanded(isExpanded ? null : host.id)}
                  className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left hover:bg-foreground/[0.02] transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium truncate">
                        {host.name ?? host.id.slice(0, 12) + "..."}
                      </span>
                      <StatusBadge status={host.status} />
                    </div>
                    <p className="mt-1 text-[11px] text-foreground/35 font-mono">
                      {host.default_capabilities.length > 0
                        ? `${host.default_capabilities.length} default capabilities`
                        : "No default capabilities"}
                      {" \u00b7 "}
                      {timeAgo(host.created_at)}
                    </p>
                  </div>
                  <svg
                    className={`h-3.5 w-3.5 shrink-0 text-foreground/25 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>

                {isExpanded && (
                  <div className="border-t border-border px-4 py-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                      <MetaItem label="Host ID">
                        <code className="text-[11px] font-mono break-all">{host.id}</code>
                      </MetaItem>
                      <MetaItem label="Name">{host.name ?? "\u2014"}</MetaItem>
                      <MetaItem label="Last Used">{timeAgo(host.last_used_at)}</MetaItem>
                      <MetaItem label="Activated">
                        {host.activated_at
                          ? new Date(host.activated_at).toLocaleString()
                          : "\u2014"}
                      </MetaItem>
                      <MetaItem label="Expires">
                        {host.expires_at ? new Date(host.expires_at).toLocaleString() : "Never"}
                      </MetaItem>
                      <MetaItem label="Updated">{timeAgo(host.updated_at)}</MetaItem>
                    </div>

                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-semibold text-foreground/40 uppercase tracking-wider">
                          Default Capabilities
                        </span>
                        {editingHost === host.id ? (
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => saveCaps(host.id)}
                              disabled={savingCaps}
                              className="cursor-pointer px-2.5 py-1 text-[11px] font-medium rounded-md bg-foreground text-background transition-all hover:opacity-90 disabled:opacity-50"
                            >
                              {savingCaps ? "Saving..." : "Save"}
                            </button>
                            <button
                              onClick={() => setEditingHost(null)}
                              className="cursor-pointer px-2.5 py-1 text-[11px] font-medium rounded-md border border-border text-foreground/50 transition-colors hover:bg-foreground/[0.05]"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : host.status === "active" ? (
                          <button
                            onClick={() => startEditingCaps(host)}
                            className="cursor-pointer px-2.5 py-1 text-[11px] font-medium rounded-md border border-border text-foreground/40 transition-colors hover:text-foreground hover:bg-foreground/[0.05]"
                          >
                            Edit
                          </button>
                        ) : null}
                      </div>
                      {editingHost === host.id ? (
                        loadingCaps ? (
                          <div className="flex justify-center py-5">
                            <Spinner />
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1 max-h-52 overflow-y-auto">
                            {availableCaps.map((cap) => {
                              const isSelected = selectedCaps.has(cap.name);
                              return (
                                <label
                                  key={cap.name}
                                  className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer rounded-md transition-all ${
                                    isSelected
                                      ? "bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50"
                                      : "bg-foreground/[0.02] border border-border hover:bg-foreground/[0.04]"
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
                                    className="h-3.5 w-3.5 rounded accent-emerald-500"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <code className="text-[11px] font-mono text-foreground/60 truncate block">
                                      {cap.name}
                                    </code>
                                    {cap.description && (
                                      <p className="text-[11px] text-foreground/30 truncate mt-0.5">
                                        {cap.description}
                                      </p>
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
                            <div
                              key={cap}
                              className="rounded-md bg-foreground/[0.02] border border-border px-3 py-2.5"
                            >
                              <code className="text-[11px] font-mono text-foreground/50">
                                {cap}
                              </code>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[12px] text-foreground/30 py-2">
                          No default capabilities set.
                        </p>
                      )}
                    </div>

                    {host.status === "active" && (
                      <button
                        onClick={() => handleRevoke(host.id)}
                        disabled={revoking === host.id}
                        className="cursor-pointer px-3 py-1.5 text-[12px] font-medium rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 text-red-500 transition-all hover:bg-red-100 dark:hover:bg-red-950/50 disabled:opacity-50"
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

      {enrollModal && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={() => setEnrollModal(null)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="w-full max-w-lg rounded-lg border border-border bg-card shadow-xl animate-fade-in"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-5 pt-5 pb-3">
                <div className="flex items-center gap-3 mb-1">
                  <div className="h-9 w-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-emerald-500"
                    >
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-[14px] font-semibold">Connect a Host</h2>
                    <p className="text-[12px] text-foreground/40">
                      Paste this message to your AI agent
                    </p>
                  </div>
                </div>
              </div>

              <div className="px-5 pb-3">
                <div className="relative group">
                  <div className="rounded-md bg-foreground/[0.03] border border-border p-3.5 font-mono text-[12px] text-foreground/70 leading-relaxed break-all select-all">
                    {enrollCommand}
                  </div>
                  <button
                    onClick={copyToClipboard}
                    className="cursor-pointer absolute top-2.5 right-2.5 p-1.5 rounded-md bg-background border border-border text-foreground/40 hover:text-foreground transition-all opacity-0 group-hover:opacity-100"
                  >
                    {copied ? (
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-emerald-500"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    )}
                  </button>
                </div>

                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-foreground/35 font-mono">
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  Token expires{" "}
                  {enrollModal.expiresAt
                    ? new Date(enrollModal.expiresAt).toLocaleString()
                    : "in 1 hour"}
                </div>
              </div>

              <div className="border-t border-border px-5 py-3.5 flex justify-end gap-2">
                <button
                  onClick={() => setEnrollModal(null)}
                  className="cursor-pointer px-3 py-2 text-[13px] font-medium rounded-md border border-border text-foreground/50 transition-colors hover:bg-foreground/[0.05]"
                >
                  Close
                </button>
                <button
                  onClick={copyToClipboard}
                  className="cursor-pointer flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium rounded-md bg-foreground text-background transition-all hover:opacity-90"
                >
                  {copied ? (
                    <>
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Copied
                    </>
                  ) : (
                    <>
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                      Copy to Clipboard
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MetaItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-md bg-foreground/[0.02] border border-border px-3 py-2.5">
      <span className="text-[9px] font-semibold uppercase tracking-wider text-foreground/30">
        {label}
      </span>
      <div className="text-[12px] text-foreground/60">{children}</div>
    </div>
  );
}
