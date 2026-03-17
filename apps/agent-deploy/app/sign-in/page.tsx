"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "@/lib/auth-client";
import { AgentAuthLogo } from "@/components/icons/logo";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await signIn.email({ email, password });
      if (result.error) {
        setError(result.error.message ?? "Invalid credentials");
      } else {
        router.push("/dashboard");
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh flex flex-col">
      <nav className="flex items-center justify-between px-5 sm:px-6 py-3 border-b border-foreground/[0.06]">
        <Link href="/" className="flex items-center gap-3">
          <AgentAuthLogo className="h-4 w-auto" />
          <span className="text-[11px] font-mono text-foreground/40 tracking-wider uppercase">
            Deploy
          </span>
        </Link>
      </nav>

      <div className="flex-1 flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-2 text-center">
            <h1 className="text-xl font-semibold tracking-tight">
              Welcome back
            </h1>
            <p className="text-sm text-foreground/45">
              Sign in to manage your deployments
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
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

            {error && (
              <div className="px-3 py-2 border border-destructive/20 bg-destructive/5 text-destructive-foreground text-xs font-mono">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 text-xs font-mono bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <p className="text-center text-[11px] font-mono text-foreground/35">
            Don&apos;t have an account?{" "}
            <Link
              href="/sign-up"
              className="text-foreground/60 hover:text-foreground/80 transition-colors"
            >
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
