"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/lib/auth-client";
import { AgentAuthLogo } from "@/components/icons/logo";
import { ThemeToggle } from "@/components/theme-toggle";

const CAPABILITIES = [
  {
    name: "sites.create",
    label: "Deploy",
    description: "Create a new HTML site with a unique URL in seconds",
  },
  {
    name: "sites.update",
    label: "Update",
    description: "Push new HTML content to an existing deployment",
  },
  {
    name: "sites.list",
    label: "List",
    description: "Enumerate all sites owned by the authenticated user",
  },
  {
    name: "sites.get",
    label: "Read",
    description: "Fetch full site details including HTML content",
  },
  {
    name: "sites.delete",
    label: "Remove",
    description: "Permanently delete a site and free its URL slug",
  },
];

const CODE_EXAMPLE = `import { AgentAuthClient } from "@auth/agent"

const client = new AgentAuthClient({ storage })
const provider = await client.discoverProvider(
  "http://localhost:3100"
)

const agent = await client.connectAgent({
  provider: "http://localhost:3100",
  capabilities: ["sites.create", "sites.list"],
})

const result = await client.executeCapability({
  agentId: agent.agent_id,
  capability: "sites.create",
  arguments: {
    name: "My Landing Page",
    html: "<h1>Hello from an AI agent!</h1>",
  },
})`;

export default function LandingPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  useEffect(() => {
    if (!isPending && session) {
      router.replace("/dashboard");
    }
  }, [session, isPending, router]);

  if (isPending || session) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="text-[11px] font-mono text-foreground/30 animate-pulse">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh">
      {/* Nav */}
      <nav className="flex items-center justify-between px-5 sm:px-6 py-3 border-b border-foreground/[0.06]">
        <div className="flex items-center gap-3">
          <AgentAuthLogo className="h-4 w-auto" />
          <span className="text-[11px] font-mono text-foreground/40 tracking-wider uppercase">
            Deploy
          </span>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/sign-in"
            className="text-[11px] font-mono text-foreground/45 hover:text-foreground/70 transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="inline-flex items-center px-3 py-1.5 text-[11px] font-mono bg-foreground text-background hover:opacity-90 transition-opacity"
          >
            Get Started
          </Link>
          <ThemeToggle />
        </div>
      </nav>

      {/* Hero */}
      <section className="relative px-5 sm:px-6 lg:px-8 pt-20 sm:pt-28 pb-16 sm:pb-20">
        {/* Grid background */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className="absolute inset-0 bg-grid text-foreground opacity-[0.03]"
            style={{
              maskImage:
                "radial-gradient(ellipse 70% 50% at 50% 0%, black 30%, transparent 100%)",
              WebkitMaskImage:
                "radial-gradient(ellipse 70% 50% at 50% 0%, black 30%, transparent 100%)",
            }}
          />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-foreground/[0.02] rounded-full blur-[100px]" />
        </div>

        <div className="relative max-w-3xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 border border-foreground/[0.08] bg-foreground/[0.02] text-[10px] font-mono text-foreground/40 tracking-wider uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            Agent Auth Protocol
          </div>

          <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight leading-[1.1]">
            Deploy HTML sites
            <br />
            <span className="text-foreground/40">with AI agents</span>
          </h1>

          <p className="max-w-lg mx-auto text-sm sm:text-base text-foreground/50 leading-relaxed">
            A deployment platform powered by the Agent Auth Protocol. Deploy
            from the dashboard or let AI agents create, update, and manage
            your sites autonomously.
          </p>

          <div className="flex items-center justify-center gap-3 pt-2">
            <Link
              href="/sign-up"
              className="inline-flex items-center px-5 py-2.5 text-xs font-mono bg-foreground text-background hover:opacity-90 transition-opacity"
            >
              Start Deploying
            </Link>
            <Link
              href="/sign-in"
              className="inline-flex items-center px-5 py-2.5 text-xs font-mono border border-foreground/[0.12] bg-foreground/[0.04] hover:bg-foreground/[0.08] hover:border-foreground/[0.20] transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section className="px-5 sm:px-6 lg:px-8 py-16 border-t border-foreground/[0.06]">
        <div className="max-w-4xl mx-auto">
          <div className="mb-10">
            <span className="text-[10px] font-mono text-foreground/35 tracking-wider uppercase">
              Agent Capabilities
            </span>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">
              Five operations, full control
            </h2>
            <p className="mt-2 text-sm text-foreground/45 max-w-md">
              Every capability is scoped, auditable, and requires explicit
              user approval before an AI agent can use it.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {CAPABILITIES.map((cap) => (
              <div
                key={cap.name}
                className="group p-5 border border-foreground/[0.08] bg-foreground/[0.02] hover:bg-foreground/[0.04] hover:border-foreground/[0.14] transition-colors space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-medium">
                    {cap.label}
                  </span>
                  <span className="text-[9px] font-mono text-foreground/30 border border-foreground/[0.06] px-1.5 py-0.5">
                    {cap.name}
                  </span>
                </div>
                <p className="text-[13px] text-foreground/50 leading-relaxed">
                  {cap.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Code Example */}
      <section className="px-5 sm:px-6 lg:px-8 py-16 border-t border-foreground/[0.06]">
        <div className="max-w-4xl mx-auto">
          <div className="mb-10">
            <span className="text-[10px] font-mono text-foreground/35 tracking-wider uppercase">
              SDK Integration
            </span>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">
              Deploy from any AI agent
            </h2>
            <p className="mt-2 text-sm text-foreground/45 max-w-md">
              Use the Agent Auth SDK to discover, connect, and execute
              deployment capabilities programmatically.
            </p>
          </div>

          <div className="border border-foreground/[0.08] bg-foreground/[0.02] overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-foreground/[0.06]">
              <div className="w-2 h-2 rounded-full bg-foreground/10" />
              <div className="w-2 h-2 rounded-full bg-foreground/10" />
              <div className="w-2 h-2 rounded-full bg-foreground/10" />
              <span className="ml-2 text-[10px] font-mono text-foreground/30">
                deploy.ts
              </span>
            </div>
            <pre className="p-5 overflow-x-auto text-[12px] leading-[1.7] font-mono text-foreground/70">
              <code>{CODE_EXAMPLE}</code>
            </pre>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-5 sm:px-6 lg:px-8 py-16 border-t border-foreground/[0.06]">
        <div className="max-w-4xl mx-auto">
          <div className="mb-10">
            <span className="text-[10px] font-mono text-foreground/35 tracking-wider uppercase">
              How It Works
            </span>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">
              Three modes of deployment
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              {
                step: "01",
                title: "Dashboard",
                desc: "Sign in with email and password. Create, edit, and manage your HTML sites directly in the browser.",
              },
              {
                step: "02",
                title: "Delegated Agent",
                desc: "An AI agent connects on your behalf. You approve which capabilities it can use, then it deploys for you.",
              },
              {
                step: "03",
                title: "Autonomous Agent",
                desc: "An agent registers without a user account, deploys sites independently, and transfers them when you claim the host.",
              },
            ].map((item) => (
              <div key={item.step} className="space-y-3">
                <span className="text-[10px] font-mono text-foreground/25">
                  {item.step}
                </span>
                <h3 className="text-sm font-medium">{item.title}</h3>
                <p className="text-[13px] text-foreground/45 leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-5 sm:px-6 py-6 border-t border-foreground/[0.06]">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AgentAuthLogo className="h-3 w-auto opacity-30" />
            <span className="text-[10px] font-mono text-foreground/25">
              Agent Deploy Demo
            </span>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/nicepkg/agent-auth"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] font-mono text-foreground/30 hover:text-foreground/50 transition-colors"
            >
              GitHub
            </a>
            <a
              href="https://agent-auth.better-auth.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] font-mono text-foreground/30 hover:text-foreground/50 transition-colors"
            >
              Docs
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
