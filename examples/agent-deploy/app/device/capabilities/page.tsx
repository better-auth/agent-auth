"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { signIn, useSession } from "@/lib/auth-client";
import { AgentAuthLogo } from "@/components/icons/logo";

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
}

function formatConstraintValue(value: unknown): string {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return String(value);
  }
  const ops = value as Record<string, unknown>;
  const parts: string[] = [];
  if (ops.eq !== undefined) parts.push(`${ops.eq}`);
  if (ops.in !== undefined && Array.isArray(ops.in)) {
    parts.push(`${ops.in.map(String).join(" | ")}`);
  }
  if (ops.not_in !== undefined && Array.isArray(ops.not_in)) {
    parts.push(`not ${ops.not_in.map(String).join(", ")}`);
  }
  if (ops.max !== undefined) parts.push(`≤ ${ops.max}`);
  if (ops.min !== undefined) parts.push(`≥ ${ops.min}`);
  return parts.join(", ") || JSON.stringify(value);
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4 text-foreground/30"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function DeviceCapabilitiesContent() {
  const params = useSearchParams();
  const agentId = params.get("agent_id");
  const code = params.get("code") ?? params.get("user_code") ?? "";

  const { data: session, isPending: sessionPending } = useSession();
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionState, setActionState] = useState<
    "idle" | "approving" | "confirming_deny" | "denying" | "done"
  >("idle");
  const [denyReason, setDenyReason] = useState("");
  const [result, setResult] = useState<{
    status: string;
    added?: string[];
  } | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signInError, setSignInError] = useState("");
  const [signingIn, setSigningIn] = useState(false);

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

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setSignInError("");
    setSigningIn(true);
    try {
      const result = await signIn.email({ email, password });
      if (result.error) {
        setSignInError(result.error.message ?? "Invalid credentials");
      }
    } catch {
      setSignInError("Something went wrong");
    } finally {
      setSigningIn(false);
    }
  }

  const handleAction = async (action: "approve" | "deny") => {
    setActionState(action === "approve" ? "approving" : "denying");
    try {
      const body: Record<string, unknown> = { agent_id: agentId, action };
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
      const errorMessage = data.error_description || data.message || "Action failed";

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

  // ─── Sign-in screen ──────────────────────────────────────────
  if (!sessionPending && !session) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm space-y-8">
          <div className="text-center space-y-4">
            <AgentAuthLogo className="h-6 w-auto mx-auto" />
            <div className="space-y-2">
              <h1 className="text-xl font-semibold tracking-tight">
                Authorize Agent
              </h1>
              <p className="text-sm text-foreground/45">
                Sign in to review and approve this agent&apos;s request.
              </p>
            </div>
          </div>

          {code && (
            <div className="p-4 border border-foreground/[0.08] bg-foreground/[0.02] text-center">
              <span className="text-[10px] font-mono text-foreground/35 tracking-wider uppercase">
                Verification Code
              </span>
              <p className="mt-2 text-2xl font-mono font-semibold tracking-[0.3em]">
                {code}
              </p>
            </div>
          )}

          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono text-foreground/40 tracking-wider uppercase">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2.5 bg-foreground/[0.03] border border-foreground/[0.08] placeholder:text-foreground/25 focus:border-foreground/20 focus:bg-foreground/[0.05] font-mono text-xs outline-none transition-colors"
                placeholder="you@example.com"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-mono text-foreground/40 tracking-wider uppercase">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3 py-2.5 bg-foreground/[0.03] border border-foreground/[0.08] placeholder:text-foreground/25 focus:border-foreground/20 focus:bg-foreground/[0.05] font-mono text-xs outline-none transition-colors"
                placeholder="Your password"
              />
            </div>

            {signInError && (
              <div className="px-3 py-2 border border-destructive/20 bg-destructive/5 text-destructive-foreground text-xs font-mono">
                {signInError}
              </div>
            )}

            <button
              type="submit"
              disabled={signingIn}
              className="w-full py-2.5 text-xs font-mono bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
            >
              {signingIn ? "Signing in..." : "Sign In & Review"}
            </button>
          </form>

          <p className="text-center text-[11px] font-mono text-foreground/30">
            Confirm the code above matches what your AI agent is showing.
          </p>
        </div>
      </div>
    );
  }

  // ─── Loading ─────────────────────────────────────────────────
  if (sessionPending || loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  // ─── Missing agent_id ────────────────────────────────────────
  if (!agentId) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm text-center space-y-4">
          <AgentAuthLogo className="h-6 w-auto mx-auto opacity-30" />
          <h1 className="text-lg font-semibold tracking-tight">
            Missing Parameters
          </h1>
          <p className="text-sm text-foreground/45">
            This page requires an agent_id parameter. Use the verification link
            provided by the agent.
          </p>
        </div>
      </div>
    );
  }

  // ─── Error ───────────────────────────────────────────────────
  if (error && !agentInfo) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm text-center space-y-4">
          <AgentAuthLogo className="h-6 w-auto mx-auto opacity-30" />
          <h1 className="text-lg font-semibold tracking-tight">Error</h1>
          <p className="text-sm text-foreground/45">{error}</p>
        </div>
      </div>
    );
  }

  // ─── Done ────────────────────────────────────────────────────
  if (actionState === "done" && result) {
    const approved = result.status === "approved";
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm text-center space-y-6">
          <div
            className={`mx-auto flex h-14 w-14 items-center justify-center border ${
              approved
                ? "border-success/20 text-success"
                : "border-destructive/20 text-destructive-foreground"
            }`}
          >
            {approved ? (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-semibold tracking-tight">
              {approved ? "Access Approved" : "Access Denied"}
            </h1>
            <p className="text-sm text-foreground/45">
              {approved
                ? `"${agentInfo?.agent.name}" has been granted access. You can close this tab.`
                : `"${agentInfo?.agent.name}" was denied access. You can close this tab.`}
            </p>
            {approved && result.added && result.added.length > 0 && (
              <p className="text-[11px] font-mono text-foreground/30 pt-2">
                {result.added.length} capability
                {result.added.length !== 1 ? "ies" : ""} granted
              </p>
            )}
          </div>
          <a
            href="/dashboard"
            className="inline-flex items-center px-5 py-2.5 text-xs font-mono bg-foreground text-background hover:opacity-90 transition-opacity"
          >
            Go to Dashboard
          </a>
        </div>
      </div>
    );
  }

  // ─── Already resolved ────────────────────────────────────────
  const pendingGrants =
    agentInfo?.grants.filter((g) => g.status === "pending") ?? [];
  const needsActivation = agentInfo?.needsActivation ?? false;

  if (pendingGrants.length === 0 && !needsActivation) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm text-center space-y-4">
          <AgentAuthLogo className="h-6 w-auto mx-auto opacity-30" />
          <h1 className="text-lg font-semibold tracking-tight">
            Already Resolved
          </h1>
          <p className="text-sm text-foreground/45">
            This agent has no pending capability requests. It may have already
            been approved or denied.
          </p>
        </div>
      </div>
    );
  }

  // ─── Approval view ───────────────────────────────────────────
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center space-y-4">
          <AgentAuthLogo className="h-6 w-auto mx-auto" />
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight">
              Authorize Agent
            </h1>
            <p className="text-sm text-foreground/45">
              Review the capabilities this agent is requesting.
            </p>
          </div>
        </div>

        {/* Verification code */}
        {code && (
          <div className="p-4 border border-foreground/[0.08] bg-foreground/[0.02] text-center">
            <span className="text-[10px] font-mono text-foreground/35 tracking-wider uppercase">
              Verification Code
            </span>
            <p className="mt-2 text-2xl font-mono font-semibold tracking-[0.3em]">
              {code}
            </p>
          </div>
        )}

        {/* Agent info card */}
        <div className="border border-foreground/[0.08] divide-y divide-foreground/[0.06]">
          {/* Agent header */}
          <div className="px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{agentInfo?.agent.name}</p>
              <p className="text-[11px] font-mono text-foreground/35 mt-0.5">
                {agentInfo?.host?.name ?? "Unknown host"}
                {" · "}
                {agentInfo?.agent.mode}
              </p>
            </div>
            <span className="text-[9px] font-mono text-foreground/50 border border-foreground/[0.08] px-2 py-0.5 uppercase tracking-wider">
              Pending
            </span>
          </div>

          {/* Capabilities */}
          {pendingGrants.length > 0 && (
            <div className="px-4 py-3 space-y-3">
              <span className="text-[10px] font-mono text-foreground/35 tracking-wider uppercase">
                Requested Capabilities ({pendingGrants.length})
              </span>

              <div className="space-y-2">
                {pendingGrants.map((g) => (
                  <div
                    key={g.id}
                    className="p-3 border border-foreground/[0.06] bg-foreground/[0.02] space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <code className="text-xs font-mono font-medium">
                        {g.capability}
                      </code>
                      <span className="text-[9px] font-mono text-foreground/30 shrink-0 border border-foreground/[0.06] px-1.5 py-0.5">
                        pending
                      </span>
                    </div>
                    {g.reason && (
                      <p className="text-[11px] text-foreground/40 italic">
                        &ldquo;{g.reason}&rdquo;
                      </p>
                    )}
                    {g.constraints &&
                      Object.keys(g.constraints).length > 0 && (
                        <div className="space-y-1 pt-1">
                          <span className="text-[9px] font-mono text-foreground/25 tracking-wider uppercase">
                            Constraints
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {Object.entries(g.constraints).map(
                              ([field, value]) => (
                                <span
                                  key={field}
                                  className="inline-flex items-center gap-1 text-[10px] font-mono bg-foreground/[0.04] border border-foreground/[0.06] px-2 py-0.5 text-foreground/50"
                                >
                                  <span className="text-foreground/30">
                                    {field}:
                                  </span>{" "}
                                  {formatConstraintValue(value)}
                                </span>
                              ),
                            )}
                          </div>
                        </div>
                      )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error inline */}
          {error && (
            <div className="px-4 py-2">
              <div className="px-3 py-2 border border-destructive/20 bg-destructive/5 text-destructive-foreground text-xs font-mono">
                {error}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="px-4 py-3">
            {actionState === "confirming_deny" ? (
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Reason for denying (optional)"
                  value={denyReason}
                  onChange={(e) => setDenyReason(e.target.value)}
                  className="w-full px-3 py-2.5 bg-foreground/[0.03] border border-foreground/[0.08] placeholder:text-foreground/25 focus:border-foreground/20 focus:bg-foreground/[0.05] font-mono text-xs outline-none transition-colors"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setActionState("idle");
                      setDenyReason("");
                    }}
                    className="flex-1 py-2.5 text-xs font-mono border border-foreground/[0.08] text-foreground/50 hover:bg-foreground/[0.04] transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleAction("deny")}
                    className="flex-1 py-2.5 text-xs font-mono border border-destructive/20 bg-destructive/5 text-destructive-foreground hover:bg-destructive/10 transition-colors cursor-pointer"
                  >
                    Confirm Deny
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => setActionState("confirming_deny")}
                  disabled={actionState !== "idle"}
                  className="flex-1 py-2.5 text-xs font-mono border border-foreground/[0.08] text-foreground/50 hover:border-destructive/20 hover:text-destructive-foreground hover:bg-destructive/5 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Deny
                </button>
                <button
                  onClick={() => handleAction("approve")}
                  disabled={actionState !== "idle"}
                  className="flex-1 py-2.5 text-xs font-mono bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
                >
                  {actionState === "approving" ? (
                    <span className="flex items-center justify-center gap-2">
                      <Spinner /> Approving...
                    </span>
                  ) : (
                    "Approve"
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-[11px] font-mono text-foreground/25">
          Signed in as {session?.user.email}
        </p>
      </div>
    </div>
  );
}

export default function DeviceCapabilitiesPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh flex items-center justify-center">
          <Spinner />
        </div>
      }
    >
      <DeviceCapabilitiesContent />
    </Suspense>
  );
}
