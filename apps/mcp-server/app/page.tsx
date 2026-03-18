"use client";

import { authClient } from "@/lib/auth-client";

export default function Home() {
  const { data: session, isPending } = authClient.useSession();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <nav className="fixed top-0 left-0 right-0 flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-950/80 backdrop-blur-sm">
        <span className="text-sm font-semibold tracking-tight">
          Agent Auth
        </span>
        <div className="flex items-center gap-3 text-sm">
          {isPending ? (
            <span className="text-neutral-500">...</span>
          ) : session?.user ? (
            <>
              <span className="text-neutral-400">{session.user.email}</span>
              <button
                onClick={() =>
                  authClient.signOut().then(() => window.location.reload())
                }
                className="rounded-lg border border-neutral-700 px-3 py-1.5 text-neutral-300 hover:bg-neutral-800 transition-colors"
              >
                Sign out
              </button>
            </>
          ) : (
            <a
              href="/sign-in"
              className="rounded-lg bg-white px-3 py-1.5 font-medium text-black hover:bg-neutral-200 transition-colors"
            >
              Sign in
            </a>
          )}
        </div>
      </nav>

      <div className="max-w-2xl text-center space-y-8">
        <div className="space-y-4">
          <h1 className="text-4xl font-bold tracking-tight">
            Agent Auth MCP Server
          </h1>
          <p className="text-lg text-neutral-400">
            A hosted MCP server that lets AI agents connect to services like
            Gmail, GitHub, Vercel, and more — all through the Agent Auth
            Protocol.
          </p>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6 text-left space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
            Connect in ChatGPT
          </h2>
          <ol className="list-decimal list-inside space-y-2 text-neutral-300 text-sm">
            <li>
              Open ChatGPT &rarr; Settings &rarr; Connectors &rarr; Add MCP
              Server
            </li>
            <li>
              Paste this server URL:{" "}
              <code className="rounded bg-neutral-800 px-2 py-0.5 font-mono text-xs">
                /api/mcp
              </code>
            </li>
            <li>Sign in when prompted to authorize ChatGPT</li>
            <li>Start using Agent Auth tools in your conversations</li>
          </ol>
        </div>

        <div className="grid grid-cols-3 gap-4 text-sm">
          <div className="rounded-lg border border-neutral-800 p-4 space-y-1">
            <div className="font-medium">15 Tools</div>
            <div className="text-neutral-500">
              Full Agent Auth Protocol toolkit
            </div>
          </div>
          <div className="rounded-lg border border-neutral-800 p-4 space-y-1">
            <div className="font-medium">Per-user Isolation</div>
            <div className="text-neutral-500">
              Own host identity &amp; agents
            </div>
          </div>
          <div className="rounded-lg border border-neutral-800 p-4 space-y-1">
            <div className="font-medium">OAuth 2.1</div>
            <div className="text-neutral-500">
              Secure auth via Better Auth
            </div>
          </div>
        </div>

        <p className="text-xs text-neutral-600">
          Powered by Better Auth &middot; Agent Auth Protocol v1.0
        </p>
      </div>
    </main>
  );
}
