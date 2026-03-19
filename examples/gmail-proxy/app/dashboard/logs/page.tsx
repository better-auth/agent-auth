"use client";

import { useState, useEffect, useCallback } from "react";

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

function EventTypeBadge({ type }: { type: string }) {
  return (
    <span className="inline-flex items-center rounded-md bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-500">
      {type}
    </span>
  );
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

const EVENT_CATEGORIES = [
  { label: "All", value: "" },
  { label: "Agent", prefix: "agent." },
  { label: "Host", prefix: "host." },
  { label: "Capability", prefix: "capability." },
  { label: "CIBA", prefix: "ciba." },
];

function formatTimestamp(ts: string) {
  const d = new Date(ts + "Z");
  if (isNaN(d.getTime())) return ts;
  const now = Date.now();
  const diff = now - d.getTime();
  const seconds = Math.floor(diff / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;

  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [expandedLog, setExpandedLog] = useState<number | null>(null);
  const pageSize = 30;

  const fetchLogs = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(page * pageSize),
      });
      if (category) params.set("type", category);

      const res = await fetch(`/api/logs?${params}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs ?? []);
        setTotal(data.total ?? 0);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [category, page]);

  useEffect(() => {
    setLoading(true);
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLogs]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-6">
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-medium text-gray-900">Event Logs</h1>
            <p className="mt-0.5 text-[13px] text-gray-500">
              Audit trail of agent, host, and capability events.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`cursor-pointer flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors ${
                autoRefresh
                  ? "border-gray-300 text-gray-700 bg-gray-50"
                  : "border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${autoRefresh ? "bg-emerald-500 animate-pulse" : "bg-gray-300"}`}
              />
              {autoRefresh ? "Live" : "Auto-refresh"}
            </button>
            <button
              onClick={() => {
                setLoading(true);
                fetchLogs();
              }}
              className="cursor-pointer rounded-md border border-gray-200 px-3 py-1.5 text-[12px] font-medium text-gray-500 transition-colors hover:text-gray-700 hover:bg-gray-50"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="flex gap-0.5 rounded-lg border border-gray-200 bg-white p-0.5">
          {EVENT_CATEGORIES.map((cat) => (
            <button
              key={cat.label}
              onClick={() => {
                setCategory(cat.prefix ?? "");
                setPage(0);
              }}
              className={`cursor-pointer rounded-md px-3 py-1 text-[12px] font-medium transition-colors ${
                category === (cat.prefix ?? "")
                  ? "bg-gray-900 text-white"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 py-12">
            <p className="text-sm text-gray-500">No events yet</p>
            <p className="mt-1 text-xs text-gray-400">
              Events will appear here as agents interact with the system.
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              {logs.map((log) => {
                const isExpanded = expandedLog === log.id;
                return (
                  <button
                    key={log.id}
                    onClick={() => setExpandedLog(isExpanded ? null : log.id)}
                    className="cursor-pointer flex flex-col w-full rounded-lg border border-gray-200 bg-white text-left transition-colors hover:bg-gray-50/60"
                  >
                    <div className="flex items-center gap-2.5 px-3.5 py-2.5">
                      <EventTypeBadge type={log.type} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2.5">
                          {!!log.data?.capability && (
                            <code className="text-[12px] font-mono text-gray-700">
                              {String(log.data.capability)}
                            </code>
                          )}
                          {log.agentId && (
                            <span className="text-[12px] text-gray-400 truncate">
                              agent:{" "}
                              <code className="text-gray-600">{log.agentId.slice(0, 8)}…</code>
                            </span>
                          )}
                          {log.hostId && (
                            <span className="text-[12px] text-gray-400 truncate">
                              host: <code className="text-gray-600">{log.hostId.slice(0, 8)}…</code>
                            </span>
                          )}
                          {log.actorId && (
                            <span className="text-[12px] text-gray-400 truncate">
                              by <code className="text-gray-600">{log.actorId.slice(0, 8)}…</code>
                            </span>
                          )}
                        </div>
                        {!!log.data?.reason && (
                          <p className="text-[11px] text-gray-400 italic mt-0.5 truncate">
                            &ldquo;{String(log.data.reason)}&rdquo;
                          </p>
                        )}
                      </div>
                      <span className="text-[11px] text-gray-400 shrink-0">
                        {formatTimestamp(log.createdAt)}
                      </span>
                    </div>
                    {isExpanded && log.data && (
                      <div className="border-t border-gray-100 px-3.5 py-2.5">
                        <pre className="text-[12px] font-mono text-gray-500 whitespace-pre-wrap break-all">
                          {JSON.stringify(log.data, null, 2)}
                        </pre>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-[12px] text-gray-400">{total} total events</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(Math.max(0, page - 1))}
                    disabled={page === 0}
                    className="cursor-pointer rounded-md border border-gray-200 px-3 py-1 text-[12px] font-medium text-gray-500 transition-colors hover:text-gray-700 hover:bg-gray-50 disabled:opacity-30 disabled:pointer-events-none"
                  >
                    Previous
                  </button>
                  <span className="text-[12px] text-gray-400">
                    {page + 1} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                    disabled={page >= totalPages - 1}
                    className="cursor-pointer rounded-md border border-gray-200 px-3 py-1 text-[12px] font-medium text-gray-500 transition-colors hover:text-gray-700 hover:bg-gray-50 disabled:opacity-30 disabled:pointer-events-none"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
