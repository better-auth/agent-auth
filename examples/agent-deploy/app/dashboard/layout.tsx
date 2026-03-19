"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "@/lib/auth-client";
import { AgentAuthLogo } from "@/components/icons/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { useCallback, useEffect, useRef, useState } from "react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Sites", exact: true },
  { href: "/dashboard/agents", label: "Agents" },
  { href: "/dashboard/hosts", label: "Hosts" },
];

interface PendingApproval {
  approval_id: string;
  method: string;
  agent_id: string | null;
  agent_name: string | null;
  binding_message: string | null;
  capabilities: string[];
  capability_constraints: Record<string, unknown> | null;
  capability_reasons: Record<string, string> | null;
  expires_in: number;
  created_at: string;
}

function ApprovalNotification({ session }: { session: { user: { id: string; email: string } } }) {
  const [pending, setPending] = useState<PendingApproval[]>([]);
  const [open, setOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState(false);
  const prevCountRef = useRef(0);

  const fetchPending = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/agent/ciba/pending");
      if (res.ok) {
        const data = await res.json();
        const requests: PendingApproval[] = data.requests ?? [];
        setPending(requests);

        if (requests.length > prevCountRef.current && prevCountRef.current >= 0) {
          setFlash(true);
          setTimeout(() => setFlash(false), 2000);
        }
        prevCountRef.current = requests.length;
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    fetchPending();
    const interval = setInterval(fetchPending, 8000);
    return () => clearInterval(interval);
  }, [fetchPending]);

  const handleAction = async (
    approvalId: string,
    agentId: string | null,
    action: "approve" | "deny",
  ) => {
    setActionLoading(`${approvalId}-${action}`);
    try {
      const body: Record<string, unknown> = { action };
      if (approvalId) body.approval_id = approvalId;
      if (agentId) body.agent_id = agentId;

      const res = await fetch("/api/auth/agent/approve-capability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setPending((prev) => prev.filter((p) => p.approval_id !== approvalId));
      }
    } catch {
      /* ignore */
    } finally {
      setActionLoading(null);
    }
  };

  const count = pending.length;

  return (
    <div className="relative">
      <button
        onClick={() => {
          setOpen(!open);
          if (!open) {
            setSeenIds(new Set(pending.map((p) => p.approval_id)));
          }
        }}
        className={`relative flex items-center justify-center h-8 w-8 rounded-md transition-colors cursor-pointer ${
          open ? "bg-foreground/[0.08]" : "hover:bg-foreground/[0.06]"
        }`}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-foreground/60"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {count > 0 && (
          <span
            className={`absolute -top-0.5 -right-0.5 flex items-center justify-center h-4 min-w-4 px-1 text-[10px] font-bold rounded-full bg-blue-500 text-white transition-transform ${
              flash ? "animate-bounce-once" : ""
            }`}
          >
            {count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 w-[380px] rounded-lg border border-border bg-popover shadow-lg overflow-hidden animate-fade-in">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <span className="text-[13px] font-semibold">Pending Approvals</span>
              {count > 0 && (
                <span className="text-[11px] font-medium text-foreground/40">{count} pending</span>
              )}
            </div>

            {pending.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <div className="text-foreground/20 mb-2">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="mx-auto"
                  >
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                </div>
                <p className="text-xs text-foreground/35">No pending approval requests</p>
              </div>
            ) : (
              <div className="max-h-[400px] overflow-y-auto divide-y divide-border">
                {pending.map((req) => (
                  <div
                    key={req.approval_id}
                    className={`px-4 py-3 transition-colors ${
                      !seenIds.has(req.approval_id) ? "bg-blue-50/50 dark:bg-blue-950/20" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium truncate">
                          {req.agent_name ?? "Unknown Agent"}
                        </p>
                        {req.binding_message && (
                          <p className="text-xs text-foreground/45 mt-0.5 truncate">
                            {req.binding_message}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 text-[10px] font-mono text-foreground/30">
                        {req.expires_in > 60
                          ? `${Math.floor(req.expires_in / 60)}m`
                          : `${req.expires_in}s`}
                      </span>
                    </div>

                    {req.capabilities.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2.5">
                        {req.capabilities.map((cap) => (
                          <span
                            key={cap}
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-foreground/[0.05] border border-border text-foreground/50"
                          >
                            {cap}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-1.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAction(req.approval_id, req.agent_id, "deny");
                        }}
                        disabled={actionLoading !== null}
                        className="flex-1 py-1.5 text-[11px] font-medium rounded-md border border-border text-foreground/50 hover:text-red-500 hover:border-red-200 dark:hover:border-red-900/50 transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {actionLoading === `${req.approval_id}-deny` ? "..." : "Deny"}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAction(req.approval_id, req.agent_id, "approve");
                        }}
                        disabled={actionLoading !== null}
                        className="flex-1 py-1.5 text-[11px] font-medium rounded-md bg-foreground text-background hover:opacity-90 transition-all disabled:opacity-50 cursor-pointer"
                      >
                        {actionLoading === `${req.approval_id}-approve` ? "..." : "Approve"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {pending.length > 0 && (
              <div className="px-4 py-2.5 border-t border-border bg-foreground/[0.02]">
                <Link
                  href={`/device/capabilities${pending[0]?.agent_id ? `?agent_id=${pending[0].agent_id}` : ""}`}
                  className="text-[11px] font-medium text-foreground/40 hover:text-foreground transition-colors"
                  onClick={() => setOpen(false)}
                >
                  View full approval page &rarr;
                </Link>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, isPending } = useSession();
  const [showUserMenu, setShowUserMenu] = useState(false);

  useEffect(() => {
    if (!isPending && !session) {
      router.push("/sign-in");
    }
  }, [session, isPending, router]);

  if (isPending) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="h-5 w-5 rounded-full border-2 border-foreground/10 border-t-foreground/60 animate-spin" />
      </div>
    );
  }

  if (!session) return null;

  const initials = session.user.name
    ? session.user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : (session.user.email?.charAt(0).toUpperCase() ?? "U");

  return (
    <div className="min-h-dvh">
      <nav className="sticky top-0 z-40 bg-background border-b border-border">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-1">
              <Link href="/dashboard" className="flex items-center gap-2 mr-1">
                <AgentAuthLogo className="h-[14px] w-auto" />
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="text-foreground/20"
                >
                  <path d="M9 5l7 7-7 7" />
                </svg>
                <span className="text-[13px] font-semibold text-foreground/70">Deploy</span>
              </Link>

              <div className="hidden sm:flex items-center ml-4 border-l border-border pl-4">
                {NAV_ITEMS.map((item) => {
                  const isActive = item.exact
                    ? pathname === item.href
                    : pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`relative px-3 py-1.5 text-[13px] transition-colors rounded-md ${
                        isActive
                          ? "text-foreground font-medium"
                          : "text-foreground/40 hover:text-foreground"
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <ApprovalNotification session={session as { user: { id: string; email: string } }} />
              <ThemeToggle />
              <div className="relative ml-1">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center justify-center h-7 w-7 rounded-full bg-foreground text-background text-[11px] font-medium cursor-pointer hover:opacity-90 transition-opacity"
                >
                  {initials}
                </button>

                {showUserMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                    <div className="absolute right-0 top-full mt-2 z-50 w-56 rounded-lg border border-border bg-popover shadow-lg overflow-hidden animate-fade-in">
                      <div className="px-3 py-2.5 border-b border-border">
                        <p className="text-[13px] font-medium truncate">
                          {session.user.name ?? "User"}
                        </p>
                        <p className="text-[11px] text-foreground/40 truncate mt-0.5">
                          {session.user.email}
                        </p>
                      </div>
                      <div className="p-1">
                        <button
                          onClick={() => signOut().then(() => router.push("/sign-in"))}
                          className="w-full text-left px-2.5 py-1.5 text-[13px] text-foreground/60 hover:bg-foreground/[0.05] rounded-md transition-colors cursor-pointer"
                        >
                          Sign out
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Mobile nav */}
        <div className="sm:hidden flex items-center gap-1 px-6 pb-2">
          {NAV_ITEMS.map((item) => {
            const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${
                  isActive
                    ? "bg-foreground text-background font-medium"
                    : "text-foreground/40 hover:text-foreground hover:bg-foreground/[0.05]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
      <main>{children}</main>
    </div>
  );
}
