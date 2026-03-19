"use client";

import { signIn, signOut, useSession } from "@/lib/auth-client";
import { useEffect, useState, useCallback } from "react";
import { startAuthentication } from "@simplewebauthn/browser";

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

function VercelLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 76 65"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
    </svg>
  );
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg className={`animate-spin h-4 w-4 ${className ?? ""}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

interface AgentInfo {
  agent: {
    id: string;
    name: string;
    status: string;
    mode: string;
    hostId: string;
    createdAt: string;
  };
  host: { id: string; name: string | null; status: string } | null;
  grants: Array<{
    id: string;
    capability: string;
    status: string;
    reason: string | null;
    constraints: Record<string, unknown> | null;
  }>;
  needsActivation?: boolean;
  isClaim?: boolean;
  approvalContext?: "host_approval" | "new_scopes" | "agent_creation";
  webauthn?: {
    enabled: boolean;
    hasPasskeys: boolean;
    required: boolean;
  };
}

export default function DeviceCapabilities({ agentId, code }: { agentId?: string; code?: string }) {
  const { data: session, isPending: sessionPending } = useSession();
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionState, setActionState] = useState<
    "idle" | "approving" | "confirming_deny" | "denying" | "done" | "reauth_required"
  >("idle");
  const [denyReason, setDenyReason] = useState("");
  const [result, setResult] = useState<{
    status: string;
    added?: string[];
    claimed?: boolean;
  } | null>(null);
  const [reauthInfo, setReauthInfo] = useState<{
    max_age: number;
    session_age: number;
  } | null>(null);

  const fetchAgentInfo = useCallback(async () => {
    if (!agentId) return;
    try {
      const res = await fetch(`/api/device/info?agent_id=${agentId}`);
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to load agent info");
        return;
      }
      setAgentInfo(await res.json());
    } catch {
      setError("Failed to load agent info");
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    if (session && agentId) {
      fetchAgentInfo();
    } else if (!sessionPending && !session) {
      setLoading(false);
    }
  }, [session, sessionPending, agentId, fetchAgentInfo]);

  const handleAction = async (
    action: "approve" | "deny",
    webauthnResponse?: Record<string, unknown>,
  ) => {
    setActionState(action === "approve" ? "approving" : "denying");
    try {
      const body: Record<string, unknown> = {
        agent_id: agentId,
        action,
      };
      if (webauthnResponse) {
        body.webauthn_response = webauthnResponse;
      }
      if (code) body.user_code = code;
      if (action === "deny" && denyReason.trim()) {
        body.reason = denyReason.trim();
      }
      const res = await fetch("/api/auth/agent/approve-capability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      const errorCode = data.error;
      const errorMessage = data.error_description ?? "Action failed";

      // Check body-level codes first (Better Auth may return 200 for error responses)
      if (errorCode === "fresh_session_required") {
        setReauthInfo({
          max_age: data.max_age,
          session_age: data.session_age,
        });
        setActionState("reauth_required");
        return;
      }

      if (errorCode === "webauthn_required" && data.webauthn_options) {
        try {
          const assertion = await startAuthentication({
            optionsJSON: data.webauthn_options,
          });
          await handleAction("approve", assertion as unknown as Record<string, unknown>);
        } catch (webauthnErr) {
          const msg =
            webauthnErr instanceof Error
              ? webauthnErr.message
              : "WebAuthn authentication was cancelled or failed.";
          setError(msg);
          setActionState("idle");
        }
        return;
      }

      if (errorCode === "webauthn_not_enrolled") {
        setError(
          "You need to register a passkey (fingerprint/face) before you can approve these capabilities. Go to your account settings to add one.",
        );
        setActionState("idle");
        return;
      }

      if (!res.ok || errorCode) {
        setError(errorMessage);
        setActionState("idle");
        return;
      }

      setResult(data);
      setActionState("done");
    } catch {
      setError("Failed to process action");
      setActionState("idle");
    }
  };

  const handleReauth = () => {
    const params = new URLSearchParams();
    if (agentId) params.set("agent_id", agentId);
    if (code) params.set("code", code);
    const callbackURL = `/device/capabilities?${params.toString()}`;
    signOut({
      fetchOptions: {
        onSuccess: () => {
          signIn.oauth2({
            providerId: "vercel-mcp",
            callbackURL,
          });
        },
      },
    });
  };

  if (!sessionPending && !session) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-white/3 blur-[120px]" />
        </div>

        <main className="relative z-10 flex w-full max-w-sm flex-col items-center gap-8 px-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex items-center gap-3">
              <VercelLogo className="h-5 w-5 text-white" />
              <div className="h-4 w-px bg-border" />
              <span className="text-xs font-medium uppercase tracking-wider text-muted">
                Device Authorization
              </span>
            </div>
            <h1 className="text-xl font-semibold text-white">Sign in to continue</h1>
            <p className="max-w-xs text-sm leading-relaxed text-muted">
              An agent is requesting access to your Vercel resources. Sign in to review and approve.
            </p>
            {code && (
              <div className="mt-2 rounded-lg border border-border bg-surface px-8 py-4">
                <p className="text-[10px] uppercase tracking-widest text-muted mb-2">
                  Verification Code
                </p>
                <p className="font-mono text-3xl font-bold tracking-[0.3em] text-white">{code}</p>
              </div>
            )}
          </div>

          <button
            onClick={() => {
              const params = new URLSearchParams();
              if (agentId) params.set("agent_id", agentId);
              if (code) params.set("code", code);
              signIn.oauth2({
                providerId: "vercel-mcp",
                callbackURL: `/device/capabilities?${params.toString()}`,
              });
            }}
            className="group flex h-11 w-full cursor-pointer items-center justify-center gap-2.5 rounded-lg bg-white text-sm font-medium text-black transition-all hover:bg-white/90 active:scale-[0.98]"
          >
            <VercelLogo className="h-3.5 w-3.5" />
            Sign in with Vercel
          </button>

          <p className="text-center text-xs text-muted/50">
            Confirm the code above matches what your agent displayed
          </p>
        </main>
      </div>
    );
  }

  if (sessionPending || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="text-muted" />
      </div>
    );
  }

  if (!agentId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center">
        <div className="flex max-w-sm flex-col items-center gap-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-500/10">
            <svg
              className="h-6 w-6 text-zinc-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"
              />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-white">Missing Parameters</h1>
          <p className="text-sm text-muted">
            This page requires an agent_id parameter. Use the verification link provided by the
            agent.
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center">
        <div className="flex max-w-sm flex-col items-center gap-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
            <svg
              className="h-6 w-6 text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-white">Error</h1>
          <p className="text-sm text-muted">{error}</p>
        </div>
      </div>
    );
  }

  if (actionState === "reauth_required" && reauthInfo) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6">
        <div className="flex max-w-sm flex-col items-center gap-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10">
            <svg
              className="h-7 w-7 text-amber-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">Re-authentication Required</h1>
            <p className="mt-2 text-sm text-muted">
              This approval requires a session less than{" "}
              {reauthInfo.max_age < 60
                ? `${reauthInfo.max_age} seconds`
                : `${Math.floor(reauthInfo.max_age / 60)} minutes`}{" "}
              old. Your current session is{" "}
              {reauthInfo.session_age < 60
                ? `${reauthInfo.session_age} seconds`
                : `${Math.floor(reauthInfo.session_age / 60)} minutes`}{" "}
              old.
            </p>
            <p className="mt-1 text-xs text-muted/60">
              Sign in again to create a fresh session, then you can approve the agent.
            </p>
          </div>
          <button
            onClick={handleReauth}
            className="flex h-11 w-full cursor-pointer items-center justify-center gap-2.5 rounded-lg bg-white text-sm font-medium text-black transition-all hover:bg-white/90 active:scale-[0.98]"
          >
            <VercelLogo className="h-3.5 w-3.5" />
            Re-authenticate with Vercel
          </button>
          <p className="text-xs text-muted/50">
            You&apos;ll be redirected back here after signing in
          </p>
        </div>
      </div>
    );
  }

  if (actionState === "done" && result) {
    const approved = result.status === "approved";
    return (
      <div className="flex min-h-screen flex-col items-center justify-center">
        <div className="flex max-w-sm flex-col items-center gap-6 text-center">
          <div
            className={`flex h-14 w-14 items-center justify-center rounded-full ${approved ? "bg-emerald-500/15" : "bg-red-500/15"}`}
          >
            {approved ? (
              <svg
                className="h-7 w-7 text-emerald-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            ) : (
              <svg
                className="h-7 w-7 text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            )}
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">
              {approved
                ? result.claimed
                  ? "Agent Claimed"
                  : "Access Approved"
                : "Access Denied"}
            </h1>
            <p className="mt-2 text-sm text-muted">
              {approved
                ? result.claimed
                  ? `"${agentInfo?.agent.name}" is now linked to your account. You can close this tab.`
                  : `"${agentInfo?.agent.name}" has been granted access. You can close this tab.`
                : `"${agentInfo?.agent.name}" was denied access. You can close this tab.`}
            </p>
            {approved && !result.claimed && result.added && result.added.length > 0 && (
              <p className="mt-3 text-xs text-muted/60">
                {result.added.length} capability
                {result.added.length !== 1 ? "ies" : ""} granted
              </p>
            )}
            <a
              href="/dashboard/agents"
              className="mt-5 inline-flex items-center gap-1.5 rounded-md bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/15"
            >
              Go to Agents
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </a>
          </div>
        </div>
      </div>
    );
  }

  const isClaim = agentInfo?.isClaim ?? false;
  const pendingGrants = agentInfo?.grants.filter((g) => g.status === "pending") ?? [];
  const activeGrants = isClaim
    ? (agentInfo?.grants.filter((g) => g.status === "active") ?? [])
    : [];
  const displayGrants = isClaim ? activeGrants : pendingGrants;
  const needsActivation = agentInfo?.needsActivation ?? false;

  if (displayGrants.length === 0 && !needsActivation) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center">
        <div className="flex max-w-sm flex-col items-center gap-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-500/10">
            <svg
              className="h-6 w-6 text-zinc-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-white">Already Resolved</h1>
          <p className="text-sm text-muted">
            This agent has no pending capability requests. It may have already been approved or
            denied.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-6">
          <div className="flex items-center gap-3">
            <VercelLogo className="h-5 w-5 text-white" />
            <div className="h-4 w-px bg-border" />
            <span className="text-xs font-medium uppercase tracking-wider text-muted">
              Device Authorization
            </span>
          </div>

          {code && (
            <div className="rounded-lg border border-border bg-surface px-8 py-4 text-center">
              <p className="text-[10px] uppercase tracking-widest text-muted mb-2">
                Verify this code matches your device
              </p>
              <p className="font-mono text-3xl font-bold tracking-[0.3em] text-white">{code}</p>
            </div>
          )}

          <div className="w-full rounded-xl border border-border bg-surface overflow-hidden">
            <div className="border-b border-border px-5 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-medium text-white">{agentInfo?.agent.name}</h2>
                  <p className="mt-0.5 text-xs text-muted">
                    Agent
                    {agentInfo?.host?.name && ` via ${agentInfo.host.name}`}
                  </p>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    isClaim
                      ? "bg-blue-500/10 text-blue-400"
                      : "bg-amber-500/10 text-amber-400"
                  }`}
                >
                  {isClaim ? "Autonomous" : "Pending"}
                </span>
              </div>
            </div>

            <div className="px-5 py-4">
              {displayGrants.length > 0 ? (
                <>
                  <p className="mb-3 text-[10px] font-medium uppercase tracking-widest text-muted">
                    {isClaim
                      ? `Active Capabilities (${displayGrants.length})`
                      : `Requested Capabilities (${displayGrants.length})`}
                  </p>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto">
                    {displayGrants.map((g) => (
                      <div
                        key={g.id}
                        className="rounded-lg border border-border/50 bg-background px-3 py-2.5"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-blue-500/10">
                            <svg
                              className="h-3.5 w-3.5 text-blue-400"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M13 10V3L4 14h7v7l9-11h-7z"
                              />
                            </svg>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-mono text-xs text-foreground">
                              {g.capability}
                            </p>
                            {g.reason && (
                              <p className="text-[11px] text-muted truncate">{g.reason}</p>
                            )}
                          </div>
                        </div>
                        {g.constraints && Object.keys(g.constraints).length > 0 && (
                          <div className="mt-2 ml-9 flex flex-wrap gap-1.5">
                            {Object.entries(g.constraints).map(([field, value]) => (
                              <span
                                key={field}
                                className="inline-flex items-center rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-300"
                              >
                                {field}: {formatConstraintValue(value)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted">
                  {isClaim
                    ? "This autonomous agent is requesting to be claimed. Approve to take ownership."
                    : "This agent is requesting access to your account. No specific capabilities have been requested yet — they can be granted later."}
                </p>
              )}
            </div>

            <div className="border-t border-border px-5 py-4">
              {agentInfo?.webauthn?.required && (
                <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                  <svg
                    className="h-4 w-4 shrink-0 text-amber-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4"
                    />
                  </svg>
                  <p className="text-xs text-amber-300">
                    {agentInfo.approvalContext === "host_approval"
                      ? "New host connection — biometric verification (fingerprint/Face ID) required."
                      : "New capability request — biometric verification (fingerprint/Face ID) required."}
                  </p>
                </div>
              )}
              {actionState === "confirming_deny" ? (
                <div className="flex flex-col gap-3">
                  <input
                    type="text"
                    placeholder="Reason for denying (optional)"
                    value={denyReason}
                    onChange={(e) => setDenyReason(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted/50 outline-none focus:border-foreground/20"
                    autoFocus
                  />
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setActionState("idle");
                        setDenyReason("");
                      }}
                      className="flex h-10 flex-1 cursor-pointer items-center justify-center rounded-lg border border-border text-sm font-medium text-muted transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleAction("deny")}
                      className="flex h-10 flex-1 cursor-pointer items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/20 disabled:pointer-events-none disabled:opacity-50"
                    >
                      Deny Access
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3">
                  <button
                    onClick={() => setActionState("confirming_deny")}
                    disabled={actionState !== "idle"}
                    className="flex h-10 flex-1 cursor-pointer items-center justify-center rounded-lg border border-border text-sm font-medium text-muted transition-colors hover:border-red-500/30 hover:text-red-400 disabled:pointer-events-none disabled:opacity-50"
                  >
                    Deny
                  </button>
                  <button
                    onClick={() => handleAction("approve")}
                    disabled={actionState !== "idle"}
                    className="flex h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg bg-white text-sm font-medium text-black transition-all hover:bg-white/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
                  >
                    {actionState === "approving" ? (
                      <Spinner />
                    ) : (
                      <>
                        {agentInfo?.webauthn?.required && (
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4"
                            />
                          </svg>
                        )}
                        {isClaim ? "Approve & Claim" : "Approve"}
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-muted/50">Signed in as {session?.user.email}</p>
      </div>
    </div>
  );
}
