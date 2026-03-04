import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { storage } from "@/lib/storage";
import { cn } from "@/lib/utils";

type McpClient = "cursor" | "claude-code" | "windsurf" | "opencode";

const MCP_CLIENTS: { id: McpClient; label: string }[] = [
	{ id: "cursor", label: "Cursor" },
	{ id: "claude-code", label: "Claude Code" },
	{ id: "windsurf", label: "Windsurf" },
	{ id: "opencode", label: "OpenCode" },
];

function getMcpConfig(client: McpClient, baseUrl: string) {
	switch (client) {
		case "cursor":
			return {
				label: ".cursor/mcp.json",
				code: `{
  "mcpServers": {
    "agent-auth": {
      "command": "npx",
      "args": [
        "auth", "agent",
        "--url", "${baseUrl}"
      ]
    }
  }
}`,
			};
		case "claude-code":
			return {
				label: ".claude/settings.json",
				code: `{
  "mcpServers": {
    "agent-auth": {
      "command": "npx",
      "args": [
        "auth", "agent",
        "--url", "${baseUrl}"
      ]
    }
  }
}`,
			};
		case "windsurf":
			return {
				label: "~/.codeium/windsurf/mcp_config.json",
				code: `{
  "mcpServers": {
    "agent-auth": {
      "command": "npx",
      "args": [
        "auth", "agent",
        "--url", "${baseUrl}"
      ]
    }
  }
}`,
			};
		case "opencode":
			return {
				label: "opencode.json",
				code: `{
  "mcp": {
    "agent-auth": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "auth", "agent",
        "--url", "${baseUrl}"
      ]
    }
  }
}`,
			};
	}
}

export function Connect() {
	const [client, setClient] = useState<McpClient>("cursor");
	const [baseUrl, setBaseUrl] = useState("");
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		storage.getIdpUrl().then((url) => setBaseUrl(url ?? ""));
	}, []);

	const config = getMcpConfig(client, baseUrl);

	const handleCopy = () => {
		navigator.clipboard.writeText(config.code);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<div className="p-3 space-y-3">
			<p className="text-[11px] text-muted-foreground leading-relaxed">
				Add this config to your editor, then ask the agent to connect. A device
				authorization flow will prompt you to approve.
			</p>

			<div className="flex gap-0.5 p-0.5 bg-muted/50 rounded-sm w-fit">
				{MCP_CLIENTS.map((c) => (
					<button
						key={c.id}
						onClick={() => {
							setClient(c.id);
							setCopied(false);
						}}
						className={cn(
							"px-2 py-1 text-[11px] font-medium rounded-sm transition-all cursor-pointer",
							client === c.id
								? "bg-background text-foreground shadow-sm"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						{c.label}
					</button>
				))}
			</div>

			<div className="rounded-sm border border-border overflow-hidden">
				<div className="flex items-center justify-between px-3 py-1.5 bg-muted/40 border-b border-border/40">
					<span className="text-[10px] font-mono text-muted-foreground/70 uppercase tracking-wider">
						{config.label}
					</span>
					<button
						onClick={handleCopy}
						className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded-sm hover:bg-muted/60 cursor-pointer"
					>
						{copied ? (
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
					{config.code}
				</pre>
			</div>
		</div>
	);
}
