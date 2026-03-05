"use client";

import { useEffect, useState, useCallback } from "react";
import {
	Bot,
	Shield,
	ShieldCheck,
	ShieldX,
	Clock,
	CheckCircle2,
	XCircle,
	RefreshCw,
	Monitor,
	Copy,
	KeyRound,
	Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Agent = {
	id: string;
	name: string;
	status: string;
	createdAt: string;
	lastUsedAt: string | null;
	mode?: string;
	hostId?: string;
};

type Permission = {
	id: string;
	agentId: string;
	scope: string;
	status: string;
	expiresAt: string | null;
};

type Host = {
	id: string;
	name: string | null;
	status: string;
	scopes: string[] | string | null;
	createdAt: string;
	lastUsedAt: string | null;
	activatedAt: string | null;
};

type EnrollmentResult = {
	hostId: string;
	status: string;
	scopes: string[];
	enrollmentToken: string;
	enrollmentTokenExpiresAt: string;
};

function timeAgo(dateStr: string | null) {
	if (!dateStr) return "never";
	const diff = Date.now() - new Date(dateStr).getTime();
	const mins = Math.floor(diff / 60_000);
	if (mins < 1) return "just now";
	if (mins < 60) return `${mins}m ago`;
	const hrs = Math.floor(mins / 60);
	if (hrs < 24) return `${hrs}h ago`;
	const days = Math.floor(hrs / 24);
	return `${days}d ago`;
}

function parseScopes(scopes: string[] | string | null): string[] {
	if (!scopes) return [];
	if (Array.isArray(scopes)) return scopes;
	try {
		const parsed = JSON.parse(scopes);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

export default function AgentsPage() {
	const [agents, setAgents] = useState<Agent[]>([]);
	const [hosts, setHosts] = useState<Host[]>([]);
	const [loading, setLoading] = useState(true);
	const [enrollOpen, setEnrollOpen] = useState(false);
	const [hostName, setHostName] = useState("");
	const [creatingHost, setCreatingHost] = useState(false);
	const [enrollmentResult, setEnrollmentResult] =
		useState<EnrollmentResult | null>(null);
	const [enrollError, setEnrollError] = useState<string | null>(null);

	const fetchAll = useCallback(async () => {
		try {
			const [agentRes, hostRes] = await Promise.all([
				fetch("/api/auth/agent/list", { credentials: "include" }),
				fetch("/api/auth/agent/host/list", { credentials: "include" }),
			]);
			const agentData = await agentRes.json();
			const hostData = await hostRes.json();
			const agentList = agentData.agents ?? agentData ?? [];
			setAgents(Array.isArray(agentList) ? agentList : []);
			const hostList = hostData.hosts ?? hostData ?? [];
			setHosts(Array.isArray(hostList) ? hostList : []);
		} catch {
			setAgents([]);
			setHosts([]);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchAll();
		const interval = setInterval(fetchAll, 5000);
		return () => clearInterval(interval);
	}, [fetchAll]);

	async function handleApprove(agentId: string, scopes?: string[]) {
		await fetch("/api/auth/agent/approve-scope", {
			method: "POST",
			credentials: "include",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				requestId: agentId,
				action: "approve",
				scopes,
			}),
		});
		fetchAll();
	}

	async function handleDeny(agentId: string) {
		await fetch("/api/auth/agent/approve-scope", {
			method: "POST",
			credentials: "include",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ requestId: agentId, action: "deny" }),
		});
		fetchAll();
	}

	async function handleRevoke(agentId: string) {
		await fetch("/api/auth/agent/revoke", {
			method: "POST",
			credentials: "include",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ agentId }),
		});
		fetchAll();
	}

	async function handleRevokeHost(hostId: string) {
		await fetch("/api/auth/agent/host/revoke", {
			method: "POST",
			credentials: "include",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ hostId }),
		});
		fetchAll();
	}

	async function handleCreateEnrollmentHost() {
		setCreatingHost(true);
		setEnrollError(null);
		try {
			const res = await fetch("/api/auth/agent/host/create", {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: hostName.trim() || undefined,
				}),
			});
			const data = (await res.json()) as EnrollmentResult & { error?: string };
			if (!res.ok) {
				setEnrollError(data.error ?? "Failed to provision host.");
				return;
			}
			setEnrollmentResult(data);
			void fetchAll();
		} catch {
			setEnrollError("Failed to provision host.");
		} finally {
			setCreatingHost(false);
		}
	}

	const activeAgents = agents.filter((a) => a.status === "active");
	const pendingAgents = agents.filter((a) => a.status === "pending");
	const otherAgents = agents.filter(
		(a) => a.status !== "active" && a.status !== "pending",
	);

	return (
		<div className="space-y-8">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">
						Agents & Hosts
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Manage connected AI agents and their host environments
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => {
							setEnrollmentResult(null);
							setEnrollError(null);
							setEnrollOpen(true);
						}}
					>
						<KeyRound className="size-3.5" />
						Enroll Host
					</Button>
					<Button variant="outline" size="sm" onClick={fetchAll}>
						<RefreshCw className="size-3.5" />
						Refresh
					</Button>
				</div>
			</div>

			{loading ? (
				<div className="py-16 text-center text-muted-foreground">
					Loading...
				</div>
			) : (
				<Tabs defaultValue="agents">
					<TabsList>
						<TabsTrigger value="agents">
							Agents ({agents.length})
						</TabsTrigger>
						<TabsTrigger value="hosts">
							Hosts ({hosts.length})
						</TabsTrigger>
					</TabsList>

					<TabsContent value="agents" className="mt-4">
						{agents.length === 0 ? (
							<div className="rounded-xl border border-dashed border-border py-16 text-center">
								<Bot className="mx-auto size-10 text-muted-foreground/40" />
								<p className="mt-3 text-sm font-medium text-muted-foreground">
									No agents connected
								</p>
								<p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
									Agents can connect to AgentDeploy via the
									device authorization flow to create sites
									and deploy HTML.
								</p>
							</div>
						) : (
							<div className="space-y-6">
								{pendingAgents.length > 0 && (
									<div className="space-y-3">
										<h2 className="flex items-center gap-2 text-sm font-medium text-warning">
											<Clock className="size-4" />
											Pending Approval (
											{pendingAgents.length})
										</h2>
										{pendingAgents.map((agent) => (
											<AgentCard
												key={agent.id}
												agent={agent}
												onApprove={handleApprove}
												onDeny={handleDeny}
												onRevoke={handleRevoke}
											/>
										))}
									</div>
								)}

								{activeAgents.length > 0 && (
									<div className="space-y-3">
										<h2 className="flex items-center gap-2 text-sm font-medium text-success">
											<ShieldCheck className="size-4" />
											Active ({activeAgents.length})
										</h2>
										{activeAgents.map((agent) => (
											<AgentCard
												key={agent.id}
												agent={agent}
												onApprove={handleApprove}
												onDeny={handleDeny}
												onRevoke={handleRevoke}
											/>
										))}
									</div>
								)}

								{otherAgents.length > 0 && (
									<div className="space-y-3">
										<h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
											<ShieldX className="size-4" />
											Revoked / Expired (
											{otherAgents.length})
										</h2>
										{otherAgents.map((agent) => (
											<AgentCard
												key={agent.id}
												agent={agent}
												onApprove={handleApprove}
												onDeny={handleDeny}
												onRevoke={handleRevoke}
											/>
										))}
									</div>
								)}
							</div>
						)}
					</TabsContent>

					<TabsContent value="hosts" className="mt-4">
						{hosts.length === 0 ? (
							<div className="rounded-xl border border-dashed border-border py-16 text-center">
								<Monitor className="mx-auto size-10 text-muted-foreground/40" />
								<p className="mt-3 text-sm font-medium text-muted-foreground">
									No hosts registered
								</p>
								<p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
									Hosts are environments (like Cursor, VS
									Code) that agents connect through. They are
									created automatically during the device auth
									flow or provisioned here for enrollment.
								</p>
								<Button
									className="mt-5"
									variant="outline"
									onClick={() => {
										setEnrollmentResult(null);
										setEnrollError(null);
										setEnrollOpen(true);
									}}
								>
									<KeyRound className="size-3.5" />
									Provision First Host
								</Button>
							</div>
						) : (
							<div className="space-y-3">
								{hosts.map((host) => (
									<HostCard
										key={host.id}
										host={host}
										agentCount={
											agents.filter(
												(a) => a.hostId === host.id,
											).length
										}
										onRevoke={handleRevokeHost}
									/>
								))}
							</div>
						)}
					</TabsContent>
				</Tabs>
			)}

			<div className="rounded-xl border border-border bg-card p-6">
				<h2 className="text-sm font-semibold">How Agent Auth Works</h2>
				<div className="mt-4 grid grid-cols-3 gap-6">
					<div className="space-y-2">
						<div className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
							<span className="text-sm font-bold">1</span>
						</div>
						<p className="text-sm font-medium">Agent Connects</p>
						<p className="text-xs text-muted-foreground">
							An AI agent initiates a device authorization flow
							and receives a user code to present.
						</p>
					</div>
					<div className="space-y-2">
						<div className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
							<span className="text-sm font-bold">2</span>
						</div>
						<p className="text-sm font-medium">You Approve</p>
						<p className="text-xs text-muted-foreground">
							Review the requested scopes and approve or deny the
							agent&apos;s access to your sites.
						</p>
					</div>
					<div className="space-y-2">
						<div className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
							<span className="text-sm font-bold">3</span>
						</div>
						<p className="text-sm font-medium">Agent Deploys</p>
						<p className="text-xs text-muted-foreground">
							The agent can now create sites, deploy HTML, and
							manage deployments within its granted scopes.
						</p>
					</div>
				</div>
			</div>

			<HostEnrollmentDialog
				open={enrollOpen}
				onOpenChange={(open) => {
					setEnrollOpen(open);
					if (!open) {
						setCreatingHost(false);
						setEnrollError(null);
					}
				}}
				hostName={hostName}
				onHostNameChange={setHostName}
				onSubmit={handleCreateEnrollmentHost}
				submitting={creatingHost}
				result={enrollmentResult}
				error={enrollError}
			/>
		</div>
	);
}

function HostEnrollmentDialog({
	open,
	onOpenChange,
	hostName,
	onHostNameChange,
	onSubmit,
	submitting,
	result,
	error,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	hostName: string;
	onHostNameChange: (value: string) => void;
	onSubmit: () => void;
	submitting: boolean;
	result: EnrollmentResult | null;
	error: string | null;
}) {
	const baseUrl =
		typeof window === "undefined"
			? "http://localhost:4100"
			: window.location.origin;
	const command = result
		? `npx @auth/agents enroll --url ${baseUrl} --token ${result.enrollmentToken}`
		: "";

	async function copy(value: string) {
		try {
			await navigator.clipboard.writeText(value);
		} catch {}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="border-border bg-card sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Provision Host Enrollment</DialogTitle>
					<DialogDescription>
						Create a pending host here, then enroll the real device using
						the one-time token below. If that device already has an
						autonomous host credential, enrollment will claim it into your
						account instead of creating a separate host.
					</DialogDescription>
				</DialogHeader>

				{result ? (
					<div className="space-y-5">
						<div className="rounded-xl border border-success/30 bg-success/5 p-4">
							<div className="flex items-start justify-between gap-4">
								<div>
									<p className="text-sm font-medium">
										Host provisioned successfully
									</p>
									<p className="mt-1 text-xs text-muted-foreground">
										Host ID: <span className="font-mono">{result.hostId}</span>
									</p>
									<p className="mt-1 text-xs text-muted-foreground">
										Token expires at{" "}
										{new Date(result.enrollmentTokenExpiresAt).toLocaleString()}
									</p>
								</div>
								<Badge variant="warning">{result.status}</Badge>
							</div>
						</div>

						<div className="space-y-2">
							<Label>Enrollment token</Label>
							<div className="flex gap-2">
								<Input value={result.enrollmentToken} readOnly className="font-mono" />
								<Button variant="outline" onClick={() => copy(result.enrollmentToken)}>
									<Copy className="size-3.5" />
									Copy
								</Button>
							</div>
						</div>

						<div className="space-y-2">
							<Label>CLI command</Label>
							<div className="rounded-xl border border-border bg-background/70 p-4">
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0">
										<p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
											<Terminal className="size-3.5" />
											Run on the device
										</p>
										<pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all text-sm font-mono text-foreground">
											{command}
										</pre>
									</div>
									<Button variant="outline" onClick={() => copy(command)}>
										<Copy className="size-3.5" />
										Copy
									</Button>
								</div>
							</div>
						</div>

						{result.scopes.length > 0 && (
							<div className="space-y-2">
								<Label>Initial scope budget</Label>
								<div className="flex flex-wrap gap-1.5">
									{result.scopes.map((scope) => (
										<Badge
											key={scope}
											variant="outline"
											className="font-mono text-[10px]"
										>
											{scope}
										</Badge>
									))}
								</div>
							</div>
						)}
					</div>
				) : (
					<div className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="host-name">Host name</Label>
							<Input
								id="host-name"
								placeholder="Cursor on MacBook Pro"
								value={hostName}
								onChange={(e) => onHostNameChange(e.target.value)}
							/>
							<p className="text-xs text-muted-foreground">
								Optional. This label helps you recognize the host after it
								comes online.
							</p>
						</div>

						<div className="rounded-xl border border-border bg-background/40 p-4 text-xs text-muted-foreground">
							Provisioning creates a pending host and issues a one-time
							enrollment token. The actual device proves possession later by
							running the generated CLI command. If the CLI already has a
							saved host key for this app, that same identity is reused so
							existing autonomous data can be claimed.
						</div>

						{error && (
							<div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
								{error}
							</div>
						)}
					</div>
				)}

				<DialogFooter>
					{result ? (
						<Button
							variant="outline"
							onClick={() => {
								onHostNameChange("");
								onOpenChange(false);
							}}
						>
							Close
						</Button>
					) : (
						<>
							<Button variant="outline" onClick={() => onOpenChange(false)}>
								Cancel
							</Button>
							<Button onClick={onSubmit} disabled={submitting}>
								<KeyRound className="size-3.5" />
								{submitting ? "Provisioning..." : "Create enrollment token"}
							</Button>
						</>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function AgentCard({
	agent,
	onApprove,
	onDeny,
	onRevoke,
}: {
	agent: Agent;
	onApprove: (id: string, scopes?: string[]) => void;
	onDeny: (id: string) => void;
	onRevoke: (id: string) => void;
}) {
	const [permissions, setPermissions] = useState<Permission[]>([]);

	useEffect(() => {
		fetch(`/api/auth/agent/get?agentId=${agent.id}`, {
			credentials: "include",
		})
			.then((r) => r.json())
			.then((data) => {
				setPermissions(data.permissions ?? []);
			})
			.catch(() => {});
	}, [agent.id]);

	const activePerms = permissions.filter((p) => p.status === "active");
	const pendingPerms = permissions.filter((p) => p.status === "pending");

	return (
		<div className="rounded-xl border border-border bg-card p-5">
			<div className="flex items-start justify-between">
				<div className="flex items-center gap-3">
					<div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
						<Bot className="size-4 text-primary" />
					</div>
					<div>
						<p className="text-sm font-semibold">{agent.name}</p>
						<div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
							<Badge
								variant={
									agent.status === "active"
										? "success"
										: agent.status === "pending"
											? "warning"
											: "secondary"
								}
							>
								{agent.status}
							</Badge>
							{agent.mode && (
								<Badge variant="outline">{agent.mode}</Badge>
							)}
							<span>Last used: {timeAgo(agent.lastUsedAt)}</span>
						</div>
					</div>
				</div>
				<div className="flex items-center gap-2">
					{agent.status === "active" && (
						<Button
							variant="destructive"
							size="sm"
							onClick={() => onRevoke(agent.id)}
						>
							<XCircle className="size-3.5" />
							Revoke
						</Button>
					)}
				</div>
			</div>

			{(activePerms.length > 0 || pendingPerms.length > 0) && (
				<div className="mt-4 space-y-3">
					{activePerms.length > 0 && (
						<div>
							<p className="text-xs font-medium text-muted-foreground mb-2">
								<Shield className="inline size-3 mr-1" />
								Granted Scopes
							</p>
							<div className="flex flex-wrap gap-1.5">
								{activePerms.map((p) => (
									<Badge
										key={p.id}
										variant="success"
										className="font-mono text-[10px]"
									>
										<CheckCircle2 className="mr-1 size-2.5" />
										{p.scope}
									</Badge>
								))}
							</div>
						</div>
					)}

					{pendingPerms.length > 0 && (
						<div className="rounded-lg border border-warning/30 bg-warning/5 p-4">
							<p className="text-xs font-medium text-warning mb-2">
								<Clock className="inline size-3 mr-1" />
								Pending Scope Requests
							</p>
							<div className="flex flex-wrap gap-1.5 mb-3">
								{pendingPerms.map((p) => (
									<Badge
										key={p.id}
										variant="warning"
										className="font-mono text-[10px]"
									>
										<Clock className="mr-1 size-2.5" />
										{p.scope}
									</Badge>
								))}
							</div>
							<div className="flex gap-2">
								<Button
									size="sm"
									onClick={() =>
										onApprove(
											agent.id,
											pendingPerms.map((p) => p.scope),
										)
									}
								>
									<CheckCircle2 className="size-3.5" />
									Approve All
								</Button>
								<Button
									variant="outline"
									size="sm"
									onClick={() => onDeny(agent.id)}
								>
									<XCircle className="size-3.5" />
									Deny
								</Button>
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

function HostCard({
	host,
	agentCount,
	onRevoke,
}: {
	host: Host;
	agentCount: number;
	onRevoke: (id: string) => void;
}) {
	const scopes = parseScopes(host.scopes);

	return (
		<div className="rounded-xl border border-border bg-card p-5">
			<div className="flex items-start justify-between">
				<div className="flex items-center gap-3">
					<div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
						<Monitor className="size-4 text-primary" />
					</div>
					<div>
						<p className="text-sm font-semibold">
							{host.name ?? "Unnamed Host"}
						</p>
						<div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
							<Badge
								variant={
									host.status === "active"
										? "success"
										: host.status === "pending" ||
												host.status === "pending_enrollment"
											? "warning"
											: "secondary"
								}
							>
								{host.status}
							</Badge>
							<span>
								{agentCount} agent{agentCount !== 1 ? "s" : ""}
							</span>
							<span>
								Created: {timeAgo(host.createdAt)}
							</span>
							{host.lastUsedAt && (
								<span>
									Last used: {timeAgo(host.lastUsedAt)}
								</span>
							)}
						</div>
					</div>
				</div>
				{host.status === "active" && (
					<Button
						variant="destructive"
						size="sm"
						onClick={() => onRevoke(host.id)}
					>
						<XCircle className="size-3.5" />
						Revoke
					</Button>
				)}
			</div>

			{scopes.length > 0 && (
				<div className="mt-4">
					<p className="text-xs font-medium text-muted-foreground mb-2">
						<Shield className="inline size-3 mr-1" />
						Scope Budget
					</p>
					<div className="flex flex-wrap gap-1.5">
						{scopes.map((s) => (
							<Badge
								key={s}
								variant="outline"
								className="font-mono text-[10px]"
							>
								{s}
							</Badge>
						))}
					</div>
				</div>
			)}

			<p className="mt-3 text-[10px] text-muted-foreground font-mono truncate">
				{host.id}
			</p>
		</div>
	);
}
