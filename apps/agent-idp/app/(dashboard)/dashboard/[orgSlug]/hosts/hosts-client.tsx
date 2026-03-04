"use client";

import {
	Ban,
	Bot,
	Check,
	ChevronDown,
	ChevronRight,
	ClipboardCopy,
	Clock,
	KeyRound,
	Loader2,
	Plus,
	Search,
	Shield,
	ShieldOff,
	Terminal,
	X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createHost, revokeHost, updateHost } from "@/lib/auth/agent-api";
import { cn } from "@/lib/utils";

type Host = {
	id: string;
	name: string | null;
	userId: string | null;
	status: string;
	scopes: string[];
	activeAgents: number;
	createdAt: string | null;
	lastUsedAt: string | null;
};

type AvailableScope = {
	name: string;
	description: string;
	provider: string;
};

function formatRelative(iso: string | null): string {
	if (!iso) return "Never";
	const diff = Date.now() - new Date(iso).getTime();
	const mins = Math.floor(diff / 60000);
	if (mins < 1) return "Just now";
	if (mins < 60) return `${mins}m ago`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

function ScopeDisplay({
	scopes,
	availableScopes,
}: {
	scopes: string[];
	availableScopes: AvailableScope[];
}) {
	if (scopes.length === 0) return null;

	const scopeMap = new Map(availableScopes.map((s) => [s.name, s]));

	const grouped = new Map<string, string[]>();
	for (const scope of scopes) {
		const dot = scope.indexOf(".");
		const provider = dot > 0 ? scope.slice(0, dot) : "_custom";
		const list = grouped.get(provider) ?? [];
		list.push(scope);
		grouped.set(provider, list);
	}

	return (
		<div className="space-y-2">
			{[...grouped.entries()].map(([provider, providerScopes]) => (
				<div key={provider}>
					{provider !== "_custom" && (
						<span className="text-[10px] font-mono text-muted-foreground/70 uppercase">
							{provider}
						</span>
					)}
					<div className="flex flex-wrap gap-1 mt-0.5">
						{providerScopes.map((scope) => {
							const info = scopeMap.get(scope);
							const isWildcard = scope.endsWith(".*");
							const label = isWildcard
								? scope
								: scope.includes(".")
									? scope.slice(scope.indexOf(".") + 1)
									: scope;
							return (
								<span
									key={scope}
									title={info?.description ?? scope}
									className={cn(
										"inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-mono",
										isWildcard
											? "border-foreground/20 bg-foreground/[0.07] text-foreground font-medium"
											: "border-border/50 bg-muted/30 text-foreground/80",
									)}
								>
									{isWildcard && (
										<Shield className="h-2.5 w-2.5 text-emerald-500 shrink-0" />
									)}
									{label}
								</span>
							);
						})}
					</div>
				</div>
			))}
		</div>
	);
}

function ScopeEditor({
	scopes,
	availableScopes,
	onSave,
	saving,
}: {
	scopes: string[];
	availableScopes: AvailableScope[];
	onSave: (scopes: string[]) => Promise<{ error?: string }>;
	saving: boolean;
}) {
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState<string[]>(scopes);
	const [newScope, setNewScope] = useState("");
	const [scopeSearch, setScopeSearch] = useState("");
	const [error, setError] = useState<string | null>(null);
	const prevScopesRef = useRef(JSON.stringify([...scopes].sort()));

	useEffect(() => {
		const serialized = JSON.stringify([...scopes].sort());
		if (serialized !== prevScopesRef.current) {
			prevScopesRef.current = serialized;
			setDraft(scopes);
		}
	}, [scopes]);

	const toggleScope = (scope: string) => {
		setDraft((prev) =>
			prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
		);
	};

	const toggleWildcard = (provider: string) => {
		const wildcard = `${provider}.*`;
		setDraft((prev) =>
			prev.includes(wildcard)
				? prev.filter((s) => s !== wildcard)
				: [...prev, wildcard],
		);
	};

	const addCustomScope = () => {
		const trimmed = newScope.trim();
		if (!trimmed || draft.includes(trimmed)) return;
		setDraft([...draft, trimmed]);
		setNewScope("");
	};

	const removeScope = (scope: string) => {
		setDraft(draft.filter((s) => s !== scope));
	};

	const handleSave = async () => {
		setError(null);
		const res = await onSave(draft);
		if (res.error) {
			setError(res.error);
		} else {
			setEditing(false);
		}
	};

	const handleCancel = () => {
		setDraft(scopes);
		setNewScope("");
		setScopeSearch("");
		setError(null);
		setEditing(false);
	};

	const changed =
		JSON.stringify([...draft].sort()) !== JSON.stringify([...scopes].sort());

	const providers = [...new Set(availableScopes.map((s) => s.provider))].sort();

	const filteredAvailable = scopeSearch
		? availableScopes.filter(
				(s) =>
					s.name.toLowerCase().includes(scopeSearch.toLowerCase()) ||
					s.description.toLowerCase().includes(scopeSearch.toLowerCase()),
			)
		: availableScopes;

	const filteredProviders = scopeSearch
		? [...new Set(filteredAvailable.map((s) => s.provider))].sort()
		: providers;

	if (!editing) {
		return (
			<div className="border-t border-border/40 px-4 py-3">
				<div className="flex items-center justify-between mb-2">
					<span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
						Pre-authorized Scopes
					</span>
					<button
						type="button"
						onClick={() => setEditing(true)}
						className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
					>
						Edit
					</button>
				</div>
				{scopes.length > 0 ? (
					<ScopeDisplay scopes={scopes} availableScopes={availableScopes} />
				) : (
					<p className="text-xs text-muted-foreground/60">
						No pre-authorized scopes. Agents on this host will need user
						approval for every capability.
					</p>
				)}
			</div>
		);
	}

	const customScopes = draft.filter(
		(s) => !availableScopes.some((a) => a.name === s) && !s.endsWith(".*"),
	);

	return (
		<div className="border-t border-border/40 flex flex-col max-h-[520px]">
			{/* Sticky header */}
			<div className="flex items-center justify-between px-4 pt-3 pb-2 shrink-0">
				<span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
					Edit Pre-authorized Scopes
				</span>
				<span className="text-[10px] text-muted-foreground tabular-nums">
					{draft.length} selected
				</span>
			</div>

			{availableScopes.length > 8 && (
				<div className="relative px-4 pb-2 shrink-0">
					<Search className="absolute left-6.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
					<Input
						value={scopeSearch}
						onChange={(e) => setScopeSearch(e.target.value)}
						placeholder="Filter scopes..."
						className="h-7 text-xs pl-8 bg-muted/30 border-border/40"
					/>
				</div>
			)}

			{/* Scrollable scope list */}
			<div className="flex-1 min-h-0 overflow-y-auto px-4">
				{filteredProviders.length > 0 && (
					<div className="space-y-3 pb-2">
						{filteredProviders.map((provider) => {
							const providerScopes = filteredAvailable.filter(
								(s) => s.provider === provider,
							);
							const wildcard = `${provider}.*`;
							const wildcardActive = draft.includes(wildcard);

							return (
								<div key={provider} className="space-y-1.5">
									<div className="flex items-center justify-between sticky top-0 bg-card/95 backdrop-blur-sm py-1 -mx-0.5 px-0.5 z-10">
										<span className="text-[11px] font-medium font-mono text-foreground/80">
											{provider}
										</span>
										<button
											type="button"
											onClick={() => toggleWildcard(provider)}
											className={cn(
												"text-[10px] px-1.5 py-0.5 rounded transition-colors font-mono",
												wildcardActive
													? "bg-foreground text-background"
													: "text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted/60",
											)}
										>
											{wildcardActive ? "All granted" : "Grant all"}
										</button>
									</div>
									<div className="space-y-0.5">
										{providerScopes.map((scope) => {
											const active =
												draft.includes(scope.name) || wildcardActive;
											return (
												<button
													key={scope.name}
													type="button"
													onClick={() => toggleScope(scope.name)}
													disabled={wildcardActive}
													className={cn(
														"flex items-start gap-2 w-full rounded-md border px-2.5 py-1.5 text-left transition-all",
														active
															? "border-foreground/20 bg-foreground/5"
															: "border-border/40 bg-transparent hover:border-foreground/15 hover:bg-muted/20",
														wildcardActive && "opacity-50 cursor-default",
													)}
												>
													<div
														className={cn(
															"mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-colors",
															active
																? "border-foreground bg-foreground text-background"
																: "border-border/60",
														)}
													>
														{active && <Check className="h-2.5 w-2.5" />}
													</div>
													<div className="min-w-0 flex-1">
														<span className="text-[11px] font-mono text-foreground block truncate">
															{scope.name}
														</span>
														{scope.description && (
															<span className="text-[10px] text-muted-foreground/70 block truncate mt-px">
																{scope.description}
															</span>
														)}
													</div>
												</button>
											);
										})}
									</div>
								</div>
							);
						})}
					</div>
				)}

				{availableScopes.length === 0 && (
					<div className="rounded-md border border-dashed border-border/40 p-3 text-center my-2">
						<p className="text-xs text-muted-foreground/60">
							No scopes available from connections. You can still add custom
							scopes below.
						</p>
					</div>
				)}

				{customScopes.length > 0 && (
					<div className="pb-2">
						<span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
							Custom scopes
						</span>
						<div className="flex flex-wrap gap-1.5 mt-1.5">
							{customScopes.map((scope) => (
								<span
									key={scope}
									className="inline-flex items-center gap-1 rounded-md border border-foreground/20 bg-foreground/[0.07] px-2 py-1 text-[11px] font-mono"
								>
									{scope}
									<button
										type="button"
										onClick={() => removeScope(scope)}
										className="text-muted-foreground/40 hover:text-destructive transition-colors"
									>
										<X className="h-2.5 w-2.5" />
									</button>
								</span>
							))}
						</div>
					</div>
				)}
			</div>

			{/* Sticky footer */}
			<div className="shrink-0 px-4 pb-3 pt-2 space-y-2">
				<div className="flex gap-1.5">
					<Input
						value={newScope}
						onChange={(e) => setNewScope(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.preventDefault();
								addCustomScope();
							}
						}}
						placeholder="Add custom scope..."
						className="h-7 text-xs font-mono flex-1"
					/>
					<Button
						type="button"
						size="sm"
						variant="outline"
						className="h-7 text-xs px-2"
						onClick={addCustomScope}
						disabled={!newScope.trim()}
					>
						<Plus className="h-3 w-3" />
					</Button>
				</div>
				{error && <p className="text-[11px] text-red-500 px-0.5">{error}</p>}
				<div className="flex gap-1.5 pt-1 border-t border-border/30">
					<Button
						size="sm"
						className="h-7 text-xs"
						onClick={handleSave}
						disabled={!changed || saving}
					>
						{saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
						Save Changes
					</Button>
					<Button
						size="sm"
						variant="ghost"
						className="h-7 text-xs"
						onClick={handleCancel}
					>
						Cancel
					</Button>
					{changed && !error && (
						<span className="text-[10px] text-amber-600 dark:text-amber-400 self-center ml-auto">
							Unsaved changes
						</span>
					)}
				</div>
			</div>
		</div>
	);
}

function HostCard({
	host,
	availableScopes,
	onMutate,
	canDelete = true,
}: {
	host: Host;
	availableScopes: AvailableScope[];
	onMutate: () => void;
	canDelete?: boolean;
}) {
	const [expanded, setExpanded] = useState(false);
	const [saving, setSaving] = useState(false);
	const [revoking, setRevoking] = useState(false);
	const [confirmRevoke, setConfirmRevoke] = useState(false);

	const isActive = host.status === "active";
	const isRevoked = host.status === "revoked";
	const isPendingEnrollment = host.status === "pending_enrollment";
	const scopes = Array.isArray(host.scopes) ? host.scopes : [];

	const handleRevoke = async () => {
		setRevoking(true);
		const res = await revokeHost(host.id);
		if (!res.error) {
			onMutate();
		}
		setRevoking(false);
		setConfirmRevoke(false);
	};

	const handleSaveScopes = async (
		newScopes: string[],
	): Promise<{ error?: string }> => {
		setSaving(true);
		const res = await updateHost({ hostId: host.id, scopes: newScopes });
		if (!res.error) {
			onMutate();
		}
		setSaving(false);
		return res;
	};

	return (
		<div className="border border-border/60 rounded-lg overflow-hidden bg-card/50">
			<div className="p-4 flex items-center gap-3">
				<div
					className={cn(
						"flex h-10 w-10 items-center justify-center rounded-lg shrink-0",
						isActive
							? "bg-emerald-500/10"
							: isRevoked
								? "bg-red-500/10"
								: isPendingEnrollment
									? "bg-amber-500/10"
									: "bg-muted/40",
					)}
				>
					<KeyRound
						className={cn(
							"h-5 w-5",
							isActive
								? "text-emerald-600 dark:text-emerald-400"
								: isRevoked
									? "text-red-500/60"
									: isPendingEnrollment
										? "text-amber-600 dark:text-amber-400"
										: "text-muted-foreground",
						)}
					/>
				</div>
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2">
						<h3 className="text-sm font-medium truncate">
							{host.name ?? "Unnamed Host"}
						</h3>
						<span
							className={cn(
								"text-[10px] font-medium px-1.5 py-0.5 rounded-full",
								isActive
									? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
									: host.status === "pending" || isPendingEnrollment
										? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
										: "bg-red-500/10 text-red-600 dark:text-red-400",
							)}
						>
							{isPendingEnrollment ? "awaiting enrollment" : host.status}
						</span>
					</div>
					<div className="flex items-center gap-3 mt-0.5 flex-wrap">
						<span className="text-xs text-muted-foreground flex items-center gap-1">
							<Bot className="h-3 w-3" />
							{host.activeAgents} agent
							{host.activeAgents !== 1 ? "s" : ""}
						</span>
						<span className="text-xs text-muted-foreground flex items-center gap-1">
							{scopes.length > 0 ? (
								<Shield className="h-3 w-3 text-emerald-500" />
							) : (
								<ShieldOff className="h-3 w-3" />
							)}
							{scopes.length > 0
								? `${scopes.length} pre-authorized`
								: "No pre-authorized scopes"}
						</span>
						{host.lastUsedAt && (
							<span className="text-xs text-muted-foreground">
								{formatRelative(host.lastUsedAt)}
							</span>
						)}
						<span
							className="text-[10px] font-mono text-muted-foreground/40 truncate max-w-[140px]"
							title={host.id}
						>
							{host.id}
						</span>
					</div>
				</div>
				<div className="flex items-center gap-1.5 shrink-0">
					{!isRevoked && (
						<button
							type="button"
							onClick={() => setExpanded(!expanded)}
							className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
						>
							Manage
							{expanded ? (
								<ChevronDown className="h-3 w-3" />
							) : (
								<ChevronRight className="h-3 w-3" />
							)}
						</button>
					)}
				{!isRevoked &&
					canDelete &&
					(confirmRevoke ? (
						<div className="flex gap-1">
							<Button
								variant="destructive"
								size="sm"
								className="h-7 text-xs"
								onClick={handleRevoke}
								disabled={revoking}
							>
								{revoking ? (
									<Loader2 className="h-3 w-3 animate-spin" />
								) : (
									"Confirm"
								)}
							</Button>
							<Button
								variant="ghost"
								size="sm"
								className="h-7 text-xs"
								onClick={() => setConfirmRevoke(false)}
							>
								Cancel
							</Button>
						</div>
					) : (
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setConfirmRevoke(true)}
							className="h-7 px-2 text-muted-foreground hover:text-destructive"
							title="Revoke host and all its agents"
						>
							<Ban className="h-3 w-3" />
						</Button>
					))}
				</div>
			</div>

			{expanded && !isRevoked && (
				<ScopeEditor
					scopes={scopes}
					availableScopes={availableScopes}
					onSave={handleSaveScopes}
					saving={saving}
				/>
			)}
		</div>
	);
}

function CreateHostDialog({
	open,
	onOpenChange,
	availableScopes,
	onCreated,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	availableScopes: AvailableScope[];
	onCreated: () => void;
}) {
	const [step, setStep] = useState<"form" | "token">("form");
	const [name, setName] = useState("");
	const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
	const [creating, setCreating] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [tokenData, setTokenData] = useState<{
		hostId: string;
		enrollmentToken: string;
		expiresAt: string;
	} | null>(null);
	const [copied, setCopied] = useState<"token" | "command" | null>(null);

	const reset = useCallback(() => {
		setStep("form");
		setName("");
		setSelectedScopes([]);
		setCreating(false);
		setError(null);
		setTokenData(null);
		setCopied(null);
	}, []);

	const handleOpenChange = (open: boolean) => {
		if (!open) reset();
		onOpenChange(open);
	};

	const handleCreate = async () => {
		if (!name.trim()) {
			setError("Name is required.");
			return;
		}
		setCreating(true);
		setError(null);

		const res = await createHost({
			name: name.trim(),
			scopes: selectedScopes.length > 0 ? selectedScopes : undefined,
		});

		if (res.error) {
			setError(res.error);
			setCreating(false);
			return;
		}

		if (res.data) {
			setTokenData({
				hostId: res.data.hostId,
				enrollmentToken: res.data.enrollmentToken,
				expiresAt: res.data.enrollmentTokenExpiresAt,
			});
			setStep("token");
			onCreated();
		}
		setCreating(false);
	};

	const copyToClipboard = async (text: string, type: "token" | "command") => {
		try {
			await navigator.clipboard.writeText(text);
			setCopied(type);
			setTimeout(() => setCopied(null), 2000);
		} catch {}
	};

	const cliCommand = tokenData
		? `npx @auth/agents enroll --token ${tokenData.enrollmentToken} --url ${window.location.origin}`
		: "";

	const providers = [...new Set(availableScopes.map((s) => s.provider))].sort();

	const toggleScope = (scope: string) => {
		setSelectedScopes((prev) =>
			prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
		);
	};

	const toggleWildcard = (provider: string) => {
		const wildcard = `${provider}.*`;
		setSelectedScopes((prev) =>
			prev.includes(wildcard)
				? prev.filter((s) => s !== wildcard)
				: [...prev, wildcard],
		);
	};

	const expiresIn = tokenData?.expiresAt
		? Math.max(
				0,
				Math.floor(
					(new Date(tokenData.expiresAt).getTime() - Date.now()) / 60000,
				),
			)
		: 0;

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="max-w-md">
				{step === "form" ? (
					<>
						<DialogHeader>
							<DialogTitle>Create Host</DialogTitle>
							<DialogDescription>
								Provision a new trusted host. You will receive a one-time
								enrollment token to set up the device.
							</DialogDescription>
						</DialogHeader>
						<div className="px-6 py-4 space-y-4">
							<div className="space-y-1.5">
								<label className="text-xs font-medium text-foreground">
									Host Name
								</label>
								<Input
									value={name}
									onChange={(e) => setName(e.target.value)}
									placeholder="e.g. Production MCP Server"
									className="h-8 text-sm"
									autoFocus
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											void handleCreate();
										}
									}}
								/>
							</div>

							{providers.length > 0 && (
								<div className="space-y-1.5">
									<label className="text-xs font-medium text-foreground">
										Pre-authorized Scopes
										<span className="text-muted-foreground font-normal ml-1">
											(optional)
										</span>
									</label>
									<div className="max-h-48 overflow-y-auto space-y-2 rounded-md border border-border/40 p-2">
										{providers.map((provider) => {
											const providerScopes = availableScopes.filter(
												(s) => s.provider === provider,
											);
											const wildcard = `${provider}.*`;
											const wildcardActive = selectedScopes.includes(wildcard);

											return (
												<div key={provider} className="space-y-1">
													<div className="flex items-center justify-between">
														<span className="text-[11px] font-mono font-medium text-foreground/80">
															{provider}
														</span>
														<button
															type="button"
															onClick={() => toggleWildcard(provider)}
															className={cn(
																"text-[10px] px-1.5 py-0.5 rounded transition-colors font-mono",
																wildcardActive
																	? "bg-foreground text-background"
																	: "text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted/60",
															)}
														>
															{wildcardActive ? "All granted" : "Grant all"}
														</button>
													</div>
													{providerScopes.map((scope) => {
														const active =
															selectedScopes.includes(scope.name) ||
															wildcardActive;
														return (
															<button
																key={scope.name}
																type="button"
																onClick={() => toggleScope(scope.name)}
																disabled={wildcardActive}
																className={cn(
																	"flex items-center gap-2 w-full rounded px-2 py-1 text-left transition-all text-[11px]",
																	active
																		? "bg-foreground/5"
																		: "hover:bg-muted/20",
																	wildcardActive && "opacity-50 cursor-default",
																)}
															>
																<div
																	className={cn(
																		"flex h-3 w-3 shrink-0 items-center justify-center rounded-sm border transition-colors",
																		active
																			? "border-foreground bg-foreground text-background"
																			: "border-border/60",
																	)}
																>
																	{active && <Check className="h-2 w-2" />}
																</div>
																<span className="font-mono truncate">
																	{scope.name}
																</span>
															</button>
														);
													})}
												</div>
											);
										})}
									</div>
								</div>
							)}

							{error && <p className="text-xs text-red-500">{error}</p>}
						</div>
						<div className="flex justify-end gap-2 px-6 pb-6">
							<Button
								variant="outline"
								size="sm"
								className="h-8 text-xs"
								onClick={() => handleOpenChange(false)}
							>
								Cancel
							</Button>
							<Button
								size="sm"
								className="h-8 text-xs"
								onClick={handleCreate}
								disabled={creating || !name.trim()}
							>
								{creating && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
								Create Host
							</Button>
						</div>
					</>
				) : (
					<>
						<DialogHeader>
							<DialogTitle>Host Created</DialogTitle>
							<DialogDescription>
								Run this command on your device to complete enrollment. The
								token can only be used once.
							</DialogDescription>
						</DialogHeader>
						<div className="px-6 py-4 space-y-4">
							<div className="space-y-1.5">
								<label className="text-xs font-medium text-foreground flex items-center gap-1.5">
									<Terminal className="h-3 w-3" />
									Enrollment Command
								</label>
								<div className="relative group">
									<pre className="rounded-md border border-border/60 bg-muted/30 px-3 py-2.5 text-xs font-mono text-foreground overflow-x-auto whitespace-pre-wrap break-all pr-10">
										{cliCommand}
									</pre>
									<button
										type="button"
										onClick={() => copyToClipboard(cliCommand, "command")}
										className="absolute right-2 top-2 p-1 rounded hover:bg-muted/60 transition-colors"
										title="Copy command"
									>
										{copied === "command" ? (
											<Check className="h-3.5 w-3.5 text-emerald-500" />
										) : (
											<ClipboardCopy className="h-3.5 w-3.5 text-muted-foreground" />
										)}
									</button>
								</div>
							</div>

							<div className="space-y-1.5">
								<label className="text-xs font-medium text-foreground flex items-center gap-1.5">
									<KeyRound className="h-3 w-3" />
									Enrollment Token
								</label>
								<div className="relative group">
									<code className="block rounded-md border border-border/60 bg-muted/30 px-3 py-2.5 text-xs font-mono text-foreground break-all pr-10">
										{tokenData?.enrollmentToken}
									</code>
									<button
										type="button"
										onClick={() =>
											copyToClipboard(tokenData?.enrollmentToken ?? "", "token")
										}
										className="absolute right-2 top-2 p-1 rounded hover:bg-muted/60 transition-colors"
										title="Copy token"
									>
										{copied === "token" ? (
											<Check className="h-3.5 w-3.5 text-emerald-500" />
										) : (
											<ClipboardCopy className="h-3.5 w-3.5 text-muted-foreground" />
										)}
									</button>
								</div>
							</div>

							<div className="flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
								<Clock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
								<div className="text-xs text-amber-700 dark:text-amber-300 space-y-0.5">
									<p className="font-medium">
										Expires in {expiresIn} minute{expiresIn !== 1 ? "s" : ""}
									</p>
									<p className="text-amber-600/80 dark:text-amber-400/80">
										This token is shown once and cannot be retrieved later.
									</p>
								</div>
							</div>
						</div>
						<div className="flex justify-end px-6 pb-6">
							<Button
								size="sm"
								className="h-8 text-xs"
								onClick={() => handleOpenChange(false)}
							>
								Done
							</Button>
						</div>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}

export interface HostPermissions {
	canCreate: boolean;
	canDelete: boolean;
	canReadAll: boolean;
}

export function HostsClient({
	orgId,
	initialHosts,
	initialAvailableScopes,
	permissions,
}: {
	orgId: string;
	initialHosts: Host[];
	initialAvailableScopes: AvailableScope[];
	permissions: HostPermissions;
}) {
	const router = useRouter();
	const [refreshing, startTransition] = useTransition();
	const [showRevoked, setShowRevoked] = useState(false);
	const [createDialogOpen, setCreateDialogOpen] = useState(false);

	const hosts = initialHosts;
	const availableScopes = initialAvailableScopes;

	const refresh = () => {
		startTransition(() => {
			router.refresh();
		});
	};

	const activeHosts = hosts.filter((h) => h.status !== "revoked");
	const revokedHosts = hosts.filter((h) => h.status === "revoked");

	return (
		<div className="flex flex-col gap-6 py-8">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-xl font-medium tracking-tight">Hosts</h1>
					<p className="text-sm text-muted-foreground mt-0.5">
						Trusted host keypairs that create and manage agents on behalf of
						users.
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Button
						size="sm"
						variant="outline"
						className="h-8 text-xs"
						onClick={refresh}
						disabled={refreshing}
					>
						{refreshing ? (
							<Loader2 className="h-3 w-3 animate-spin mr-1" />
						) : null}
						Refresh
					</Button>
					{permissions.canCreate && (
						<Button
							size="sm"
							className="h-8 text-xs"
							onClick={() => setCreateDialogOpen(true)}
						>
							<Plus className="h-3 w-3 mr-1" />
							Create Host
						</Button>
					)}
				</div>
			</div>

			<CreateHostDialog
				open={createDialogOpen}
				onOpenChange={setCreateDialogOpen}
				availableScopes={availableScopes}
				onCreated={refresh}
			/>

			{hosts.length === 0 ? (
				<div className="border border-dashed border-border/60 rounded-lg p-12 text-center">
					<KeyRound className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
					<p className="text-sm text-muted-foreground mb-1">
						{permissions.canReadAll
							? "No hosts registered yet."
							: "No hosts assigned to you yet."}
					</p>
					<p className="text-xs text-muted-foreground/70 max-w-sm mx-auto mb-4">
						{permissions.canCreate
							? "Hosts are trusted devices that can create and manage agents. Create one from the dashboard and enroll your device, or connect through the device authorization flow."
							: "Hosts are trusted devices that can create and manage agents. Ask an admin to create one for you."}
					</p>
					{permissions.canCreate && (
						<Button
							size="sm"
							className="h-8 text-xs"
							onClick={() => setCreateDialogOpen(true)}
						>
							<Plus className="h-3 w-3 mr-1" />
							Create Host
						</Button>
					)}
				</div>
			) : (
				<>
				{activeHosts.length > 0 && (
					<div className="space-y-2">
						{activeHosts.map((host) => (
							<HostCard
								key={host.id}
								host={host}
								availableScopes={availableScopes}
								onMutate={refresh}
								canDelete={permissions.canDelete}
							/>
						))}
					</div>
				)}

					{revokedHosts.length > 0 && (
						<div className="pt-2">
							<button
								type="button"
								onClick={() => setShowRevoked(!showRevoked)}
								className="flex items-center gap-2 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors group w-full"
							>
								<div className="h-px flex-1 bg-border/40" />
								<span className="flex items-center gap-1.5 shrink-0 px-1">
									{showRevoked ? (
										<ChevronDown className="h-3 w-3" />
									) : (
										<ChevronRight className="h-3 w-3" />
									)}
									<Ban className="h-3 w-3" />
									{revokedHosts.length} revoked host
									{revokedHosts.length !== 1 ? "s" : ""}
								</span>
								<div className="h-px flex-1 bg-border/40" />
							</button>

							{showRevoked && (
								<div className="space-y-2 mt-2">
							{revokedHosts.map((host) => (
									<HostCard
										key={host.id}
										host={host}
										availableScopes={availableScopes}
										onMutate={refresh}
										canDelete={permissions.canDelete}
									/>
								))}
								</div>
							)}
						</div>
					)}
				</>
			)}

			{hosts.length > 0 && (
				<div className="flex items-start gap-2.5 text-xs text-muted-foreground/70 px-1">
					<KeyRound className="h-3.5 w-3.5 shrink-0 mt-0.5" />
					<p>
						Hosts are registered keypairs that create agents. Edit scopes to
						control what agents auto-approve for. Revoking a host permanently
						disables it and all agents created through it.
					</p>
				</div>
			)}
		</div>
	);
}
