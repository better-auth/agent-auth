"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "@/lib/auth-client";
import { AgentAuthLogo } from "@/components/icons/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { useEffect } from "react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  useEffect(() => {
    if (!isPending && !session) {
      router.push("/sign-in");
    }
  }, [session, isPending, router]);

  if (isPending) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="text-[11px] font-mono text-foreground/30 animate-pulse">
          Loading...
        </div>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="min-h-dvh">
      <nav className="flex items-center justify-between px-5 sm:px-6 py-3 border-b border-foreground/[0.06]">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-3">
            <AgentAuthLogo className="h-4 w-auto" />
            <span className="text-[11px] font-mono text-foreground/40 tracking-wider uppercase">
              Deploy
            </span>
          </Link>
          <div className="hidden sm:flex items-center gap-4">
            <Link
              href="/dashboard"
              className="text-[11px] font-mono text-foreground/45 hover:text-foreground/70 transition-colors"
            >
              Sites
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden sm:inline text-[10px] font-mono text-foreground/30">
            {session.user.email}
          </span>
          <button
            onClick={() => signOut().then(() => router.push("/"))}
            className="text-[11px] font-mono text-foreground/35 hover:text-foreground/60 transition-colors"
          >
            Sign out
          </button>
          <ThemeToggle />
        </div>
      </nav>
      {children}
    </div>
  );
}
