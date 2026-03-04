"use client";

import {
	Cable,
	ChevronDown,
	ChevronRight,
	FileJson,
	Globe,
	Loader2,
	Plus,
	Search,
	Server,
	Shield,
	Trash2,
	Unplug,
	Wrench,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ToolDef = {
	name: string;
	description: string;
};

type UnifiedConnection = {
	id: string;
	orgId: string;
	name: string;
	displayName: string;
	type: string;
	builtinId: string | null;
	transport: string | null;
	mcpEndpoint: string | null;
	credentialType: string | null;
	status: string;
	createdAt: string;
	connected: boolean;
	identifier: string | null;
	tools: ToolDef[];
};

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function GitHubIcon({ className }: { className?: string }) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="currentColor">
			<path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
		</svg>
	);
}

function GoogleIcon({ className }: { className?: string }) {
	return (
		<svg className={className} viewBox="0 0 24 24">
			<path
				d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
				fill="#4285F4"
			/>
			<path
				d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
				fill="#34A853"
			/>
			<path
				d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
				fill="#FBBC05"
			/>
			<path
				d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
				fill="#EA4335"
			/>
		</svg>
	);
}

// ---------------------------------------------------------------------------
// OAuth providers config
// ---------------------------------------------------------------------------

const OAUTH_PROVIDERS = [
	{
		id: "github",
		name: "GitHub",
		description:
			"Browse repos, manage issues & PRs, analyze code, and automate workflows.",
		icon: <GitHubIcon className="h-5 w-5" />,
	},
	{
		id: "google",
		name: "Google (Gmail)",
		description: "Search, read, send, and manage emails through AI agents.",
		icon: <GoogleIcon className="h-5 w-5" />,
		scopes: [
			"https://www.googleapis.com/auth/gmail.readonly",
			"https://www.googleapis.com/auth/gmail.modify",
			"https://www.googleapis.com/auth/gmail.send",
		],
	},
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getConnectionIcon(conn: UnifiedConnection) {
	if (conn.builtinId === "github") return <GitHubIcon className="h-5 w-5" />;
	if (conn.builtinId === "google") return <GoogleIcon className="h-5 w-5" />;
	if (conn.type === "agent-auth")
		return <Shield className="h-5 w-5 text-muted-foreground" />;
	if (conn.type === "openapi")
		return <FileJson className="h-5 w-5 text-muted-foreground" />;
	return <Server className="h-5 w-5 text-muted-foreground" />;
}

function getConnectionBadge(conn: UnifiedConnection) {
	if (conn.type === "oauth") return "OAuth";
	if (conn.type === "agent-auth") return "Agent Auth";
	if (conn.type === "openapi") return "OpenAPI";
	return "MCP";
}

// ---------------------------------------------------------------------------
// ToolsPanel
// ---------------------------------------------------------------------------

function ToolsPanel({ tools }: { tools: ToolDef[] }) {
	const [toolSearch, setToolSearch] = useState("");

	const filteredTools = tools.filter(
		(t) =>
			t.name.toLowerCase().includes(toolSearch.toLowerCase()) ||
			t.description?.toLowerCase().includes(toolSearch.toLowerCase()),
	);

	if (tools.length === 0) {
		return (
			<div className="px-4 py-5 text-center">
				<Wrench className="h-4 w-4 mx-auto mb-1.5 text-muted-foreground/30" />
				<p className="text-[11px] text-muted-foreground">
					No tools available for this connection.
				</p>
			</div>
		);
	}

	return (
		<div className="px-4 py-3">
			{tools.length > 5 && (
				<div className="relative mb-2.5">
					<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
					<Input
						placeholder="Filter tools..."
						value={toolSearch}
						onChange={(e) => setToolSearch(e.target.value)}
						className="h-7 text-xs pl-8 bg-muted/30 border-border/40"
					/>
				</div>
			)}
			<div className="flex flex-wrap gap-1.5">
				{filteredTools.map((tool) => (
					<div
						key={tool.name}
						className="group relative inline-flex items-center gap-1.5 rounded-md border border-border/50 bg-muted/30 px-2 py-1 text-xs transition-colors hover:bg-muted/60"
					>
						<Wrench className="h-2.5 w-2.5 text-muted-foreground/60 shrink-0" />
						<span className="font-mono text-[11px]">{tool.name}</span>
						{tool.description && (
							<div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 hidden group-hover:block">
								<div className="rounded-md bg-popover border border-border px-2.5 py-1.5 text-[11px] text-popover-foreground shadow-md whitespace-nowrap max-w-xs">
									{tool.description}
								</div>
							</div>
						)}
					</div>
				))}
			</div>
			{toolSearch && filteredTools.length === 0 && (
				<p className="text-[11px] text-muted-foreground text-center py-2">
					No tools matching &ldquo;{toolSearch}&rdquo;
				</p>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// ConnectionCard
// ---------------------------------------------------------------------------

function ConnectionCard({
	conn,
	onMutate,
}: {
	conn: UnifiedConnection;
	onMutate: () => void;
}) {
	const [showTools, setShowTools] = useState(false);
	const [actionLoading, setActionLoading] = useState(false);
	const [confirmDelete, setConfirmDelete] = useState(false);

	const isOAuth = conn.type === "oauth";
	const toolCount = conn.tools.length;

	const handleConnect = async () => {
		const provider = OAUTH_PROVIDERS.find((p) => p.id === conn.builtinId);
		if (!provider) return;
		try {
			await authClient.linkSocial({
				provider: provider.id as "github" | "google",
				callbackURL: window.location.pathname,
				scopes: (provider as any).scopes,
			});
		} catch {
			/* empty */
		}
	};

	const handleDisconnect = async () => {
		setActionLoading(true);
		try {
			await fetch(`/api/connections/${conn.id}`, { method: "DELETE" });
			onMutate();
		} catch {
			/* empty */
		}
		setActionLoading(false);
	};

	const handleDelete = async () => {
		setActionLoading(true);
		try {
			await fetch(`/api/connections/${conn.id}`, { method: "DELETE" });
			onMutate();
		} catch {
			/* empty */
		}
		setActionLoading(false);
	};

	return (
		<div className="border border-border/60 rounded-lg overflow-hidden bg-card/50">
			<div className="p-4 flex items-center gap-3">
				<div
					className={`flex h-10 w-10 items-center justify-center rounded-lg shrink-0 transition-colors ${
						conn.connected ? "bg-muted/50" : "bg-muted/30"
					}`}
				>
					{getConnectionIcon(conn)}
				</div>
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2">
						<h3 className="font-medium text-sm">{conn.displayName}</h3>
						<span className="text-[10px] font-mono bg-muted/50 px-1.5 py-0.5 rounded">
							{getConnectionBadge(conn)}
						</span>
						{conn.connected && (
							<span className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
								<span className="relative flex h-1.5 w-1.5">
									<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
									<span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
								</span>
								Connected
							</span>
						)}
					</div>
					<p className="text-xs text-muted-foreground mt-0.5 font-mono truncate">
						{isOAuth && conn.connected
							? conn.identifier
							: conn.identifier || conn.mcpEndpoint || conn.name}
					</p>
				</div>
				<div className="flex items-center gap-1.5 shrink-0">
					{isOAuth && !conn.connected ? (
						<Button size="sm" className="h-8 text-xs" onClick={handleConnect}>
							Connect {conn.displayName.split(" ")[0]}
						</Button>
					) : (
						<>
							{toolCount > 0 && (
								<button
									type="button"
									onClick={() => setShowTools(!showTools)}
									className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
								>
									<Wrench className="h-3 w-3" />
									<span className="tabular-nums">
										{toolCount} tool{toolCount !== 1 ? "s" : ""}
									</span>
									{showTools ? (
										<ChevronDown className="h-3 w-3" />
									) : (
										<ChevronRight className="h-3 w-3" />
									)}
								</button>
							)}
							{isOAuth ? (
								<Button
									variant="ghost"
									size="sm"
									className="h-7 text-xs text-muted-foreground hover:text-destructive shrink-0"
									onClick={handleDisconnect}
									disabled={actionLoading}
								>
									{actionLoading ? (
										<Loader2 className="h-3 w-3 animate-spin" />
									) : (
										<Unplug className="h-3 w-3" />
									)}
								</Button>
							) : confirmDelete ? (
								<div className="flex gap-1">
									<Button
										variant="destructive"
										size="sm"
										className="h-7 text-xs"
										onClick={handleDelete}
										disabled={actionLoading}
									>
										{actionLoading ? (
											<Loader2 className="h-3 w-3 animate-spin" />
										) : (
											"Confirm"
										)}
									</Button>
									<Button
										variant="ghost"
										size="sm"
										className="h-7 text-xs"
										onClick={() => setConfirmDelete(false)}
									>
										Cancel
									</Button>
								</div>
							) : (
								<Button
									variant="ghost"
									size="sm"
									onClick={() => setConfirmDelete(true)}
									className="h-7 px-2 text-muted-foreground hover:text-destructive"
								>
									<Trash2 className="h-3 w-3" />
								</Button>
							)}
						</>
					)}
				</div>
			</div>

			{showTools && toolCount > 0 && (
				<div className="border-t border-border/40">
					<ToolsPanel tools={conn.tools} />
				</div>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// MCPDialog
// ---------------------------------------------------------------------------

function MCPDialog({
	open,
	onOpenChange,
	orgId,
	onAdded,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	orgId: string;
	onAdded: () => void;
}) {
	const [name, setName] = useState("");
	const [displayName, setDisplayName] = useState("");
	const [endpoint, setEndpoint] = useState("");
	const [credentialType, setCredentialType] = useState<"none" | "token">(
		"none",
	);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const resetForm = () => {
		setName("");
		setDisplayName("");
		setEndpoint("");
		setCredentialType("none");
		setError(null);
	};

	const handleOpenChange = (next: boolean) => {
		if (!next) resetForm();
		onOpenChange(next);
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsLoading(true);
		setError(null);

		try {
			const res = await fetch("/api/connections/custom", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: name || displayName.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
					displayName: displayName || name,
					mcpEndpoint: endpoint,
					transport: "http",
					credentialType,
					orgId,
				}),
			});

			if (!res.ok) {
				const data = await res.json();
				setError(data.error || "Failed to add server");
			} else {
				onAdded();
				handleOpenChange(false);
			}
		} catch {
			setError("Failed to add server");
		}
		setIsLoading(false);
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Add MCP Server</DialogTitle>
					<DialogDescription>
						Enter the details for your MCP server.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={handleSubmit} className="p-6 pt-4 space-y-3">
					{error && (
						<div className="p-2 rounded-md border border-destructive/50 bg-destructive/10 text-xs text-destructive">
							{error}
						</div>
					)}

					<div className="grid grid-cols-2 gap-3">
						<div>
							<Label className="text-xs">Display Name</Label>
							<Input
								value={displayName}
								onChange={(e) => {
									setDisplayName(e.target.value);
									if (!name) {
										setName(
											e.target.value
												.toLowerCase()
												.replace(/[^a-z0-9-]/g, "-")
												.replace(/-+/g, "-"),
										);
									}
								}}
								placeholder="My Server"
								required
								className="h-8 text-sm mt-1"
							/>
						</div>
						<div>
							<Label className="text-xs">Slug</Label>
							<Input
								value={name}
								onChange={(e) =>
									setName(
										e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
									)
								}
								placeholder="my-server"
								required
								className="h-8 text-sm mt-1"
							/>
						</div>
					</div>

					<div>
						<Label className="text-xs">Endpoint URL</Label>
						<Input
							value={endpoint}
							onChange={(e) => setEndpoint(e.target.value)}
							placeholder="https://my-server.com/mcp"
							required
							type="url"
							className="h-8 text-sm mt-1"
						/>
					</div>

					<div>
						<Label className="text-xs">Credential Type</Label>
						<div className="flex gap-2 mt-1">
							{(["none", "token"] as const).map((t) => (
								<button
									key={t}
									type="button"
									onClick={() => setCredentialType(t)}
									className={`px-3 py-1 rounded-md text-xs font-mono transition-colors ${
										credentialType === t
											? "bg-primary text-primary-foreground"
											: "bg-muted text-muted-foreground hover:text-foreground"
									}`}
								>
									{t}
								</button>
							))}
						</div>
					</div>

					<div className="flex gap-2 pt-1">
						<Button
							type="submit"
							size="sm"
							disabled={isLoading}
							className="flex-1"
						>
							{isLoading ? (
								<Loader2 className="h-3 w-3 animate-spin mr-1" />
							) : (
								<Plus className="h-3 w-3 mr-1" />
							)}
							Add Server
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}

// ---------------------------------------------------------------------------
// OpenAPIDialog
// ---------------------------------------------------------------------------

function OpenAPIDialog({
	open,
	onOpenChange,
	orgId,
	onAdded,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	orgId: string;
	onAdded: () => void;
}) {
	const [name, setName] = useState("");
	const [displayName, setDisplayName] = useState("");
	const [specUrl, setSpecUrl] = useState("");
	const [baseUrl, setBaseUrl] = useState("");
	const [authMethod, setAuthMethod] = useState<"none" | "bearer" | "api-key">(
		"none",
	);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const resetForm = () => {
		setName("");
		setDisplayName("");
		setSpecUrl("");
		setBaseUrl("");
		setAuthMethod("none");
		setError(null);
	};

	const handleOpenChange = (next: boolean) => {
		if (!next) resetForm();
		onOpenChange(next);
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsLoading(true);
		setError(null);

		try {
			const res = await fetch("/api/connections/custom", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					type: "openapi",
					name: name || displayName.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
					displayName: displayName || name,
					specUrl,
					baseUrl: baseUrl || undefined,
					authMethod,
					orgId,
				}),
			});

			if (!res.ok) {
				const data = await res.json();
				setError(data.error || "Failed to add OpenAPI connection");
			} else {
				onAdded();
				handleOpenChange(false);
			}
		} catch {
			setError("Failed to add OpenAPI connection");
		}
		setIsLoading(false);
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Add OpenAPI Connection</DialogTitle>
					<DialogDescription>
						Connect an API using its OpenAPI specification.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={handleSubmit} className="p-6 pt-4 space-y-3">
					{error && (
						<div className="p-2 rounded-md border border-destructive/50 bg-destructive/10 text-xs text-destructive">
							{error}
						</div>
					)}

					<div className="grid grid-cols-2 gap-3">
						<div>
							<Label className="text-xs">Display Name</Label>
							<Input
								value={displayName}
								onChange={(e) => {
									setDisplayName(e.target.value);
									if (!name) {
										setName(
											e.target.value
												.toLowerCase()
												.replace(/[^a-z0-9-]/g, "-")
												.replace(/-+/g, "-"),
										);
									}
								}}
								placeholder="Petstore API"
								required
								className="h-8 text-sm mt-1"
							/>
						</div>
						<div>
							<Label className="text-xs">Slug</Label>
							<Input
								value={name}
								onChange={(e) =>
									setName(
										e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
									)
								}
								placeholder="petstore-api"
								required
								className="h-8 text-sm mt-1"
							/>
						</div>
					</div>

					<div>
						<Label className="text-xs">Spec URL</Label>
						<Input
							value={specUrl}
							onChange={(e) => setSpecUrl(e.target.value)}
							placeholder="https://api.example.com/openapi.json"
							required
							type="url"
							className="h-8 text-sm mt-1"
						/>
					</div>

					<div>
						<Label className="text-xs">Base URL (optional)</Label>
						<Input
							value={baseUrl}
							onChange={(e) => setBaseUrl(e.target.value)}
							placeholder="https://api.example.com"
							type="url"
							className="h-8 text-sm mt-1"
						/>
					</div>

					<div>
						<Label className="text-xs">Auth Method</Label>
						<div className="flex gap-2 mt-1">
							{(["none", "bearer", "api-key"] as const).map((t) => (
								<button
									key={t}
									type="button"
									onClick={() => setAuthMethod(t)}
									className={`px-3 py-1 rounded-md text-xs font-mono transition-colors ${
										authMethod === t
											? "bg-primary text-primary-foreground"
											: "bg-muted text-muted-foreground hover:text-foreground"
									}`}
								>
									{t}
								</button>
							))}
						</div>
					</div>

					<div className="flex gap-2 pt-1">
						<Button
							type="submit"
							size="sm"
							disabled={isLoading}
							className="flex-1"
						>
							{isLoading ? (
								<Loader2 className="h-3 w-3 animate-spin mr-1" />
							) : (
								<Plus className="h-3 w-3 mr-1" />
							)}
							Add Connection
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}

// ---------------------------------------------------------------------------
// AgentAuthDialog
// ---------------------------------------------------------------------------

function AgentAuthDialog({
	open,
	onOpenChange,
	orgId,
	onAdded,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	orgId: string;
	onAdded: () => void;
}) {
	const [name, setName] = useState("");
	const [displayName, setDisplayName] = useState("");
	const [providerUrl, setProviderUrl] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const resetForm = () => {
		setName("");
		setDisplayName("");
		setProviderUrl("");
		setError(null);
	};

	const handleOpenChange = (next: boolean) => {
		if (!next) resetForm();
		onOpenChange(next);
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsLoading(true);
		setError(null);

		try {
			const res = await fetch("/api/connections/agent-auth", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: name || displayName.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
					displayName: displayName || name,
					providerUrl,
					orgId,
				}),
			});

			if (!res.ok) {
				const data = await res.json();
				setError(data.error || "Failed to add Agent Auth connection");
			} else {
				onAdded();
				handleOpenChange(false);
			}
		} catch {
			setError("Failed to add Agent Auth connection");
		}
		setIsLoading(false);
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Add Agent Auth Connection</DialogTitle>
					<DialogDescription>
						Connect to a remote Agent Auth provider. The IDP will proxy tool
						calls through its gateway.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={handleSubmit} className="p-6 pt-4 space-y-3">
					{error && (
						<div className="p-2 rounded-md border border-destructive/50 bg-destructive/10 text-xs text-destructive">
							{error}
						</div>
					)}

					<div className="grid grid-cols-2 gap-3">
						<div>
							<Label className="text-xs">Display Name</Label>
							<Input
								value={displayName}
								onChange={(e) => {
									setDisplayName(e.target.value);
									if (!name) {
										setName(
											e.target.value
												.toLowerCase()
												.replace(/[^a-z0-9-]/g, "-")
												.replace(/-+/g, "-"),
										);
									}
								}}
								placeholder="Smart Home"
								required
								className="h-8 text-sm mt-1"
							/>
						</div>
						<div>
							<Label className="text-xs">Slug</Label>
							<Input
								value={name}
								onChange={(e) =>
									setName(
										e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
									)
								}
								placeholder="smart-home"
								required
								className="h-8 text-sm mt-1"
							/>
						</div>
					</div>

					<div>
						<Label className="text-xs">Provider URL</Label>
						<Input
							value={providerUrl}
							onChange={(e) => setProviderUrl(e.target.value)}
							placeholder="https://provider.example.com"
							required
							type="url"
							className="h-8 text-sm mt-1"
						/>
						<p className="text-[10px] text-muted-foreground/70 mt-1">
							The URL must serve a{" "}
							<code className="font-mono text-[10px]">
								/.well-known/agent-configuration
							</code>{" "}
							endpoint.
						</p>
					</div>

					<div className="flex gap-2 pt-1">
						<Button
							type="submit"
							size="sm"
							disabled={isLoading}
							className="flex-1"
						>
							{isLoading ? (
								<Loader2 className="h-3 w-3 animate-spin mr-1" />
							) : (
								<Plus className="h-3 w-3 mr-1" />
							)}
							Add Connection
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}

// ---------------------------------------------------------------------------
// OAuthDialog
// ---------------------------------------------------------------------------

function OAuthDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const handleConnect = async (provider: (typeof OAUTH_PROVIDERS)[0]) => {
		try {
			await authClient.linkSocial({
				provider: provider.id as "github" | "google",
				callbackURL: window.location.pathname,
				scopes: (provider as any).scopes,
			});
		} catch {
			/* empty */
		}
		onOpenChange(false);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Connect OAuth Provider</DialogTitle>
					<DialogDescription>
						Choose a provider to connect. Your agents will be able to use its
						tools on your behalf.
					</DialogDescription>
				</DialogHeader>
				<div className="p-6 pt-4 space-y-2">
					{OAUTH_PROVIDERS.map((provider) => (
						<button
							key={provider.id}
							type="button"
							onClick={() => handleConnect(provider)}
							className="w-full flex items-center gap-3 p-3 rounded-lg border border-border/60 hover:bg-muted/50 transition-colors text-left"
						>
							<div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted/50 shrink-0">
								{provider.icon}
							</div>
							<div className="min-w-0">
								<p className="text-sm font-medium">{provider.name}</p>
								<p className="text-xs text-muted-foreground truncate">
									{provider.description}
								</p>
							</div>
						</button>
					))}
				</div>
			</DialogContent>
		</Dialog>
	);
}

// ---------------------------------------------------------------------------
// ConnectionsClient
// ---------------------------------------------------------------------------

export function ConnectionsClient({
	initialConnections,
	orgId,
}: {
	initialConnections: UnifiedConnection[];
	orgId: string;
}) {
	const router = useRouter();
	const [dialogMode, setDialogMode] = useState<
		null | "oauth" | "mcp" | "openapi" | "agent-auth"
	>(null);

	const connections = initialConnections;

	const handleMutate = () => {
		router.refresh();
	};

	const addConnectionDropdown = (
		align: "end" | "center",
		variant?: "outline",
	) => (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button size="sm" variant={variant} className="h-8 text-xs">
					<Plus className="h-3 w-3 mr-1.5" />
					Add Connection
					<ChevronDown className="h-3 w-3 ml-1.5" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align={align}
				className="w-[--radix-dropdown-menu-trigger-width]"
			>
				<DropdownMenuItem onClick={() => setDialogMode("oauth")}>
					<Globe className="h-4 w-4" />
					OAuth Provider
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => setDialogMode("mcp")}>
					<Server className="h-4 w-4" />
					Custom MCP
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => setDialogMode("openapi")}>
					<FileJson className="h-4 w-4" />
					OpenAPI
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => setDialogMode("agent-auth")}>
					<Shield className="h-4 w-4" />
					Agent Auth
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);

	return (
		<div className="flex flex-col gap-6 py-8">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-xl font-medium tracking-tight">Connections</h1>
					<p className="text-sm text-muted-foreground mt-0.5">
						Connect external providers to give your agents access to their
						tools.
					</p>
				</div>
				{orgId && addConnectionDropdown("end")}
			</div>

			{connections.length === 0 ? (
				<div className="border border-dashed border-border/60 rounded-lg p-12 text-center">
					<Cable className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
					<p className="text-sm text-muted-foreground mb-3">
						No connections yet. Add a provider or MCP server to get started.
					</p>
					{orgId && addConnectionDropdown("center", "outline")}
				</div>
			) : (
				<div className="space-y-2">
					{connections.map((conn) => (
						<ConnectionCard key={conn.id} conn={conn} onMutate={handleMutate} />
					))}
				</div>
			)}

			{connections.length > 0 && (
				<div className="flex items-start gap-2.5 text-xs text-muted-foreground/70 px-1">
					<Cable className="h-3.5 w-3.5 shrink-0 mt-0.5" />
					<p>
						OAuth providers are connected per-user. MCP, OpenAPI, and Agent Auth
						connections are shared across the organization. The IDP proxies tool
						calls through its gateway using stored credentials.
					</p>
				</div>
			)}

			{orgId && (
				<>
					<OAuthDialog
						open={dialogMode === "oauth"}
						onOpenChange={(open) => {
							if (!open) setDialogMode(null);
						}}
					/>
					<MCPDialog
						open={dialogMode === "mcp"}
						onOpenChange={(open) => {
							if (!open) setDialogMode(null);
						}}
						orgId={orgId}
						onAdded={handleMutate}
					/>
					<OpenAPIDialog
						open={dialogMode === "openapi"}
						onOpenChange={(open) => {
							if (!open) setDialogMode(null);
						}}
						orgId={orgId}
						onAdded={handleMutate}
					/>
					<AgentAuthDialog
						open={dialogMode === "agent-auth"}
						onOpenChange={(open) => {
							if (!open) setDialogMode(null);
						}}
						orgId={orgId}
						onAdded={handleMutate}
					/>
				</>
			)}
		</div>
	);
}
