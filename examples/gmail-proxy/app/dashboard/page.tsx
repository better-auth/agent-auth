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
      className="cursor-pointer rounded-md px-2 py-0.5 text-[12px] text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700"
    >
      {copied ? "Copied!" : "Copy"}
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
    { label: "Agent Config", path: "/api/auth/agent/agent-configuration" },
    { label: "Capabilities", path: "/api/auth/capability/list" },
    { label: "Register Agent", path: "/api/auth/agent/register" },
    { label: "Execute", path: "/api/auth/capability/execute" },
  ];

  const statCards = [
    { label: "Total Agents", value: stats?.totalAgents ?? "—" },
    { label: "Active", value: stats?.activeAgents ?? "—" },
    { label: "Pending", value: stats?.pendingAgents ?? "—" },
    { label: "Hosts", value: stats?.totalHosts ?? "—" },
    { label: "Events", value: stats?.recentLogs ?? "—" },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-6">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-lg font-medium text-gray-900">Overview</h1>
          <p className="mt-0.5 text-[13px] text-gray-500">
            Your Google account is connected. AI agents can access Gmail through Agent Auth.
          </p>
        </div>

        <div className="grid grid-cols-5 gap-2">
          {statCards.map((s) => (
            <div key={s.label} className="rounded-xl border border-gray-200 bg-white px-3.5 py-3">
              <p className="text-[11px] text-gray-400">{s.label}</p>
              <p className="mt-0.5 text-xl font-medium text-gray-900">{s.value}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
            Account
          </h2>
          <div className="rounded-xl border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
              <span className="text-[13px] text-gray-500">Email</span>
              <span className="text-[13px] text-gray-900">{session?.user.email}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-[13px] text-gray-500">User ID</span>
              <div className="flex items-center gap-1">
                <code className="font-mono text-[12px] text-gray-700">{session?.user.id}</code>
                <CopyButton value={session?.user.id ?? ""} />
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
            Agent Auth Endpoints
          </h2>
          <div className="rounded-xl border border-gray-200 bg-white">
            {endpoints.map((ep, i) => (
              <div
                key={ep.path}
                className={`flex items-center justify-between px-4 py-2.5 ${
                  i < endpoints.length - 1 ? "border-b border-gray-100" : ""
                }`}
              >
                <span className="text-[13px] text-gray-500">{ep.label}</span>
                <div className="flex items-center gap-1">
                  <code className="font-mono text-[12px] text-gray-700">{ep.path}</code>
                  <CopyButton value={`${baseUrl}${ep.path}`} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
            Quick Start
          </h2>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <pre className="overflow-x-auto font-mono text-[12px] leading-5 text-gray-700">
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
