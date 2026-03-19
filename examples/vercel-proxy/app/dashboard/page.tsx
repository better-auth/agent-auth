"use client";

import { useSession } from "@/lib/auth-client";
import { useEffect, useState } from "react";

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={copy}
      className="cursor-pointer rounded px-2 py-1 text-xs text-muted transition-colors hover:text-white"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

interface Stats {
  totalAgents: number;
  activeAgents: number;
  pendingAgents: number;
  totalHosts: number;
  recentLogs: number;
}

export default function DashboardOverview() {
  const { data: session } = useSession();
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        const [agentsRes, hostsRes, logsRes] = await Promise.all([
          fetch("/api/auth/agent/list"),
          fetch("/api/auth/host/list"),
          fetch("/api/logs?limit=1"),
        ]);
        const agents = agentsRes.ok ? await agentsRes.json() : { agents: [] };
        const hosts = hostsRes.ok ? await hostsRes.json() : { hosts: [] };
        const logs = logsRes.ok ? await logsRes.json() : { total: 0 };

        setStats({
          totalAgents: agents.agents?.length ?? 0,
          activeAgents:
            agents.agents?.filter((a: { status: string }) => a.status === "active").length ?? 0,
          pendingAgents:
            agents.agents?.filter((a: { status: string }) => a.status === "pending").length ?? 0,
          totalHosts: hosts.hosts?.length ?? 0,
          recentLogs: logs.total ?? 0,
        });
      } catch {
        /* ignore */
      }
    }
    fetchStats();
  }, []);

  const endpoints = [
    {
      label: "Agent Config",
      path: "/api/auth/agent/agent-configuration",
    },
    { label: "Capabilities", path: "/api/auth/capability/list" },
    { label: "Register Agent", path: "/api/auth/agent/register" },
    { label: "Execute", path: "/api/auth/capability/execute" },
  ];

  const statCards = [
    { label: "Total Agents", value: stats?.totalAgents ?? "—" },
    {
      label: "Active",
      value: stats?.activeAgents ?? "—",
      color: "text-emerald-400",
    },
    {
      label: "Pending",
      value: stats?.pendingAgents ?? "—",
      color: "text-amber-400",
    },
    { label: "Hosts", value: stats?.totalHosts ?? "—" },
    { label: "Events", value: stats?.recentLogs ?? "—" },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="text-lg font-semibold text-white">Overview</h1>
          <p className="mt-1 text-sm text-muted">
            Your Vercel account is connected. AI agents can access resources through Agent Auth.
          </p>
        </div>

        <div className="grid grid-cols-5 gap-3">
          {statCards.map((s) => (
            <div key={s.label} className="rounded-lg border border-border bg-surface px-4 py-3">
              <p className="text-xs text-muted">{s.label}</p>
              <p className={`mt-1 text-xl font-semibold ${s.color ?? "text-white"}`}>{s.value}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted">Account</h2>
          <div className="rounded-lg border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="text-sm text-muted">Email</span>
              <span className="text-sm text-foreground">{session?.user.email}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-muted">User ID</span>
              <div className="flex items-center gap-1">
                <code className="font-mono text-xs text-foreground">{session?.user.id}</code>
                <CopyButton value={session?.user.id ?? ""} />
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted">
            Agent Auth Endpoints
          </h2>
          <div className="rounded-lg border border-border bg-surface">
            {endpoints.map((ep, i) => (
              <div
                key={ep.path}
                className={`flex items-center justify-between px-4 py-3 ${
                  i < endpoints.length - 1 ? "border-b border-border" : ""
                }`}
              >
                <span className="text-sm text-muted">{ep.label}</span>
                <div className="flex items-center gap-1">
                  <code className="font-mono text-xs text-foreground/70">{ep.path}</code>
                  <CopyButton value={`${baseUrl}${ep.path}`} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted">Quick Start</h2>
          <div className="rounded-lg border border-border bg-surface p-4">
            <pre className="overflow-x-auto font-mono text-xs leading-6 text-foreground/80">
              <code>{`# Discover this provider
curl ${baseUrl}/api/auth/agent/agent-configuration

# List available capabilities
curl ${baseUrl}/api/auth/capability/list`}</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
