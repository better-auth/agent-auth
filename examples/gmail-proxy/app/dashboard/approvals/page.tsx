"use client";

import { useState, useEffect, useCallback, useRef } from "react";

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

function formatConstraint(field: string, value: unknown): string {
  const label = FIELD_LABELS[field.toLowerCase()] ?? field;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return `${label} is ${String(value)}`;
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

interface ApprovalRequest {
  approval_id: string;
  method: string;
  agent_id: string | null;
  agent_name: string | null;
  binding_message: string | null;
  capabilities: string[];
  capability_constraints: Record<string, Record<string, unknown>> | null;
  capability_reasons: Record<string, string> | null;
  expires_in: number;
  created_at: string;
}

function timeAgo(date: string | null) {
  if (!date) return "Unknown";
  const diff = Date.now() - new Date(date).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const BASE_TITLE = "Approvals";

export default function ApprovalsPage() {
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const prevCountRef = useRef(0);
  const flashIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const updateTabTitle = useCallback((count: number, flash: boolean) => {
    if (flashIntervalRef.current) {
      clearInterval(flashIntervalRef.current);
      flashIntervalRef.current = null;
    }

    if (count === 0) {
      document.title = BASE_TITLE;
      return;
    }

    const title = `(${count}) ${BASE_TITLE}`;
    document.title = title;

    if (flash && document.hidden) {
      let on = true;
      flashIntervalRef.current = setInterval(() => {
        document.title = on ? `🔔 ${title}` : title;
        on = !on;
      }, 1000);
    }
  }, []);

  const fetchRequests = useCallback(async () => {
    try {
      const r = await fetch("/api/auth/agent/ciba/pending");
      if (!r.ok) return;
      const data = await r.json();
      const incoming: ApprovalRequest[] = data.requests ?? [];
      setRequests(incoming);

      const hasNew = incoming.length > prevCountRef.current;
      updateTabTitle(incoming.length, hasNew);
      prevCountRef.current = incoming.length;
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [updateTabTitle]);

  useEffect(() => {
    fetchRequests();
    const interval = setInterval(fetchRequests, 5000);

    const onVisibilityChange = () => {
      if (!document.hidden && flashIntervalRef.current) {
        clearInterval(flashIntervalRef.current);
        flashIntervalRef.current = null;
        const count = prevCountRef.current;
        document.title = count > 0 ? `(${count}) ${BASE_TITLE}` : BASE_TITLE;
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (flashIntervalRef.current) clearInterval(flashIntervalRef.current);
      document.title = BASE_TITLE;
    };
  }, [fetchRequests]);

  const handleAction = async (approvalId: string, action: "approve" | "deny") => {
    setActing(approvalId);
    try {
      const res = await fetch("/api/auth/agent/approve-capability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approval_id: approvalId, action }),
      });
      if (res.ok) {
        setRequests((prev) => prev.filter((r) => r.approval_id !== approvalId));
      }
    } catch {
      /* ignore */
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-6">
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-lg font-medium text-gray-900">Approval Requests</h1>
          <p className="mt-0.5 text-[13px] text-gray-500">
            Pending capability requests from agents awaiting your approval.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner />
          </div>
        ) : requests.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 py-12">
            <p className="text-sm text-gray-500">No pending requests</p>
            <p className="mt-1 text-xs text-gray-400">
              CIBA approval requests will appear here automatically.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {requests.map((req) => (
              <div key={req.approval_id} className="rounded-xl border border-gray-200 bg-white">
                <div className="px-4 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-gray-900">
                          {req.agent_name ?? "Unknown Agent"}
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                          pending
                        </span>
                      </div>
                      {req.binding_message && (
                        <p className="mt-0.5 text-[12px] text-gray-500">{req.binding_message}</p>
                      )}
                      <p className="mt-0.5 text-[11px] text-gray-400">
                        Requested {timeAgo(req.created_at)}
                        {" · "}
                        Expires in {Math.max(0, Math.floor(req.expires_in / 60))}m
                      </p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        onClick={() => handleAction(req.approval_id, "approve")}
                        disabled={acting === req.approval_id}
                        className="cursor-pointer rounded-md bg-gray-900 px-3.5 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
                      >
                        {acting === req.approval_id ? "…" : "Approve"}
                      </button>
                      <button
                        onClick={() => handleAction(req.approval_id, "deny")}
                        disabled={acting === req.approval_id}
                        className="cursor-pointer rounded-md border border-gray-200 px-3.5 py-1.5 text-[12px] font-medium text-gray-500 transition-colors hover:border-red-200 hover:text-red-600 disabled:opacity-50"
                      >
                        Deny
                      </button>
                    </div>
                  </div>

                  {req.capabilities.length > 0 && (
                    <div className="mt-3">
                      <p className="mb-1.5 text-[10px] uppercase tracking-widest text-gray-400">
                        Requested Capabilities
                      </p>
                      <div className="flex flex-col gap-1.5">
                        {req.capabilities.map((cap) => {
                          const capConstraints = req.capability_constraints?.[cap];
                          const capReason = req.capability_reasons?.[cap];
                          return (
                            <div key={cap}>
                              <code className="rounded-md bg-gray-50 px-2 py-0.5 text-[12px] font-mono text-gray-700">
                                {cap}
                              </code>
                              {capReason && (
                                <p className="mt-0.5 ml-2 text-[11px] text-gray-400 italic">
                                  &ldquo;{capReason}&rdquo;
                                </p>
                              )}
                              {capConstraints && Object.keys(capConstraints).length > 0 && (
                                <div className="mt-1 ml-1 space-y-0.5">
                                  {Object.entries(capConstraints).map(([field, value]) => (
                                    <div
                                      key={field}
                                      className="flex items-start gap-1.5 text-[11px] text-gray-500"
                                    >
                                      <svg
                                        className="mt-px h-3 w-3 shrink-0 text-gray-400"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                        strokeWidth={2}
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                                        />
                                      </svg>
                                      <span>{formatConstraint(field, value)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
