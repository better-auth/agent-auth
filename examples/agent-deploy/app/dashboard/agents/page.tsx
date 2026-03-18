"use client";

import { useState, useEffect, useCallback } from "react";

interface GrantData {
  capability: string;
  status: string;
  granted_by?: string | null;
  expires_at?: string | null;
  constraints?: Record<string, unknown> | null;
}

interface AgentData {
  agent_id: string;
  name: string;
  status: string;
  mode: string;
  host_id: string;
  agent_capability_grants: GrantData[];
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
}

interface LogEntry {
  id: number;
  type: string;
  actorId: string | null;
  actorType: string | null;
  agentId: string | null;
  hostId: string | null;
  data: Record<string, unknown> | null;
  createdAt: string;
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
  expired: "bg-foreground/[0.06] text-foreground/40 ring-foreground/[0.08]",
  revoked: "bg-red-500/15 text-red-600 dark:text-red-400 ring-red-500/20",
  rejected: "bg-red-500/15 text-red-600 dark:text-red-400 ring-red-500/20",
  claimed: "bg-sky-500/15 text-sky-600 dark:text-sky-400 ring-sky-500/20",
};

const defaultStatusStyle = "bg-foreground/[0.06] text-foreground/40 ring-foreground/[0.08]";

function StatusBadge({ status }: { status: string }) {
  const style = statusStyles[status] ?? defaultStatusStyle;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-mono ring-1 ${style}`}>
      {status}
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

const eventCategoryStyles: Record<string, string> = {
  agent: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  host: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  capability: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  ciba: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
};

function formatEventMessage(log: LogEntry): string {
  const action = log.type.split(".").pop() ?? log.type;
  const capability = log.data && "capability" in log.data ? String(log.data.capability) : null;
  const messages: Record<string, string> = {
    registered: "Agent registered",
    connected: "Connected to host",
    revoked: "Agent access revoked",
    granted: capability ? `Granted "${capability}"` : "Capability granted",
    requested: capability ? `Requested "${capability}"` : "Capability requested",
    executed: capability ? `Executed "${capability}"` : "Capability executed",
    denied: capability ? `Denied "${capability}"` : "Capability denied",
    approved: capability ? `Approved "${capability}"` : "Capability approved",
  };
  return messages[action] ?? log.type.replace(/\./g, " ");
}

function AgentActivityLog({ agentId }: { agentId: string }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedLog, setExpandedLog] = useState<number | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      const params = new URLSearchParams({ agent_id: agentId, limit: "50" });
      const res = await fetch(`/api/logs?${params}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs ?? []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Spinner />
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10">
        <p className="text-[11px] font-mono text-foreground/30">No activity recorded yet</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {logs.map((log) => {
        const isExpanded = expandedLog === log.id;
        const category = log.type.split(".")[0];
        const catStyle = eventCategoryStyles[category] ?? "bg-foreground/[0.04] text-foreground/40";
        return (
          <button
            key={log.id}
            onClick={() => setExpandedLog(isExpanded ? null : log.id)}
            className="cursor-pointer w-full text-left"
          >
            <div className={`border border-foreground/[0.06] transition-colors ${isExpanded ? "bg-foreground/[0.03] border-foreground/[0.10]" : "hover:bg-foreground/[0.02]"}`}>
              <div className="flex items-center gap-3 px-3 py-2">
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-mono ${catStyle}`}>
                  {category}
                </span>
                <span className="flex-1 text-[11px] font-mono text-foreground/60 truncate">
                  {formatEventMessage(log)}
                </span>
                <span className="text-[10px] font-mono text-foreground/25 shrink-0 tabular-nums">
                  {timeAgo(log.createdAt)}
                </span>
              </div>
              {isExpanded && log.data && (
                <div className="border-t border-foreground/[0.06] px-3 py-2.5">
                  <pre className="text-[10px] font-mono text-foreground/40 whitespace-pre-wrap break-all max-h-40 overflow-y-auto leading-relaxed">
                    {JSON.stringify(log.data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function formatConstraintValue(value: unknown): string {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return String(value);
  }
  const ops = value as Record<string, unknown>;
  const parts: string[] = [];
  if (ops.eq !== undefined) parts.push(`${ops.eq}`);
  if (ops.in !== undefined && Array.isArray(ops.in)) {
    const items = ops.in.map(String);
    parts.push(items.length === 1 ? `only ${items[0]}` : `only ${items.join(" or ")}`);
  }
  if (ops.not_in !== undefined && Array.isArray(ops.not_in)) {
    const items = ops.not_in.map(String);
    parts.push(`not ${items.join(" or ")}`);
  }
  if (ops.max !== undefined) parts.push(`at most ${ops.max}`);
  if (ops.min !== undefined) parts.push(`at least ${ops.min}`);
  return parts.join(", ") || JSON.stringify(value);
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("active");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Record<string, "details" | "activity">>({});
  const [revoking, setRevoking] = useState<string | null>(null);
  const [editingAgent, setEditingAgent] = useState<string | null>(null);
  const [availableCaps, setAvailableCaps] = useState<{ name: string; description: string }[]>([]);
  const [selectedCaps, setSelectedCaps] = useState<Set<string>>(new Set());
  const [savingCaps, setSavingCaps] = useState(false);
  const [loadingCaps, setLoadingCaps] = useState(false);

  const startEditingCaps = async (agent: AgentData) => {
    setEditingAgent(agent.agent_id);
    setLoadingCaps(true);
    const activeGrants = new Set(
      agent.agent_capability_grants.filter((g) => g.status === "active").map((g) => g.capability),
    );
    setSelectedCaps(activeGrants);
    try {
      const res = await fetch("/api/auth/capability/list?limit=500");
      if (res.ok) {
        const data = await res.json();
        setAvailableCaps(data.capabilities ?? []);
      }
    } catch { /* ignore */ }
    setLoadingCaps(false);
  };

  const saveCaps = async (agentId: string) => {
    setSavingCaps(true);
    const agent = agents.find((a) => a.agent_id === agentId);
    const currentActive = new Set(
      agent?.agent_capability_grants.filter((g) => g.status === "active").map((g) => g.capability) ?? [],
    );
    const toGrant = [...selectedCaps].filter((c) => !currentActive.has(c));
    try {
      if (toGrant.length > 0) {
        await fetch("/api/auth/agent/grant-capability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agent_id: agentId, capabilities: toGrant }),
        });
      }
      const params = filter !== "all" ? `?status=${filter}` : "";
      const listRes = await fetch(`/api/auth/agent/list${params}`);
      if (listRes.ok) {
        const data = await listRes.json();
        setAgents(data.agents ?? []);
      }
    } catch { /* ignore */ }
    setSavingCaps(false);
    setEditingAgent(null);
  };

  useEffect(() => {
    setLoading(true);
    const params = filter !== "all" ? `?status=${filter}` : "";
    fetch(`/api/auth/agent/list${params}`)
      .then((r) => (r.ok ? r.json() : { agents: [] }))
      .then((data) => setAgents(data.agents ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filter]);

  const handleRevoke = async (agentId: string) => {
    setRevoking(agentId);
    try {
      const res = await fetch("/api/auth/agent/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: agentId }),
      });
      if (res.ok) {
        setAgents((prev) =>
          prev.map((a) => (a.agent_id === agentId ? { ...a, status: "revoked" } : a)),
        );
      }
    } catch {
      /* ignore */
    } finally {
      setRevoking(null);
    }
  };

  const filters = ["all", "active", "pending", "rejected", "expired", "revoked"];

  return (
    <div className="px-5 sm:px-6 lg:px-8 py-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Agents</h1>
            <p className="mt-1 text-[11px] font-mono text-foreground/35">
              {loading ? "Loading..." : `${agents.length} agent${agents.length !== 1 ? "s" : ""} connected`}
            </p>
          </div>
          <div className="flex gap-0.5 border border-foreground/[0.08] bg-foreground/[0.02] p-0.5">
            {filters.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`cursor-pointer px-3 py-1.5 text-[10px] font-mono capitalize transition-all ${
                  filter === f
                    ? "bg-foreground text-background"
                    : "text-foreground/40 hover:text-foreground/70 hover:bg-foreground/[0.04]"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Spinner />
          </div>
        ) : agents.length === 0 ? (
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
                <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground/50">No agents found</p>
              <p className="mt-1 text-xs text-foreground/30">
                Agents will appear here once they connect.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {agents.map((agent) => {
              const isExpanded = expanded === agent.agent_id;
              const activeGrants = agent.agent_capability_grants.filter((g) => g.status === "active");
              const pendingGrants = agent.agent_capability_grants.filter((g) => g.status === "pending");

              return (
                <div
                  key={agent.agent_id}
                  className={`border border-foreground/[0.08] bg-foreground/[0.02] transition-all ${isExpanded ? "border-foreground/[0.14]" : "hover:border-foreground/[0.12]"}`}
                >
                  <button
                    onClick={() => setExpanded(isExpanded ? null : agent.agent_id)}
                    className="flex w-full cursor-pointer items-center gap-4 px-5 py-3.5 text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5">
                        <span className="text-sm font-medium truncate">{agent.name}</span>
                        <StatusBadge status={agent.status} />
                        {agent.mode && (
                          <span className="hidden sm:inline text-[10px] font-mono text-foreground/30 px-1.5 py-0.5 border border-foreground/[0.08]">
                            {agent.mode}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[10px] font-mono text-foreground/30">
                        <span>{activeGrants.length} cap{activeGrants.length !== 1 ? "s" : ""}</span>
                        {pendingGrants.length > 0 && (
                          <>
                            <span className="text-foreground/15">/</span>
                            <span className="text-amber-600 dark:text-amber-400/70">{pendingGrants.length} pending</span>
                          </>
                        )}
                        <span className="text-foreground/15">/</span>
                        <span>{timeAgo(agent.created_at)}</span>
                      </div>
                    </div>
                    <svg
                      className={`h-3.5 w-3.5 shrink-0 text-foreground/25 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-foreground/[0.06]">
                      <div className="flex gap-0 border-b border-foreground/[0.06] px-1">
                        {(["details", "activity"] as const).map((tab) => {
                          const isActive = (activeTab[agent.agent_id] ?? "details") === tab;
                          return (
                            <button
                              key={tab}
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveTab((prev) => ({ ...prev, [agent.agent_id]: tab }));
                              }}
                              className={`cursor-pointer relative px-4 py-2.5 text-[11px] font-mono capitalize transition-colors ${
                                isActive ? "text-foreground" : "text-foreground/35 hover:text-foreground/60"
                              }`}
                            >
                              {tab}
                              {isActive && (
                                <span className="absolute bottom-0 left-2 right-2 h-px bg-foreground" />
                              )}
                            </button>
                          );
                        })}
                      </div>

                      <div className="px-5 py-4 max-h-[420px] overflow-y-auto">
                        {(activeTab[agent.agent_id] ?? "details") === "details" ? (
                          <div className="flex flex-col gap-4">
                            <div className="grid grid-cols-2 gap-2">
                              <MetaItem label="Agent ID">
                                <code className="text-[11px] font-mono break-all">{agent.agent_id}</code>
                              </MetaItem>
                              <MetaItem label="Host ID">
                                <code className="text-[11px] font-mono break-all">{agent.host_id}</code>
                              </MetaItem>
                              <MetaItem label="Last Active">
                                {timeAgo(agent.last_used_at)}
                              </MetaItem>
                              <MetaItem label="Expires">
                                {agent.expires_at
                                  ? new Date(agent.expires_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
                                  : "No expiration"}
                              </MetaItem>
                            </div>

                            <div>
                              <div className="flex items-center justify-between mb-2.5">
                                <span className="text-[10px] font-mono uppercase tracking-wider text-foreground/30">
                                  Capabilities
                                </span>
                                {editingAgent === agent.agent_id ? (
                                  <div className="flex gap-1.5">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); saveCaps(agent.agent_id); }}
                                      disabled={savingCaps}
                                      className="cursor-pointer px-3 py-1 text-[10px] font-mono bg-foreground text-background transition-opacity hover:opacity-90 disabled:opacity-50"
                                    >
                                      {savingCaps ? "Saving..." : "Save"}
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setEditingAgent(null); }}
                                      className="cursor-pointer px-3 py-1 text-[10px] font-mono border border-foreground/[0.10] text-foreground/45 transition-colors hover:text-foreground/70"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); startEditingCaps(agent); }}
                                    className="cursor-pointer px-3 py-1 text-[10px] font-mono border border-foreground/[0.10] text-foreground/40 transition-colors hover:text-foreground/70 hover:bg-foreground/[0.04]"
                                  >
                                    Edit
                                  </button>
                                )}
                              </div>
                              {editingAgent === agent.agent_id ? (
                                loadingCaps ? (
                                  <div className="flex justify-center py-6"><Spinner /></div>
                                ) : (
                                  <div className="flex flex-col gap-1 max-h-60 overflow-y-auto">
                                    {availableCaps.map((cap) => {
                                      const isSelected = selectedCaps.has(cap.name);
                                      const isCurrentlyGranted = agent.agent_capability_grants.some(
                                        (g) => g.capability === cap.name && g.status === "active",
                                      );
                                      return (
                                        <label
                                          key={cap.name}
                                          onClick={(e) => e.stopPropagation()}
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
                                          {isCurrentlyGranted && (
                                            <span className="text-[9px] font-mono text-emerald-600 dark:text-emerald-400">granted</span>
                                          )}
                                        </label>
                                      );
                                    })}
                                  </div>
                                )
                              ) : agent.agent_capability_grants.length > 0 ? (
                                <div className="flex flex-col gap-1">
                                  {agent.agent_capability_grants.map((g, i) => (
                                    <CapabilityRow key={i} grant={g} />
                                  ))}
                                </div>
                              ) : (
                                <p className="text-[11px] font-mono text-foreground/25 py-2">No capabilities granted yet.</p>
                              )}
                            </div>

                            {agent.status === "active" && (
                              <div className="pt-1">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRevoke(agent.agent_id);
                                  }}
                                  disabled={revoking === agent.agent_id}
                                  className="cursor-pointer px-4 py-2 text-[11px] font-mono border border-red-500/15 bg-red-500/5 text-red-600 dark:text-red-400 transition-all hover:bg-red-500/10 hover:border-red-500/25 disabled:opacity-50"
                                >
                                  {revoking === agent.agent_id ? "Revoking..." : "Revoke Agent"}
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <AgentActivityLog agentId={agent.agent_id} />
                        )}
                      </div>
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

function CapabilityRow({ grant }: { grant: GrantData }) {
  const hasConstraints = grant.constraints && Object.keys(grant.constraints).length > 0;
  return (
    <div className="bg-foreground/[0.02] border border-foreground/[0.06] px-3.5 py-2.5 transition-colors hover:bg-foreground/[0.04]">
      <div className="flex items-center gap-3">
        <code className="flex-1 text-[11px] font-mono text-foreground/60 truncate">{grant.capability}</code>
        <StatusBadge status={grant.status} />
      </div>
      {hasConstraints && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {Object.entries(grant.constraints!).map(([field, value]) => (
            <span
              key={field}
              className="inline-flex items-center bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-mono text-sky-600 dark:text-sky-400 border border-sky-500/15"
            >
              {field}: {formatConstraintValue(value)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
