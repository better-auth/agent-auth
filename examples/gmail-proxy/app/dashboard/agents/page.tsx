"use client";

import { useState, useEffect, useCallback } from "react";

const statusColors: Record<string, { dot: string; bg: string; text: string }> = {
  active: { dot: "bg-emerald-500", bg: "bg-gray-50", text: "text-gray-600" },
  pending: { dot: "bg-amber-400", bg: "bg-gray-50", text: "text-gray-600" },
  expired: { dot: "bg-gray-300", bg: "bg-gray-50", text: "text-gray-400" },
  revoked: { dot: "bg-red-400", bg: "bg-gray-50", text: "text-gray-600" },
  rejected: { dot: "bg-red-400", bg: "bg-gray-50", text: "text-gray-600" },
  claimed: { dot: "bg-blue-400", bg: "bg-gray-50", text: "text-gray-600" },
  denied: { dot: "bg-red-400", bg: "bg-gray-50", text: "text-gray-600" },
};

const defaultStatusColor = { dot: "bg-gray-300", bg: "bg-gray-50", text: "text-gray-400" };

function StatusBadge({ status }: { status: string }) {
  const c = statusColors[status] ?? defaultStatusColor;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${c.bg} ${c.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {status}
    </span>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 text-gray-400" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function AgentIcon() {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100">
      <svg
        className="h-4 w-4 text-gray-500"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
        />
      </svg>
    </div>
  );
}

interface GrantData {
  capability: string;
  status: string;
  reason?: string | null;
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
  host_name: string | null;
  agent_capability_grants: GrantData[];
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
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

const eventCategoryColors: Record<string, string> = {
  agent: "bg-gray-400",
  host: "bg-gray-400",
  capability: "bg-gray-400",
  ciba: "bg-gray-400",
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
      <div className="flex items-center justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <p className="text-xs text-gray-400">No activity recorded yet</p>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col">
      <div className="absolute left-[11px] top-2 bottom-2 w-px bg-gray-100" />
      {logs.map((log) => {
        const isExpanded = expandedLog === log.id;
        const category = log.type.split(".")[0];
        const dotColor = eventCategoryColors[category] ?? "bg-gray-300";
        const logConstraints = log.data?.constraints as Record<string, unknown> | null | undefined;
        const hasConstraints =
          logConstraints &&
          typeof logConstraints === "object" &&
          Object.keys(logConstraints).length > 0;
        return (
          <button
            key={log.id}
            onClick={() => setExpandedLog(isExpanded ? null : log.id)}
            className="cursor-pointer relative flex w-full text-left group"
          >
            <div className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center">
              <span className={`h-2 w-2 rounded-full ring-2 ring-white ${dotColor}`} />
            </div>
            <div
              className={`flex-1 ml-0.5 mb-1 rounded-lg border border-transparent transition-colors ${isExpanded ? "bg-gray-50 border-gray-100" : "group-hover:bg-gray-50/60"}`}
            >
              <div className="px-2.5 py-1.5">
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-[12px] text-gray-700">
                    {formatEventMessage(log)}
                  </span>
                  <span className="text-[11px] text-gray-400 shrink-0 tabular-nums">
                    {timeAgo(log.createdAt)}
                  </span>
                </div>
                {!!log.data?.reason && (
                  <p className="text-[11px] text-gray-400 italic mt-0.5 truncate">
                    &ldquo;{String(log.data.reason)}&rdquo;
                  </p>
                )}
                {hasConstraints && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {Object.entries(logConstraints!).map(([field, value]) => (
                      <span
                        key={field}
                        className="inline-flex items-center gap-0.5 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500"
                      >
                        <svg
                          className="h-2.5 w-2.5 shrink-0 text-gray-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z"
                          />
                        </svg>
                        {formatConstraintValue(field, value)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {isExpanded && log.data && (
                <div className="border-t border-gray-100 px-2.5 py-2">
                  <pre className="text-[11px] font-mono text-gray-400 whitespace-pre-wrap break-all max-h-40 overflow-y-auto leading-relaxed">
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

function MetaItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg bg-gray-50 px-3 py-2">
      <span className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">
        {label}
      </span>
      <div className="text-[12px] text-gray-700">{children}</div>
    </div>
  );
}

const FIELD_LABELS: Record<string, string> = {
  to: "Recipients",
  from: "Sender",
  cc: "CC",
  bcc: "BCC",
  subject: "Subject",
  body: "Body",
  amount: "Amount",
  url: "URL",
  path: "Path",
  method: "Method",
};

function formatConstraintValue(field: string, value: unknown): string {
  const label = FIELD_LABELS[field.toLowerCase()] ?? field;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return `${label}: ${String(value)}`;
  }
  const ops = value as Record<string, unknown>;
  const parts: string[] = [];
  if (ops.eq !== undefined) parts.push(`must be "${ops.eq}"`);
  if (ops.in !== undefined && Array.isArray(ops.in)) {
    const items = ops.in.map(String);
    parts.push(items.length === 1 ? `limited to ${items[0]}` : `limited to ${items.join(", ")}`);
  }
  if (ops.not_in !== undefined && Array.isArray(ops.not_in)) {
    const items = ops.not_in.map(String);
    parts.push(items.length === 1 ? `excludes ${items[0]}` : `excludes ${items.join(", ")}`);
  }
  if (ops.max !== undefined && ops.min !== undefined) {
    parts.push(`between ${ops.min} and ${ops.max}`);
  } else {
    if (ops.max !== undefined) parts.push(`at most ${ops.max}`);
    if (ops.min !== undefined) parts.push(`at least ${ops.min}`);
  }
  return parts.length > 0 ? `${label} ${parts.join(", ")}` : `${label}: ${JSON.stringify(value)}`;
}

function ConstraintBadges({ constraints }: { constraints: Record<string, unknown> }) {
  const entries = Object.entries(constraints);
  if (entries.length === 0) return null;
  return (
    <div className="mt-1 ml-8 flex flex-wrap gap-1">
      {entries.map(([field, value]) => (
        <span
          key={field}
          className="inline-flex items-center gap-0.5 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500"
        >
          <svg
            className="h-2.5 w-2.5 shrink-0 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z"
            />
          </svg>
          {formatConstraintValue(field, value)}
        </span>
      ))}
    </div>
  );
}

function CapabilityRow({ grant }: { grant: GrantData }) {
  const hasConstraints = grant.constraints && Object.keys(grant.constraints).length > 0;
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2 group transition-colors hover:bg-gray-100/80">
      <div className="flex items-center gap-2.5">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-gray-200/60">
          <svg
            className="h-3 w-3 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"
            />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <code className="text-[12px] font-mono text-gray-700 truncate block">
            {grant.capability}
          </code>
          {grant.reason && (
            <p className="text-[11px] text-gray-400 italic truncate mt-0.5">
              &ldquo;{grant.reason}&rdquo;
            </p>
          )}
        </div>
        <StatusBadge status={grant.status} />
      </div>
      {hasConstraints && <ConstraintBadges constraints={grant.constraints!} />}
    </div>
  );
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
    } catch {
      /* ignore */
    }
    setLoadingCaps(false);
  };

  const saveCaps = async (agentId: string) => {
    setSavingCaps(true);
    const agent = agents.find((a) => a.agent_id === agentId);
    const currentActive = new Set(
      agent?.agent_capability_grants
        .filter((g) => g.status === "active")
        .map((g) => g.capability) ?? [],
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
    } catch {
      /* ignore */
    }
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

  const filters = ["all", "active", "pending", "expired", "revoked"];
  const filteredCount = agents.length;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-6">
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-medium text-gray-900">Agents</h1>
            <p className="mt-0.5 text-[13px] text-gray-500">
              {loading
                ? "Loading agents..."
                : `${filteredCount} agent${filteredCount !== 1 ? "s" : ""} connected`}
            </p>
          </div>
          <div className="flex gap-0.5 rounded-lg border border-gray-200 bg-white p-0.5">
            {filters.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`cursor-pointer rounded-md px-3 py-1 text-[12px] font-medium capitalize transition-all ${
                  filter === f
                    ? "bg-gray-900 text-white"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner />
          </div>
        ) : agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 py-14">
            <p className="text-sm text-gray-500">No agents found</p>
            <p className="mt-1 text-xs text-gray-400">Agents will appear here once they connect.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {agents.map((agent) => {
              const isExpanded = expanded === agent.agent_id;
              const activeGrants = agent.agent_capability_grants.filter(
                (g) => g.status === "active",
              );
              const pendingGrants = agent.agent_capability_grants.filter(
                (g) => g.status === "pending",
              );

              return (
                <div
                  key={agent.agent_id}
                  className={`rounded-xl border border-gray-200 bg-white transition-all ${isExpanded ? "ring-1 ring-gray-200" : ""}`}
                >
                  <button
                    onClick={() => setExpanded(isExpanded ? null : agent.agent_id)}
                    className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left"
                  >
                    <AgentIcon />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-gray-900 truncate">
                          {agent.name}
                        </span>
                        <StatusBadge status={agent.status} />
                        {agent.mode && (
                          <span className="hidden sm:inline-flex rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                            {agent.mode}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-gray-400">
                        <span>
                          {activeGrants.length} capabilit{activeGrants.length !== 1 ? "ies" : "y"}
                        </span>
                        {pendingGrants.length > 0 && (
                          <>
                            <span>·</span>
                            <span className="text-amber-500">{pendingGrants.length} pending</span>
                          </>
                        )}
                        <span>·</span>
                        <span>{timeAgo(agent.created_at)}</span>
                      </div>
                    </div>
                    <svg
                      className={`h-4 w-4 shrink-0 text-gray-300 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
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
                    <div className="border-t border-gray-100">
                      <div className="flex gap-0 border-b border-gray-100 px-1">
                        {(["details", "activity"] as const).map((tab) => {
                          const isActive = (activeTab[agent.agent_id] ?? "details") === tab;
                          return (
                            <button
                              key={tab}
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveTab((prev) => ({ ...prev, [agent.agent_id]: tab }));
                              }}
                              className={`cursor-pointer relative px-3.5 py-2 text-[12px] font-medium capitalize transition-colors ${
                                isActive ? "text-gray-900" : "text-gray-400 hover:text-gray-600"
                              }`}
                            >
                              {tab}
                              {isActive && (
                                <span className="absolute bottom-0 left-1.5 right-1.5 h-0.5 rounded-full bg-gray-900" />
                              )}
                            </button>
                          );
                        })}
                      </div>

                      <div className="px-4 py-3 max-h-[400px] overflow-y-auto">
                        {(activeTab[agent.agent_id] ?? "details") === "details" ? (
                          <div className="flex flex-col gap-3">
                            <div className="grid grid-cols-2 gap-1.5">
                              <MetaItem label="Agent ID">
                                <code className="text-[11px] font-mono break-all">
                                  {agent.agent_id}
                                </code>
                              </MetaItem>
                              <MetaItem label="Host">
                                {agent.host_name ?? (
                                  <code className="text-[11px] font-mono break-all">
                                    {agent.host_id}
                                  </code>
                                )}
                              </MetaItem>
                              <MetaItem label="Last Active">{timeAgo(agent.last_used_at)}</MetaItem>
                              <MetaItem label="Expires">
                                {agent.expires_at
                                  ? new Date(agent.expires_at).toLocaleDateString(undefined, {
                                      month: "short",
                                      day: "numeric",
                                      year: "numeric",
                                    })
                                  : "No expiration"}
                              </MetaItem>
                            </div>

                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">
                                  Capabilities
                                </span>
                                {editingAgent === agent.agent_id ? (
                                  <div className="flex gap-1.5">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        saveCaps(agent.agent_id);
                                      }}
                                      disabled={savingCaps}
                                      className="cursor-pointer rounded-md bg-gray-900 px-2.5 py-1 text-[11px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                                    >
                                      {savingCaps ? "Saving..." : "Save"}
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingAgent(null);
                                      }}
                                      className="cursor-pointer rounded-md border border-gray-200 px-2.5 py-1 text-[11px] font-medium text-gray-500 transition-colors hover:text-gray-700"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      startEditingCaps(agent);
                                    }}
                                    className="cursor-pointer rounded-md border border-gray-200 px-2.5 py-1 text-[11px] font-medium text-gray-500 transition-colors hover:text-gray-700 hover:bg-gray-50"
                                  >
                                    Edit
                                  </button>
                                )}
                              </div>
                              {editingAgent === agent.agent_id ? (
                                loadingCaps ? (
                                  <div className="flex justify-center py-4">
                                    <Spinner />
                                  </div>
                                ) : (
                                  <div className="flex flex-col gap-1 max-h-56 overflow-y-auto">
                                    {availableCaps.map((cap) => {
                                      const isSelected = selectedCaps.has(cap.name);
                                      const isCurrentlyGranted = agent.agent_capability_grants.some(
                                        (g) => g.capability === cap.name && g.status === "active",
                                      );
                                      return (
                                        <label
                                          key={cap.name}
                                          onClick={(e) => e.stopPropagation()}
                                          className={`flex items-center gap-2.5 rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                                            isSelected
                                              ? "bg-gray-100"
                                              : "bg-gray-50 hover:bg-gray-100/60"
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
                                            className="h-3.5 w-3.5 rounded accent-gray-700"
                                          />
                                          <div className="flex-1 min-w-0">
                                            <code className="text-[12px] font-mono text-gray-700 truncate block">
                                              {cap.name}
                                            </code>
                                            {cap.description && (
                                              <p className="text-[11px] text-gray-400 truncate">
                                                {cap.description}
                                              </p>
                                            )}
                                          </div>
                                          {isCurrentlyGranted && (
                                            <span className="text-[10px] text-emerald-600 font-medium">
                                              granted
                                            </span>
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
                                <p className="text-xs text-gray-400 py-2">
                                  No capabilities granted yet.
                                </p>
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
                                  className="cursor-pointer rounded-md border border-red-200 px-3.5 py-1.5 text-[12px] font-medium text-red-600 transition-all hover:bg-red-50 disabled:opacity-50"
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
