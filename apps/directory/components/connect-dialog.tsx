"use client";

import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";

export function ConnectDialog({ children }: { children: React.ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[85dvh] overflow-y-auto gap-0 p-0">
        <DialogHeader className="px-5 pt-5 pb-4 border-b border-foreground/[0.06]">
          <DialogTitle className="text-base font-semibold tracking-tight">
            Connect the Directory
          </DialogTitle>
          <DialogDescription className="text-xs text-foreground/45">
            Point your MCP client, SDK, or CLI at the directory to discover providers by intent.
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 py-5 space-y-5">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-foreground/30">
                01
              </span>
              <h3 className="text-[11px] font-mono uppercase tracking-wider text-foreground/50">
                MCP Server
              </h3>
              <span className="text-[10px] font-mono text-foreground/25 ml-auto">
                Cursor / Claude Desktop
              </span>
            </div>
            <div className="border border-foreground/[0.06] bg-foreground/[0.02] p-3 overflow-x-auto">
              <code className="text-[11px] font-mono text-foreground/55 block whitespace-pre leading-relaxed">
                {`{
  "mcpServers": {
    "agent-auth": {
      "command": "npx",
      "args": [
        "@auth/agent-cli",
        "mcp",
        "--directory-url",
        "https://agent-auth.directory"
      ]
    }
  }
}`}
              </code>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-foreground/30">
                02
              </span>
              <h3 className="text-[11px] font-mono uppercase tracking-wider text-foreground/50">
                SDK
              </h3>
              <span className="text-[10px] font-mono text-foreground/25 ml-auto">@auth/agent</span>
            </div>
            <div className="border border-foreground/[0.06] bg-foreground/[0.02] p-3 overflow-x-auto">
              <code className="text-[11px] font-mono text-foreground/55 block whitespace-pre leading-relaxed">
                {`import { AgentAuthClient } from "@auth/agent";

const client = new AgentAuthClient({
  directoryUrl: "https://agent-auth.directory",
});

const providers = await client.searchProviders(
  "deploy my app to production"
);`}
              </code>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-foreground/30">
                03
              </span>
              <h3 className="text-[11px] font-mono uppercase tracking-wider text-foreground/50">
                CLI
              </h3>
              <span className="text-[10px] font-mono text-foreground/25 ml-auto">
                @auth/agent-cli
              </span>
            </div>
            <div className="border border-foreground/[0.06] bg-foreground/[0.02] p-3 overflow-x-auto">
              <code className="text-[11px] font-mono text-foreground/55 block whitespace-pre leading-relaxed">
                {`npx @auth/agent-cli search "deploy to production" \\
  --directory-url https://agent-auth.directory`}
              </code>
            </div>
          </div>
        </div>

        <div className="px-5 pb-5 pt-1 flex items-center justify-end gap-3 border-t border-foreground/[0.06]">
          <Link
            href="https://github.com/better-auth/agent-auth"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 border border-foreground/[0.12] bg-foreground/[0.04] hover:bg-foreground/[0.08] hover:border-foreground/[0.20] px-3 py-1.5 transition-all text-[11px] font-mono text-foreground/60"
          >
            View on GitHub
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
