"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signUp, useSession } from "@/lib/auth-client";
import { AgentAuthLogo } from "@/components/icons/logo";
import { ThemeToggle } from "@/components/theme-toggle";

const FEATURES = [
  {
    title: "Deploy in seconds",
    description:
      "Create live HTML sites instantly. Each deployment gets a unique URL you can share with anyone.",
  },
  {
    title: "AI agent powered",
    description:
      "Let AI agents deploy, update, and manage sites on your behalf through the Agent Auth Protocol.",
  },
  {
    title: "Capability-based access",
    description:
      "Fine-grained permissions let you control exactly what each agent can do. Approve or deny at any time.",
  },
];

export default function SignUpPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isPending && session) {
      router.replace("/dashboard");
    }
  }, [session, isPending, router]);

  if (isPending || session) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="h-4 w-4 rounded-full border-2 border-foreground/10 border-t-foreground/60 animate-spin" />
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await signUp.email({ name, email, password });
      if (result.error) {
        setError(result.error.message ?? "Something went wrong");
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
    <div className="min-h-dvh flex">
      <div className="hidden lg:flex lg:w-[460px] xl:w-[520px] shrink-0 flex-col justify-between bg-foreground text-background p-10">
        <div>
          <div className="flex items-center gap-2">
            <AgentAuthLogo className="h-[14px] w-auto invert dark:invert-0" />
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="opacity-30"
            >
              <path d="M9 5l7 7-7 7" />
            </svg>
            <span className="text-[12px] font-semibold tracking-wide opacity-60">Deploy</span>
          </div>
        </div>

        <div className="space-y-8">
          <div className="space-y-2.5">
            <h2 className="text-[22px] font-semibold tracking-tight leading-tight">
              Deploy HTML sites
              <br />
              with AI agents
            </h2>
            <p className="text-[13px] opacity-40 leading-relaxed max-w-sm">
              A deployment platform powered by the Agent Auth Protocol. Manage sites from the
              dashboard or let AI agents handle it autonomously.
            </p>
          </div>

          <div className="space-y-3">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="flex gap-2.5">
                <div className="mt-0.5 h-4 w-4 rounded-full bg-background/10 flex items-center justify-center shrink-0">
                  <svg
                    width="8"
                    height="8"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <div>
                  <p className="text-[13px] font-medium">{feature.title}</p>
                  <p className="text-[11px] opacity-35 leading-relaxed mt-0.5">
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <a
            href="https://github.com/nicepkg/agent-auth"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] opacity-30 hover:opacity-50 transition-opacity"
          >
            GitHub
          </a>
          <a
            href="https://agent-auth.better-auth.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] opacity-30 hover:opacity-50 transition-opacity"
          >
            Docs
          </a>
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between px-6 h-14">
          <div className="lg:hidden flex items-center gap-2">
            <AgentAuthLogo className="h-[14px] w-auto" />
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-foreground/20"
            >
              <path d="M9 5l7 7-7 7" />
            </svg>
            <span className="text-[12px] font-semibold tracking-wide text-foreground/50">
              Deploy
            </span>
          </div>
          <div className="lg:ml-auto">
            <ThemeToggle />
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-sm">
            <div className="space-y-6">
              <div className="space-y-1.5">
                <h1 className="text-[22px] font-semibold tracking-tight">Create an account</h1>
                <p className="text-[13px] text-foreground/40">
                  Get started deploying HTML sites and connecting AI agents in seconds.
                </p>
              </div>

              <div className="lg:hidden flex items-center gap-2.5 p-3 rounded-md border border-border bg-foreground/[0.02]">
                <div className="h-7 w-7 rounded-md bg-foreground/[0.05] flex items-center justify-center shrink-0">
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-foreground/35"
                  >
                    <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                </div>
                <p className="text-[11px] text-foreground/40 leading-relaxed">
                  Deploy HTML sites from the dashboard or let AI agents manage them through the
                  Agent Auth Protocol.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3.5">
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
                    minLength={8}
                    className="w-full px-3 py-2 rounded-md bg-background border border-border placeholder:text-foreground/25 focus:border-foreground/20 focus:ring-1 focus:ring-foreground/[0.08] text-[13px] outline-none transition-all"
                    placeholder="Min. 8 characters"
                  />
                </div>

                {error && (
                  <div className="px-3 py-2 rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 text-red-500 text-[13px]">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2 text-[13px] font-medium rounded-md bg-foreground text-background hover:opacity-90 transition-all disabled:opacity-50 active:scale-[0.98] cursor-pointer"
                >
                  {loading ? "Creating account..." : "Create Account"}
                </button>
              </form>

              <p className="text-center text-[13px] text-foreground/35">
                Already have an account?{" "}
                <Link
                  href="/sign-in"
                  className="text-foreground/60 hover:text-foreground font-medium transition-colors"
                >
                  Sign in
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
