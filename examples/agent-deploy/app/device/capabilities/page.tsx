"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { signIn, signUp, useSession } from "@/lib/auth-client";
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
  claim?: {
    claimTarget: string;
    claimTargetName: string;
  };
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
  if (ops.max !== undefined) parts.push(`\u2264 ${ops.max}`);
  if (ops.min !== undefined) parts.push(`\u2265 ${ops.min}`);
  return parts.join(", ") || JSON.stringify(value);
}

function Spinner() {
  return (
    <div className="h-4 w-4 rounded-full border-2 border-foreground/10 border-t-foreground/60 animate-spin" />
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
    claimed?: boolean;
  } | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [signInError, setSignInError] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

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

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setSignInError("");
    setSigningIn(true);
    try {
      if (isSignUp) {
        const result = await signUp.email({ email, password, name });
        if (result.error) {
          setSignInError(result.error.message ?? "Failed to create account");
        }
      } else {
        const result = await signIn.email({ email, password });
        if (result.error) {
          setSignInError(result.error.message ?? "Invalid credentials");
        }
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

  if (!sessionPending && !session) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="rounded-lg border border-border bg-card shadow-md p-6 space-y-5">
            <div className="text-center space-y-2.5">
              <AgentAuthLogo className="h-[14px] w-auto mx-auto" />
              <div className="space-y-1">
                <h1 className="text-[18px] font-semibold tracking-tight">Authorize Agent</h1>
                <p className="text-[13px] text-foreground/40">
                  {isSignUp
                    ? "Create an account to review and approve this agent\u2019s request."
                    : "Sign in to review and approve this agent\u2019s request."}
                </p>
              </div>
            </div>

            {code && (
              <div className="p-3.5 rounded-md border border-border bg-foreground/[0.02] text-center">
                <span className="text-[9px] font-semibold text-foreground/35 tracking-wider uppercase">
                  Verification Code
                </span>
                <p className="mt-1.5 text-[20px] font-mono font-bold tracking-[0.3em]">{code}</p>
              </div>
            )}

            <form onSubmit={handleAuth} className="space-y-3.5">
              {isSignUp && (
                <div className="space-y-1.5">
                  <label className="text-[12px] font-medium text-foreground/50 uppercase tracking-wider">
                    Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-md bg-background border border-border placeholder:text-foreground/25 focus:border-foreground/20 focus:ring-1 focus:ring-foreground/[0.08] text-[13px] outline-none transition-all"
                    placeholder="Your name"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-foreground/50 uppercase tracking-wider">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-md bg-background border border-border placeholder:text-foreground/25 focus:border-foreground/20 focus:ring-1 focus:ring-foreground/[0.08] text-[13px] outline-none transition-all"
                  placeholder="you@example.com"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-foreground/50 uppercase tracking-wider">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-md bg-background border border-border placeholder:text-foreground/25 focus:border-foreground/20 focus:ring-1 focus:ring-foreground/[0.08] text-[13px] outline-none transition-all"
                  placeholder={isSignUp ? "Create a password" : "Your password"}
                />
              </div>

              {signInError && (
                <div className="px-3 py-2 rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 text-red-500 text-[13px]">
                  {signInError}
                </div>
              )}

              <button
                type="submit"
                disabled={signingIn}
                className="w-full py-2 text-[13px] font-medium rounded-md bg-foreground text-background hover:opacity-90 transition-all disabled:opacity-50 cursor-pointer active:scale-[0.98]"
              >
                {signingIn
                  ? isSignUp ? "Creating account..." : "Signing in..."
                  : isSignUp ? "Create Account & Review" : "Sign In & Review"}
              </button>
            </form>

            <div className="text-center space-y-2">
              <p className="text-[12px] text-foreground/40">
                {isSignUp ? "Already have an account?" : "Don\u2019t have an account?"}{" "}
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUp(!isSignUp);
                    setSignInError("");
                  }}
                  className="text-foreground/70 hover:text-foreground font-medium underline underline-offset-2 transition-colors cursor-pointer"
                >
                  {isSignUp ? "Sign in" : "Create one"}
                </button>
              </p>
              <p className="text-[11px] text-foreground/30">
                Confirm the code above matches what your AI agent is showing.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (sessionPending || loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!agentId) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm text-center space-y-3">
          <div className="h-10 w-10 rounded-lg bg-foreground/[0.04] flex items-center justify-center mx-auto">
            <AgentAuthLogo className="h-[14px] w-auto opacity-25" />
          </div>
          <h1 className="text-[15px] font-semibold tracking-tight">Missing Parameters</h1>
          <p className="text-[13px] text-foreground/40">
            This page requires an agent_id parameter. Use the verification link provided by the
            agent.
          </p>
        </div>
      </div>
    );
  }

  if (error && !agentInfo) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm text-center space-y-3">
          <div className="h-10 w-10 rounded-lg bg-red-50 dark:bg-red-950/30 flex items-center justify-center mx-auto">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-red-500"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <h1 className="text-[15px] font-semibold tracking-tight">Error</h1>
          <p className="text-[13px] text-foreground/40">{error}</p>
        </div>
      </div>
    );
  }

  if (actionState === "done" && result) {
    const approved = result.status === "approved";
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm text-center space-y-5">
          <div
            className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${
              approved ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-red-50 dark:bg-red-950/30"
            }`}
          >
            {approved ? (
              <svg
                className="h-5 w-5 text-emerald-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg
                className="h-5 w-5 text-red-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
          </div>
          <div className="space-y-1.5">
            <h1 className="text-[18px] font-semibold tracking-tight">
              {approved
                ? result.claimed
                  ? "Project Claimed"
                  : "Access Approved"
                : "Access Denied"}
            </h1>
            <p className="text-[13px] text-foreground/40">
              {approved
                ? result.claimed
                  ? `You now own the sites created by "${agentInfo?.claim?.claimTargetName ?? agentInfo?.agent.name}". You can close this tab.`
                  : `"${agentInfo?.agent.name}" has been granted access. You can close this tab.`
                : `"${agentInfo?.agent.name}" was denied access. You can close this tab.`}
            </p>
            {approved && !result.claimed && result.added && result.added.length > 0 && (
              <p className="text-[11px] text-foreground/30 pt-1 font-mono">
                {result.added.length} capability
                {result.added.length !== 1 ? "ies" : ""} granted
              </p>
            )}
          </div>
          <a
            href="/dashboard"
            className="inline-flex items-center px-4 py-2 text-[13px] font-medium rounded-md bg-foreground text-background hover:opacity-90 transition-all"
          >
            Go to Dashboard
          </a>
        </div>
      </div>
    );
  }

  const isClaim = !!agentInfo?.claim;
  const pendingGrants = agentInfo?.grants.filter((g) => g.status === "pending") ?? [];
  const activeGrants = isClaim
    ? (agentInfo?.grants.filter((g) => g.status === "active") ?? [])
    : [];
  const displayGrants = isClaim ? activeGrants : pendingGrants;
  const needsActivation = agentInfo?.needsActivation ?? false;

  if (displayGrants.length === 0 && !needsActivation) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm text-center space-y-3">
          <div className="h-10 w-10 rounded-lg bg-foreground/[0.04] flex items-center justify-center mx-auto">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-foreground/25"
            >
              <path d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-[15px] font-semibold tracking-tight">Already Resolved</h1>
          <p className="text-[13px] text-foreground/40">
            This agent has no pending capability requests. It may have already been approved or
            denied.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col items-center px-4 py-12 overflow-y-auto">
      <div className="w-full max-w-md my-auto">
        <div className="rounded-lg border border-border bg-card shadow-md overflow-hidden">
          <div className="text-center px-5 pt-5 pb-3 space-y-2.5">
            <AgentAuthLogo className="h-[14px] w-auto mx-auto" />
            <div className="space-y-1">
              <h1 className="text-[18px] font-semibold tracking-tight">
                {agentInfo?.claim ? "Claim Agent Project" : "Authorize Agent"}
              </h1>
              <p className="text-[13px] text-foreground/40">
                {agentInfo?.claim
                  ? "An AI agent created this project. Approve to take ownership."
                  : "Review the capabilities this agent is requesting."}
              </p>
            </div>
          </div>

          {agentInfo?.claim && (
            <div className="mx-5 p-3.5 rounded-md border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50 dark:bg-indigo-950/20 space-y-1.5">
              <div className="flex items-center gap-2">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-indigo-500 flex-shrink-0"
                >
                  <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                  <path d="M12 16v-4" />
                  <path d="M12 8h.01" />
                </svg>
                <span className="text-[13px] font-medium text-indigo-600 dark:text-indigo-300">
                  Agent &ldquo;{agentInfo.claim.claimTargetName}&rdquo; created this project
                </span>
              </div>
              <p className="text-[11px] text-indigo-500/70 dark:text-indigo-400/70">
                When you approve, all sites and activity from this agent will be transferred to your
                account.
              </p>
            </div>
          )}

          {code && (
            <div className="mx-5 mt-3 p-3.5 rounded-md border border-border bg-foreground/[0.02] text-center">
              <span className="text-[9px] font-semibold text-foreground/35 tracking-wider uppercase">
                Verification Code
              </span>
              <p className="mt-1.5 text-[20px] font-mono font-bold tracking-[0.3em]">{code}</p>
            </div>
          )}

          <div className="mx-5 my-3 rounded-md border border-border overflow-hidden">
            <div className="px-3.5 py-2.5 flex items-center justify-between bg-foreground/[0.02]">
              <div>
                <p className="text-[13px] font-medium">{agentInfo?.agent.name}</p>
                <p className="text-[11px] text-foreground/35 font-mono mt-0.5">
                  {agentInfo?.host?.name ?? "Unknown host"}
                  {" \u00b7 "}
                  {agentInfo?.agent.mode}
                </p>
              </div>
              <span
                className={`text-[10px] font-medium rounded-full px-2 py-px ${
                  isClaim
                    ? "text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/50"
                    : "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50"
                }`}
              >
                {isClaim ? "Autonomous" : "Pending"}
              </span>
            </div>

            {displayGrants.length > 0 && (
              <div className="px-3.5 py-3 space-y-2.5 border-t border-border">
                <span className="text-[9px] font-semibold text-foreground/35 tracking-wider uppercase">
                  {isClaim
                    ? `Active Capabilities (${displayGrants.length})`
                    : `Requested Capabilities (${displayGrants.length})`}
                </span>

                <div className="space-y-1.5">
                  {displayGrants.map((g) => (
                    <div
                      key={g.id}
                      className="p-2.5 rounded-md border border-border bg-foreground/[0.02] space-y-1.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <code className="text-[11px] font-mono font-medium">{g.capability}</code>
                      </div>
                      {g.reason && (
                        <p className="text-[11px] text-foreground/40 italic">
                          &ldquo;{g.reason}&rdquo;
                        </p>
                      )}
                      {g.constraints && Object.keys(g.constraints).length > 0 && (
                        <div className="space-y-1 pt-0.5">
                          <span className="text-[9px] font-semibold text-foreground/25 tracking-wider uppercase">
                            Constraints
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(g.constraints).map(([field, value]) => (
                              <span
                                key={field}
                                className="inline-flex items-center gap-0.5 text-[10px] font-mono rounded bg-foreground/[0.04] border border-border px-1.5 py-px text-foreground/45"
                              >
                                <span className="text-foreground/30">{field}:</span>{" "}
                                {formatConstraintValue(value)}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="mx-5 mb-3">
              <div className="px-3 py-2 rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 text-red-500 text-[13px]">
                {error}
              </div>
            </div>
          )}

          <div className="px-5 py-3.5 border-t border-border bg-foreground/[0.02]">
            {actionState === "confirming_deny" ? (
              <div className="space-y-2.5">
                <input
                  type="text"
                  placeholder="Reason for denying (optional)"
                  value={denyReason}
                  onChange={(e) => setDenyReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-md bg-background border border-border placeholder:text-foreground/25 focus:border-foreground/20 focus:ring-1 focus:ring-foreground/[0.08] text-[13px] outline-none transition-all"
                  autoFocus
                />
                <div className="flex gap-1.5">
                  <button
                    onClick={() => {
                      setActionState("idle");
                      setDenyReason("");
                    }}
                    className="flex-1 py-2 text-[13px] font-medium rounded-md border border-border hover:bg-foreground/[0.05] transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleAction("deny")}
                    className="flex-1 py-2 text-[13px] font-medium rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 text-red-500 hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors cursor-pointer"
                  >
                    Confirm Deny
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-1.5">
                <button
                  onClick={() => setActionState("confirming_deny")}
                  disabled={actionState !== "idle"}
                  className="flex-1 py-2 text-[13px] font-medium rounded-md border border-border hover:border-red-200 dark:hover:border-red-900/50 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all disabled:opacity-50 cursor-pointer"
                >
                  Deny
                </button>
                <button
                  onClick={() => handleAction("approve")}
                  disabled={actionState !== "idle"}
                  className="flex-1 py-2 text-[13px] font-medium rounded-md bg-foreground text-background hover:opacity-90 transition-all disabled:opacity-50 cursor-pointer active:scale-[0.98]"
                >
                  {actionState === "approving" ? (
                    <span className="flex items-center justify-center gap-1.5">
                      <Spinner /> {agentInfo?.claim ? "Claiming..." : "Approving..."}
                    </span>
                  ) : agentInfo?.claim ? (
                    "Approve & Claim"
                  ) : (
                    "Approve"
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-[11px] text-foreground/25 mt-3 font-mono">
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
