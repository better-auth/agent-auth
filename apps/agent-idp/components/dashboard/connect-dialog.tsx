"use client";

import { ArrowUpRight, Check, Copy } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { highlight } from "sugar-high";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

function useCopy() {
	const [copied, setCopied] = useState<string | null>(null);
	const copy = (key: string, text: string) => {
		navigator.clipboard.writeText(text);
		setCopied(key);
		setTimeout(() => setCopied(null), 2000);
	};
	return { copied, copy };
}

function CodeBlock({
	code,
	label,
	copyKey,
	copied,
	onCopy,
}: {
	code: string;
	label: string;
	copyKey: string;
	copied: string | null;
	onCopy: (key: string, text: string) => void;
}) {
	return (
		<div className="rounded-lg border border-border/60 overflow-hidden">
			<div className="flex items-center justify-between px-3 py-1.5 bg-muted/40 border-b border-border/40">
				<span className="text-[10px] font-mono text-muted-foreground/70 uppercase tracking-wider">
					{label}
				</span>
				<button
					onClick={() => onCopy(copyKey, code)}
					className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-muted/60"
				>
					{copied === copyKey ? (
						<>
							<Check className="h-3 w-3 text-emerald-500" />
							<span className="text-emerald-500">Copied</span>
						</>
					) : (
						<>
							<Copy className="h-3 w-3" />
							<span>Copy</span>
						</>
					)}
				</button>
			</div>
			<pre className="p-3 text-[11px] font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap break-all bg-card/20">
				<code dangerouslySetInnerHTML={{ __html: highlight(code) }} />
			</pre>
		</div>
	);
}

// ---------------------------------------------------------------------------
// MCP tab
// ---------------------------------------------------------------------------

type McpClient = "cursor" | "claude-code" | "windsurf" | "opencode";

const MCP_CLIENTS: { id: McpClient; label: string }[] = [
	{ id: "cursor", label: "Cursor" },
	{ id: "claude-code", label: "Claude Code" },
	{ id: "windsurf", label: "Windsurf" },
	{ id: "opencode", label: "OpenCode" },
];

function getMcpConfig(client: McpClient, baseUrl: string) {
	const url = baseUrl;
	switch (client) {
		case "cursor":
			return {
				label: ".cursor/mcp.json",
				code: `{\n  "mcpServers": {\n    "better-auth-agent": {\n      "command": "npx",\n      "args": [\n        "auth", "agent",\n        "--url", "${url}"\n      ]\n    }\n  }\n}`,
			};
		case "claude-code":
			return {
				label: ".claude/settings.json",
				code: `{\n  "mcpServers": {\n    "better-auth-agent": {\n      "command": "npx",\n      "args": [\n        "auth", "agent",\n        "--url", "${url}"\n      ]\n    }\n  }\n}`,
			};
		case "windsurf":
			return {
				label: "~/.codeium/windsurf/mcp_config.json",
				code: `{\n  "mcpServers": {\n    "better-auth-agent": {\n      "command": "npx",\n      "args": [\n        "auth", "agent",\n        "--url", "${url}"\n      ]\n    }\n  }\n}`,
			};
		case "opencode":
			return {
				label: "opencode.json",
				code: `{\n  "mcp": {\n    "better-auth-agent": {\n      "type": "stdio",\n      "command": "npx",\n      "args": [\n        "auth", "agent",\n        "--url", "${url}"\n      ]\n    }\n  }\n}`,
			};
	}
}

function MCPContent({ baseUrl }: { baseUrl: string }) {
	const { copied, copy } = useCopy();
	const [client, setClient] = useState<McpClient>("cursor");
	const config = getMcpConfig(client, baseUrl);
	return (
		<div className="space-y-3">
			<div className="flex gap-1 p-0.5 bg-muted/40 rounded-lg w-fit">
				{MCP_CLIENTS.map((c) => (
					<button
						key={c.id}
						onClick={() => setClient(c.id)}
						className={cn(
							"flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded-md transition-all",
							client === c.id
								? "bg-background text-foreground shadow-sm"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						{c.label}
					</button>
				))}
			</div>
			<CodeBlock
				code={config.code}
				label={config.label}
				copyKey={`mcp-${client}`}
				copied={copied}
				onCopy={copy}
			/>
			<p className="text-[11px] text-muted-foreground leading-relaxed">
				Add this to your editor config, then ask the agent to connect.
			</p>
		</div>
	);
}

// ---------------------------------------------------------------------------
// CLI tab
// ---------------------------------------------------------------------------

function CLIContent({ baseUrl }: { baseUrl: string }) {
	const { copied, copy } = useCopy();
	return (
		<div className="space-y-3">
			<CodeBlock
				code="npx skills add better-auth/agents"
				label="terminal"
				copyKey="cli-skill"
				copied={copied}
				onCopy={copy}
			/>
			<p className="text-[11px] text-muted-foreground leading-relaxed">
				Installs the agent auth skill. Uses{" "}
				<code className="font-mono text-[10px] bg-muted/60 px-1 py-0.5 rounded">
					npx auth ai
				</code>{" "}
				— the client implementation of the agent auth protocol.
			</p>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

type Tab = "mcp" | "cli" | "sdk" | "manual";

const TABS: { id: Tab; label: string }[] = [
	{ id: "mcp", label: "MCP" },
	{ id: "cli", label: "CLI" },
	{ id: "sdk", label: "SDK" },
	{ id: "manual", label: "Manual" },
];

export function ConnectDialog({
	children,
	orgSlug,
}: {
	orgId?: string;
	orgSlug?: string;
	children: React.ReactNode;
}) {
	const [tab, setTab] = useState<Tab>("mcp");
	const [baseUrl, setBaseUrl] = useState("");
	const [mounted, setMounted] = useState(false);
	useEffect(() => {
		setMounted(true);
		setBaseUrl(window.location.origin);
	}, []);

	if (!mounted) return <>{children}</>;

	return (
		<Dialog>
			<DialogTrigger asChild>{children}</DialogTrigger>
			<DialogContent className="max-w-[520px] max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
				<DialogHeader className="px-6 pt-5 pb-3">
					<DialogTitle className="text-base">Connect an Agent</DialogTitle>
					<DialogDescription className="text-[13px]">
						Set up your AI agent to authenticate with this app.
					</DialogDescription>
				</DialogHeader>
				<div className="px-6">
					<div className="flex border-b border-border/60">
						{TABS.map((t) => (
							<button
								key={t.id}
								onClick={() => setTab(t.id)}
								className={cn(
									"relative flex-1 py-2 text-[13px] font-medium transition-colors text-center",
									tab === t.id
										? "text-foreground"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								{t.label}
								{tab === t.id && (
									<span className="absolute bottom-0 inset-x-0 h-0.5 bg-foreground rounded-full" />
								)}
							</button>
						))}
					</div>
				</div>
				<div className="flex-1 overflow-y-auto px-6 pt-4 pb-6 min-h-0">
					{tab === "mcp" && <MCPContent baseUrl={baseUrl} />}
					{tab === "cli" && <CLIContent baseUrl={baseUrl} />}
					{tab === "sdk" && (
						<div className="flex flex-col items-center justify-center py-10 text-center">
							<div className="rounded-full bg-muted/50 p-3 mb-3">
								<svg
									className="h-5 w-5 text-muted-foreground/50"
									fill="none"
									viewBox="0 0 24 24"
									strokeWidth={1.5}
									stroke="currentColor"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5"
									/>
								</svg>
							</div>
							<p className="text-sm font-medium">SDK coming soon</p>
							<p className="text-[12px] text-muted-foreground mt-1 max-w-[260px]">
								Programmatic agent auth for custom clients and server-to-server
								flows.
							</p>
						</div>
					)}
					{tab === "manual" && (
						<div className="space-y-3">
							<p className="text-[12px] text-muted-foreground leading-relaxed">
								Create a host manually with pre-authorized scopes, then enroll
								your device or set up a remote MCP server.
							</p>
							<Link
								href={orgSlug ? `/dashboard/${orgSlug}/hosts` : "#"}
								className="flex items-center justify-between rounded-lg border border-border/60 p-4 hover:border-foreground/20 hover:bg-muted/30 transition-all group"
							>
								<div>
									<p className="text-sm font-medium group-hover:text-foreground transition-colors">
										Go to Hosts
									</p>
									<p className="text-[12px] text-muted-foreground mt-0.5">
										Create local or remote hosts with enrollment tokens and
										scoped permissions.
									</p>
								</div>
								<ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" />
							</Link>
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
