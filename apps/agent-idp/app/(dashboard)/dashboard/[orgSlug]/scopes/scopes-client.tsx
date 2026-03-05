"use client";

import {
	Plug2,
	Check,
	ChevronDown,
	ChevronRight,
	Clock,
	Eye,
	EyeOff,
	FileJson,
	Hash,
	Info,
	Loader2,
	Plus,
	Search,
	Server,
	Shield,
	Trash2,
	X,
} from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type ScopeWithSchema = {
	name: string;
	description: string;
	provider: string;
	connectionId: string;
	connectionType: string;
	inputSchema: Record<string, unknown> | null;
	hasInput: boolean;
};

type ConnectionScopes = {
	connectionId: string;
	connectionName: string;
	connectionDisplayName: string;
	connectionType: string;
	scopes: ScopeWithSchema[];
};

type Constraint =
	| { type: "number_range"; path: string; min?: number; max?: number }
	| { type: "string_pattern"; path: string; pattern: string }
	| { type: "string_enum"; path: string; values: string[] }
	| { type: "boolean_value"; path: string; value: boolean };

type InputScopePolicy = {
	id: string;
	parentScope: string;
	scope: string;
	description?: string;
	hidden?: boolean;
	constraints: Constraint[];
};

function connectionIcon(type: string) {
	if (type === "mcp")
		return <Server className="h-4 w-4 text-muted-foreground" />;
	if (type === "openapi")
		return <FileJson className="h-4 w-4 text-muted-foreground" />;
	if (type === "agent-auth")
		return <Shield className="h-4 w-4 text-muted-foreground" />;
	return <Plug2 className="h-4 w-4 text-muted-foreground" />;
}

function extractSchemaFields(
	schema: Record<string, unknown> | null,
): Array<{ name: string; type: string }> {
	if (!schema) return [];
	const props = schema.properties as
		| Record<string, { type?: string }>
		| undefined;
	if (!props) return [];
	return Object.entries(props).map(([name, def]) => ({
		name,
		type: typeof def?.type === "string" ? def.type : "unknown",
	}));
}

const TTL_PRESETS = [
	{ label: "30s", value: 30 },
	{ label: "1m", value: 60 },
	{ label: "5m", value: 300 },
	{ label: "15m", value: 900 },
	{ label: "1h", value: 3600 },
	{ label: "8h", value: 28800 },
	{ label: "24h", value: 86400 },
] as const;

function ScopeTTLEditor({
	scopeName,
	scopeTTLs,
	onChangeTTL,
	compact,
}: {
	scopeName: string;
	scopeTTLs: Record<string, number>;
	onChangeTTL: (scope: string, ttl: number | null) => void;
	compact?: boolean;
}) {
	const currentTTL = scopeTTLs[scopeName] ?? null;
	const [customInput, setCustomInput] = useState("");
	const [showCustom, setShowCustom] = useState(false);

	const handlePreset = useCallback(
		(value: number) => {
			onChangeTTL(scopeName, value);
			setShowCustom(false);
		},
		[scopeName, onChangeTTL],
	);

	const handleClear = useCallback(() => {
		onChangeTTL(scopeName, null);
		setShowCustom(false);
		setCustomInput("");
	}, [scopeName, onChangeTTL]);

	const handleCustomSubmit = useCallback(() => {
		const parsed = Number.parseInt(customInput, 10);
		if (Number.isFinite(parsed) && parsed > 0) {
			onChangeTTL(scopeName, parsed);
			setShowCustom(false);
			setCustomInput("");
		}
	}, [scopeName, customInput, onChangeTTL]);

	if (compact) {
		return (
			<button
				type="button"
				onClick={(e) => {
					e.stopPropagation();
					if (currentTTL) {
						handleClear();
					} else {
						handlePreset(3600);
					}
				}}
				className={cn(
					"text-muted-foreground hover:text-foreground transition-colors",
					currentTTL && "text-blue-500 hover:text-blue-600",
				)}
				title={
					currentTTL
						? `TTL: ${formatTTL(currentTTL)} — click to remove`
						: "Set TTL"
				}
			>
				<Clock className="h-3.5 w-3.5" />
			</button>
		);
	}

	return (
		<div>
			<div className="flex items-center gap-1.5 mb-1.5">
				<p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
					Permission TTL
				</p>
				<span
					title="How long the permission stays active after being granted. Once expired, the agent must request the scope again."
					className="cursor-help"
				>
					<Info className="h-3 w-3 text-muted-foreground/50" />
				</span>
			</div>
			<div className="flex flex-wrap items-center gap-1.5">
				<button
					type="button"
					onClick={handleClear}
					className={cn(
						"text-[10px] px-2 py-1 rounded border transition-colors",
						currentTTL === null
							? "border-foreground/30 bg-foreground/5 text-foreground font-medium"
							: "border-border/50 text-muted-foreground hover:border-border hover:text-foreground",
					)}
				>
					Expires with agent
				</button>
				{TTL_PRESETS.map((preset) => (
					<button
						key={preset.value}
						type="button"
						onClick={() => handlePreset(preset.value)}
						className={cn(
							"text-[10px] px-2 py-1 rounded border transition-colors",
							currentTTL === preset.value
								? "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium"
								: "border-border/50 text-muted-foreground hover:border-border hover:text-foreground",
						)}
					>
						{preset.label}
					</button>
				))}
				{!showCustom ? (
					<button
						type="button"
						onClick={() => setShowCustom(true)}
						className={cn(
							"text-[10px] px-2 py-1 rounded border transition-colors",
							currentTTL !== null &&
								!TTL_PRESETS.some((p) => p.value === currentTTL)
								? "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium"
								: "border-border/50 text-muted-foreground hover:border-border hover:text-foreground",
						)}
					>
						{currentTTL !== null &&
						!TTL_PRESETS.some((p) => p.value === currentTTL)
							? formatTTL(currentTTL)
							: "Custom"}
					</button>
				) : (
					<div className="flex items-center gap-1">
						<Input
							value={customInput}
							onChange={(e) => setCustomInput(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") handleCustomSubmit();
								if (e.key === "Escape") setShowCustom(false);
							}}
							placeholder="seconds"
							className="h-6 w-20 text-[10px] px-1.5"
							autoFocus
						/>
						<button
							type="button"
							onClick={handleCustomSubmit}
							className="text-[10px] px-1.5 py-0.5 rounded bg-foreground/5 border border-border/50 text-foreground hover:bg-foreground/10"
						>
							Set
						</button>
					</div>
				)}
			</div>
			{currentTTL !== null && (
				<p className="text-[10px] text-blue-600 dark:text-blue-400 mt-1 flex items-center gap-1">
					<Clock className="h-2.5 w-2.5" />
					Permissions for this scope expire after {formatTTL(currentTTL)}
				</p>
			)}
		</div>
	);
}

const MAX_USES_PRESETS = [
	{ label: "1×", value: 1 },
	{ label: "3×", value: 3 },
	{ label: "5×", value: 5 },
	{ label: "10×", value: 10 },
	{ label: "25×", value: 25 },
] as const;

function ScopeMaxUsesEditor({
	scopeName,
	scopeMaxUses,
	onChangeMaxUses,
	compact,
}: {
	scopeName: string;
	scopeMaxUses: Record<string, number>;
	onChangeMaxUses: (scope: string, maxUses: number | null) => void;
	compact?: boolean;
}) {
	const current = scopeMaxUses[scopeName] ?? null;
	const [customInput, setCustomInput] = useState("");
	const [showCustom, setShowCustom] = useState(false);

	const handlePreset = useCallback(
		(value: number) => {
			onChangeMaxUses(scopeName, value);
			setShowCustom(false);
		},
		[scopeName, onChangeMaxUses],
	);

	const handleClear = useCallback(() => {
		onChangeMaxUses(scopeName, null);
		setShowCustom(false);
		setCustomInput("");
	}, [scopeName, onChangeMaxUses]);

	const handleCustomSubmit = useCallback(() => {
		const parsed = Number.parseInt(customInput, 10);
		if (Number.isFinite(parsed) && parsed > 0) {
			onChangeMaxUses(scopeName, parsed);
			setShowCustom(false);
			setCustomInput("");
		}
	}, [scopeName, customInput, onChangeMaxUses]);

	if (compact) {
		return (
			<button
				type="button"
				onClick={(e) => {
					e.stopPropagation();
					if (current) {
						handleClear();
					} else {
						handlePreset(1);
					}
				}}
				className={cn(
					"text-muted-foreground hover:text-foreground transition-colors",
					current && "text-orange-500 hover:text-orange-600",
				)}
				title={
					current ? `Max uses: ${current}× — click to remove` : "Set max uses"
				}
			>
				<Hash className="h-3.5 w-3.5" />
			</button>
		);
	}

	return (
		<div>
			<div className="flex items-center gap-1.5 mb-1.5">
				<p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
					Max uses
				</p>
				<span
					title="How many times the agent can invoke this scope before the permission is automatically revoked. Use 1× for one-shot actions like sensitive transfers."
					className="cursor-help"
				>
					<Info className="h-3 w-3 text-muted-foreground/50" />
				</span>
			</div>
			<div className="flex flex-wrap items-center gap-1.5">
				<button
					type="button"
					onClick={handleClear}
					className={cn(
						"text-[10px] px-2 py-1 rounded border transition-colors",
						current === null
							? "border-foreground/30 bg-foreground/5 text-foreground font-medium"
							: "border-border/50 text-muted-foreground hover:border-border hover:text-foreground",
					)}
				>
					Unlimited
				</button>
				{MAX_USES_PRESETS.map((preset) => (
					<button
						key={preset.value}
						type="button"
						onClick={() => handlePreset(preset.value)}
						className={cn(
							"text-[10px] px-2 py-1 rounded border transition-colors",
							current === preset.value
								? "border-orange-500/40 bg-orange-500/10 text-orange-600 dark:text-orange-400 font-medium"
								: "border-border/50 text-muted-foreground hover:border-border hover:text-foreground",
						)}
					>
						{preset.label}
					</button>
				))}
				{!showCustom ? (
					<button
						type="button"
						onClick={() => setShowCustom(true)}
						className={cn(
							"text-[10px] px-2 py-1 rounded border transition-colors",
							current !== null &&
								!MAX_USES_PRESETS.some((p) => p.value === current)
								? "border-orange-500/40 bg-orange-500/10 text-orange-600 dark:text-orange-400 font-medium"
								: "border-border/50 text-muted-foreground hover:border-border hover:text-foreground",
						)}
					>
						{current !== null &&
						!MAX_USES_PRESETS.some((p) => p.value === current)
							? `${current}×`
							: "Custom"}
					</button>
				) : (
					<div className="flex items-center gap-1">
						<Input
							value={customInput}
							onChange={(e) => setCustomInput(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") handleCustomSubmit();
								if (e.key === "Escape") setShowCustom(false);
							}}
							placeholder="count"
							className="h-6 w-16 text-[10px] px-1.5"
							autoFocus
						/>
						<button
							type="button"
							onClick={handleCustomSubmit}
							className="text-[10px] px-1.5 py-0.5 rounded bg-foreground/5 border border-border/50 text-foreground hover:bg-foreground/10"
						>
							Set
						</button>
					</div>
				)}
			</div>
			{current !== null && (
				<p className="text-[10px] text-orange-600 dark:text-orange-400 mt-1 flex items-center gap-1">
					<Hash className="h-2.5 w-2.5" />
					Permission revoked after {current} use{current !== 1 ? "s" : ""}
				</p>
			)}
		</div>
	);
}

function formatTTL(seconds: number): string {
	if (seconds < 60) return `${seconds}s`;
	if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
	if (seconds < 86400) {
		const h = Math.floor(seconds / 3600);
		const m = Math.round((seconds % 3600) / 60);
		return m > 0 ? `${h}h ${m}m` : `${h}h`;
	}
	const d = Math.floor(seconds / 86400);
	const h = Math.round((seconds % 86400) / 3600);
	return h > 0 ? `${d}d ${h}h` : `${d}d`;
}

function ProviderScopeList({
	scopes,
	policiesByParent,
	hiddenBaseScopes,
	disabledScopes,
	scopeTTLs,
	scopeMaxUses,
	canUpdate,
	onScopeClick,
	onToggleDisabled,
	globalSearch,
}: {
	scopes: ScopeWithSchema[];
	policiesByParent: Map<string, InputScopePolicy[]>;
	hiddenBaseScopes: Set<string>;
	disabledScopes: Set<string>;
	scopeTTLs: Record<string, number>;
	scopeMaxUses: Record<string, number>;
	canUpdate: boolean;
	onScopeClick: (scope: ScopeWithSchema) => void;
	onToggleDisabled: (scopeName: string) => void;
	globalSearch: string;
}) {
	const [localSearch, setLocalSearch] = useState("");
	const q = globalSearch || localSearch;

	const filtered = q
		? scopes.filter(
				(s) =>
					s.name.toLowerCase().includes(q.toLowerCase()) ||
					s.description.toLowerCase().includes(q.toLowerCase()),
			)
		: scopes;

	return (
		<div className="border-t border-border/40">
			{scopes.length > 8 && !globalSearch && (
				<div className="px-3 pt-2 pb-1">
					<div className="relative">
						<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
						<Input
							value={localSearch}
							onChange={(e) => setLocalSearch(e.target.value)}
							placeholder="Filter scopes..."
							className="h-7 pl-8 text-xs bg-muted/30 border-border/40"
						/>
						{localSearch && (
							<button
								type="button"
								onClick={() => setLocalSearch("")}
								className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
							>
								<X className="h-3 w-3" />
							</button>
						)}
					</div>
				</div>
			)}
			<div className="divide-y divide-border/30 max-h-[400px] overflow-y-auto">
				{filtered.length === 0 ? (
					<p className="px-4 py-3 text-xs text-muted-foreground">
						No scopes match your filter.
					</p>
				) : (
					filtered.map((scope) => {
						const subScopes = policiesByParent.get(scope.name) ?? [];
						const isHidden = hiddenBaseScopes.has(scope.name);
						const isDisabled = disabledScopes.has(scope.name);
						const disabledSubs = subScopes.filter((s) => s.hidden);
						const enabledSubs = subScopes.filter((s) => !s.hidden);
						const inactive = isDisabled || isHidden;
						return (
							<div key={scope.name}>
								<div
									className={cn(
										"px-4 py-2.5 flex items-center gap-3 group transition-colors",
										inactive && "bg-amber-500/[0.03]",
									)}
								>
									{canUpdate && (
										<button
											type="button"
											onClick={(e) => {
												e.stopPropagation();
												onToggleDisabled(scope.name);
											}}
											className={cn(
												"relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
												isDisabled
													? "bg-muted-foreground/30"
													: "bg-emerald-500/60",
											)}
											title={isDisabled ? "Enable scope" : "Disable scope"}
										>
											<span
												className={cn(
													"pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform",
													isDisabled ? "translate-x-0" : "translate-x-3",
												)}
											/>
										</button>
									)}
									{!canUpdate && (
										<div
											className={cn(
												"w-1.5 h-1.5 rounded-full shrink-0",
												inactive ? "bg-amber-500" : "bg-emerald-500",
											)}
										/>
									)}
									<div
										className={cn(
											"flex-1 min-w-0",
											canUpdate && "cursor-pointer",
										)}
										onClick={() => canUpdate && onScopeClick(scope)}
									>
										<div className="flex items-center gap-2">
											<p
												className={cn(
													"text-[11px] font-mono truncate",
													inactive &&
														"text-muted-foreground line-through decoration-amber-500/40",
												)}
											>
												{scope.name.includes(".")
													? scope.name.split(".").pop()
													: scope.name}
											</p>
											{!scope.hasInput && (
												<span className="text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground">
													no input
												</span>
											)}
											{scopeTTLs[scope.name] && (
												<span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium flex items-center gap-0.5">
													<Clock className="h-2.5 w-2.5" />
													{formatTTL(scopeTTLs[scope.name])}
												</span>
											)}
											{scopeMaxUses[scope.name] && (
												<span className="text-[9px] px-1.5 py-0.5 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 font-medium flex items-center gap-0.5">
													<Hash className="h-2.5 w-2.5" />
													{scopeMaxUses[scope.name]}×
												</span>
											)}
											{isDisabled && (
												<span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium flex items-center gap-1">
													<EyeOff className="h-2.5 w-2.5" />
													disabled
												</span>
											)}
											{isHidden && !isDisabled && (
												<span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
													<EyeOff className="h-2.5 w-2.5" />
													{enabledSubs.length > 0
														? `${enabledSubs.length} sub-scope${enabledSubs.length !== 1 ? "s" : ""} active`
														: "replaced"}
													{disabledSubs.length > 0 &&
														enabledSubs.length > 0 &&
														`, ${disabledSubs.length} hidden`}
												</span>
											)}
										</div>
										<p className="text-[10px] text-muted-foreground truncate mt-0.5">
											{scope.description}
										</p>
									</div>

									{subScopes.length > 0 && (
										<div className="flex flex-wrap gap-1 shrink-0 max-w-[240px]">
											{subScopes.map((sub) => (
												<span
													key={sub.scope}
													className={cn(
														"text-[9px] font-mono rounded px-1.5 py-0.5 border inline-flex items-center gap-1",
														sub.hidden
															? "border-border/40 text-muted-foreground bg-muted/30"
															: "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5",
													)}
												>
													{sub.scope.includes(".")
														? sub.scope.split(".").pop()
														: sub.scope}
													{scopeTTLs[sub.scope] && (
														<span className="text-blue-500 flex items-center gap-0.5">
															<Clock className="h-2 w-2" />
															{formatTTL(scopeTTLs[sub.scope])}
														</span>
													)}
												</span>
											))}
										</div>
									)}

									{canUpdate && (
										<ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
									)}
								</div>
							</div>
						);
					})
				)}
			</div>
		</div>
	);
}

export function ScopesClient({
	orgId,
	canUpdate,
	connectionScopes,
	initialPolicies,
	initialDisabledScopes,
	initialScopeTTLs,
	initialScopeMaxUses,
}: {
	orgId: string;
	canUpdate: boolean;
	connectionScopes: ConnectionScopes[];
	initialPolicies: InputScopePolicy[];
	initialDisabledScopes: string[];
	initialScopeTTLs: Record<string, number>;
	initialScopeMaxUses: Record<string, number>;
}) {
	const [policies, setPolicies] = useState<InputScopePolicy[]>(initialPolicies);
	const [disabledScopes, setDisabledScopes] = useState<Set<string>>(
		() => new Set(initialDisabledScopes),
	);
	const [scopeTTLs, setScopeTTLs] =
		useState<Record<string, number>>(initialScopeTTLs);
	const [scopeMaxUses, setScopeMaxUses] =
		useState<Record<string, number>>(initialScopeMaxUses);
	const savedPoliciesRef = useRef(JSON.stringify(initialPolicies));
	const savedDisabledRef = useRef(
		JSON.stringify([...initialDisabledScopes].sort()),
	);
	const savedTTLsRef = useRef(JSON.stringify(initialScopeTTLs));
	const savedMaxUsesRef = useRef(JSON.stringify(initialScopeMaxUses));
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);

	const isDirty = useMemo(() => {
		const policiesJson = JSON.stringify(policies);
		const disabledJson = JSON.stringify([...disabledScopes].sort());
		const ttlsJson = JSON.stringify(scopeTTLs);
		const maxUsesJson = JSON.stringify(scopeMaxUses);
		return (
			policiesJson !== savedPoliciesRef.current ||
			disabledJson !== savedDisabledRef.current ||
			ttlsJson !== savedTTLsRef.current ||
			maxUsesJson !== savedMaxUsesRef.current
		);
	}, [policies, disabledScopes, scopeTTLs, scopeMaxUses]);
	const [error, setError] = useState<string | null>(null);
	const [search, setSearch] = useState("");
	const [selectedScope, setSelectedScope] = useState<ScopeWithSchema | null>(
		null,
	);
	const [subScopeDialogOpen, setSubScopeDialogOpen] = useState(false);
	const [showAddForm, setShowAddForm] = useState(false);
	const [draftError, setDraftError] = useState<string | null>(null);
	const [draft, setDraft] = useState({
		scope: "",
		description: "",
		path: "",
		constraintType: "number_range" as Constraint["type"],
		min: "",
		max: "",
		pattern: "",
		enumValues: "",
		boolValue: true,
		hidden: false,
	});

	const policiesByParent = useMemo(() => {
		const map = new Map<string, InputScopePolicy[]>();
		for (const p of policies) {
			const list = map.get(p.parentScope) ?? [];
			list.push(p);
			map.set(p.parentScope, list);
		}
		return map;
	}, [policies]);

	const hiddenBaseScopes = useMemo(() => {
		const set = new Set<string>();
		for (const [parent] of policiesByParent) {
			set.add(parent);
		}
		return set;
	}, [policiesByParent]);

	const filteredConnections = useMemo(() => {
		if (!search.trim()) return connectionScopes;
		const q = search.toLowerCase();
		return connectionScopes
			.map((conn) => ({
				...conn,
				scopes: conn.scopes.filter(
					(s) =>
						s.name.toLowerCase().includes(q) ||
						s.description.toLowerCase().includes(q),
				),
			}))
			.filter((conn) => conn.scopes.length > 0);
	}, [connectionScopes, search]);

	const handleSave = async () => {
		setSaving(true);
		setError(null);
		try {
			const res = await fetch("/api/org-settings", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					orgId,
					inputScopePolicies: policies,
					disabledScopes: [...disabledScopes],
					scopeTTLs,
					scopeMaxUses,
				}),
			});
			if (!res.ok) {
				setError("Failed to save.");
				setSaving(false);
				return;
			}
			const data = await res.json();
			const newPolicies = Array.isArray(data.inputScopePolicies)
				? data.inputScopePolicies
				: [];
			const newDisabled: string[] = Array.isArray(data.disabledScopes)
				? data.disabledScopes
				: [];
			const newTTLs: Record<string, number> =
				typeof data.scopeTTLs === "object" && data.scopeTTLs !== null
					? data.scopeTTLs
					: {};
			const newMaxUses: Record<string, number> =
				typeof data.scopeMaxUses === "object" && data.scopeMaxUses !== null
					? data.scopeMaxUses
					: {};
			setPolicies(newPolicies);
			setDisabledScopes(new Set(newDisabled));
			setScopeTTLs(newTTLs);
			setScopeMaxUses(newMaxUses);
			savedPoliciesRef.current = JSON.stringify(newPolicies);
			savedDisabledRef.current = JSON.stringify([...newDisabled].sort());
			savedTTLsRef.current = JSON.stringify(newTTLs);
			savedMaxUsesRef.current = JSON.stringify(newMaxUses);
			setSaved(true);
			setTimeout(() => setSaved(false), 2000);
		} catch {
			setError("Failed to save.");
		}
		setSaving(false);
	};

	const toggleScopeDisabled = (scopeName: string) => {
		setDisabledScopes((prev) => {
			const next = new Set(prev);
			if (next.has(scopeName)) {
				next.delete(scopeName);
			} else {
				next.add(scopeName);
			}
			return next;
		});
	};

	const openSubScopeDialog = (scope: ScopeWithSchema) => {
		setSelectedScope(scope);
		const fields = extractSchemaFields(scope.inputSchema);
		const firstField = fields[0];
		const defaultType = firstField
			? firstField.type === "number" || firstField.type === "integer"
				? "number_range"
				: firstField.type === "boolean"
					? "boolean_value"
					: "string_enum"
			: "number_range";
		setDraft({
			scope: `${scope.name}_sub`,
			description: "",
			path: firstField?.name ?? "",
			constraintType: defaultType as Constraint["type"],
			min: "",
			max: "",
			pattern: "",
			enumValues: "",
			boolValue: true,
			hidden: false,
		});
		setDraftError(null);
		setShowAddForm(false);
		setSubScopeDialogOpen(true);
	};

	const handleAddSubScope = () => {
		if (!selectedScope) return;
		setDraftError(null);
		if (!draft.scope.trim()) {
			setDraftError("Sub-scope name is required.");
			return;
		}
		if (policies.some((p) => p.scope === draft.scope.trim())) {
			setDraftError("This sub-scope already exists.");
			return;
		}

		const hasConstraint = draft.path.trim() !== "";
		let constraint: Constraint | null = null;

		if (hasConstraint) {
			const path = draft.path.trim();
			switch (draft.constraintType) {
				case "number_range": {
					const min = draft.min.trim() === "" ? undefined : Number(draft.min);
					const max = draft.max.trim() === "" ? undefined : Number(draft.max);
					if (min !== undefined && Number.isNaN(min)) {
						setDraftError("Min must be a valid number.");
						return;
					}
					if (max !== undefined && Number.isNaN(max)) {
						setDraftError("Max must be a valid number.");
						return;
					}
					if (min !== undefined && max !== undefined && min > max) {
						setDraftError("Min must be ≤ max.");
						return;
					}
					constraint = { type: "number_range", path, min, max };
					break;
				}
				case "string_pattern": {
					if (!draft.pattern.trim()) {
						setDraftError("Regex pattern is required.");
						return;
					}
					try {
						new RegExp(draft.pattern.trim());
					} catch {
						setDraftError("Invalid regex pattern.");
						return;
					}
					constraint = {
						type: "string_pattern",
						path,
						pattern: draft.pattern.trim(),
					};
					break;
				}
				case "string_enum": {
					const values = draft.enumValues
						.split(",")
						.map((v) => v.trim())
						.filter(Boolean);
					if (values.length === 0) {
						setDraftError("At least one allowed value is required.");
						return;
					}
					constraint = { type: "string_enum", path, values };
					break;
				}
				case "boolean_value": {
					constraint = {
						type: "boolean_value",
						path,
						value: draft.boolValue,
					};
					break;
				}
			}
		}

		const newPolicy: InputScopePolicy = {
			id: `${selectedScope.name}-${draft.scope}`
				.replace(/[^a-zA-Z0-9_-]/g, "-")
				.slice(0, 120),
			parentScope: selectedScope.name,
			scope: draft.scope.trim(),
			description: draft.description.trim() || undefined,
			hidden: draft.hidden,
			constraints: constraint ? [constraint] : [],
		};

		setPolicies((prev) => [...prev, newPolicy]);
		setDraft((prev) => ({
			...prev,
			scope: `${selectedScope.name}_sub`,
			description: "",
			min: "",
			max: "",
			pattern: "",
			enumValues: "",
		}));
		setDraftError(null);
		setShowAddForm(false);
	};

	const removePolicy = (scope: string) => {
		setPolicies((prev) => prev.filter((p) => p.scope !== scope));
	};

	const toggleHidden = (scope: string) => {
		setPolicies((prev) =>
			prev.map((p) => (p.scope === scope ? { ...p, hidden: !p.hidden } : p)),
		);
	};

	const schemaFields = selectedScope
		? extractSchemaFields(selectedScope.inputSchema)
		: [];

	const [expandedProviders, setExpandedProviders] = useState<Set<string>>(
		() => new Set(),
	);

	const toggleProvider = (id: string) => {
		setExpandedProviders((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	};

	return (
		<div className="flex flex-col h-full py-8">
			<div className="sticky top-0 z-10 bg-background pb-4 space-y-4">
				<div className="flex items-center justify-between">
					<div>
						<h1 className="text-xl font-medium tracking-tight">Scopes</h1>
						<p className="text-sm text-muted-foreground mt-0.5">
							View connection scopes and create input-constrained sub-scopes.
						</p>
					</div>
					{canUpdate && (
						<Button
							size="sm"
							className="h-8 text-xs"
							onClick={handleSave}
							disabled={saving || (!isDirty && !saved)}
						>
							{saving ? (
								<Loader2 className="h-3 w-3 animate-spin mr-1" />
							) : saved ? (
								<Check className="h-3 w-3 mr-1" />
							) : null}
							{saved ? "Saved" : "Save Changes"}
						</Button>
					)}
				</div>

				{error && (
					<div className="p-3 border border-destructive/40 bg-destructive/5 rounded-md text-xs text-destructive">
						{error}
					</div>
				)}

				<div className="relative">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
					<Input
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search scopes across all connections..."
						className="h-9 pl-9 text-sm"
					/>
					{search && (
						<button
							type="button"
							onClick={() => setSearch("")}
							className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
						>
							<X className="h-3.5 w-3.5" />
						</button>
					)}
				</div>
			</div>

			{filteredConnections.length === 0 ? (
				<div className="border border-dashed border-border/60 rounded-lg p-12 text-center">
					<Plug2 className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
					<p className="text-sm text-muted-foreground">
						{search
							? "No scopes match your search."
							: "No scopes found. Add provider connections first."}
					</p>
				</div>
			) : (
				<div className="space-y-2 flex-1 overflow-y-auto">
					{filteredConnections.map((conn) => {
						const isExpanded =
							expandedProviders.has(conn.connectionId) || !!search;
						return (
							<div
								key={conn.connectionId}
								className="border border-border/60 rounded-lg overflow-hidden"
							>
								<button
									type="button"
									onClick={() => toggleProvider(conn.connectionId)}
									className="w-full flex items-center gap-2.5 px-4 py-3 bg-card/50 hover:bg-accent/30 transition-colors text-left"
								>
									{isExpanded ? (
										<ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
									) : (
										<ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
									)}
									{connectionIcon(conn.connectionType)}
									<div className="min-w-0">
										<p className="text-sm font-medium">
											{conn.connectionDisplayName}
										</p>
										<p className="text-[10px] font-mono text-muted-foreground">
											{conn.connectionName} &middot; {conn.connectionType}
										</p>
									</div>
									<span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
										{conn.scopes.length} scope
										{conn.scopes.length !== 1 ? "s" : ""}
									</span>
								</button>

								{isExpanded && (
									<ProviderScopeList
										scopes={conn.scopes}
										policiesByParent={policiesByParent}
										hiddenBaseScopes={hiddenBaseScopes}
										disabledScopes={disabledScopes}
										scopeTTLs={scopeTTLs}
										scopeMaxUses={scopeMaxUses}
										canUpdate={canUpdate}
										onScopeClick={openSubScopeDialog}
										onToggleDisabled={toggleScopeDisabled}
										globalSearch={search}
									/>
								)}
							</div>
						);
					})}
				</div>
			)}

			<Dialog open={subScopeDialogOpen} onOpenChange={setSubScopeDialogOpen}>
				<DialogContent className="max-w-lg">
					<DialogHeader>
						<DialogTitle className="font-mono text-sm">
							{selectedScope?.name}
						</DialogTitle>
						<DialogDescription>{selectedScope?.description}</DialogDescription>
					</DialogHeader>
					<div className="space-y-4 p-6 pt-2">
						{schemaFields.length > 0 && (
							<div>
								<p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
									Input schema
								</p>
								<div className="flex flex-wrap gap-1.5">
									{schemaFields.map((f) => (
										<span
											key={f.name}
											className="text-[10px] font-mono rounded border border-border/50 bg-muted/30 px-2 py-1"
										>
											{f.name}
											<span className="text-muted-foreground/60 ml-1">
												{f.type}
											</span>
										</span>
									))}
								</div>
							</div>
						)}

						{canUpdate && selectedScope && (
							<>
								<ScopeTTLEditor
									scopeName={selectedScope.name}
									scopeTTLs={scopeTTLs}
									onChangeTTL={(scope, ttl) => {
										setScopeTTLs((prev) => {
											const next = { ...prev };
											if (ttl === null) {
												delete next[scope];
											} else {
												next[scope] = ttl;
											}
											return next;
										});
									}}
								/>
								<ScopeMaxUsesEditor
									scopeName={selectedScope.name}
									scopeMaxUses={scopeMaxUses}
									onChangeMaxUses={(scope, maxUses) => {
										setScopeMaxUses((prev) => {
											const next = { ...prev };
											if (maxUses === null) {
												delete next[scope];
											} else {
												next[scope] = maxUses;
											}
											return next;
										});
									}}
								/>
							</>
						)}

						{(policiesByParent.get(selectedScope?.name ?? "") ?? []).length >
							0 && (
							<div>
								<p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
									Existing sub-scopes
								</p>
								<div className="space-y-1">
									{(policiesByParent.get(selectedScope?.name ?? "") ?? []).map(
										(sub) => {
											const c = sub.constraints[0];
											const constraintLabel = c
												? c.type === "number_range"
													? `${c.path}: ${c.min ?? "-∞"}..${c.max ?? "+∞"}`
													: c.type === "string_pattern"
														? `${c.path} matches /${c.pattern}/`
														: c.type === "string_enum"
															? `${c.path} in [${c.values.join(", ")}]`
															: c.type === "boolean_value"
																? `${c.path} = ${c.value}`
																: "unknown"
												: "no constraints";
											const subTTL = scopeTTLs[sub.scope];
											return (
												<div
													key={sub.scope}
													className="flex items-center gap-2 rounded border border-border/40 px-2 py-1.5"
												>
													<div className="flex-1 min-w-0">
														<div className="flex items-center gap-1.5">
															<p className="text-[11px] font-mono truncate">
																{sub.scope}
															</p>
															{subTTL && (
																<span className="text-[9px] px-1 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center gap-0.5">
																	<Clock className="h-2 w-2" />
																	{formatTTL(subTTL)}
																</span>
															)}
														</div>
														<p className="text-[10px] text-muted-foreground">
															{sub.description ?? constraintLabel}
														</p>
													</div>
													{canUpdate && (
														<>
															<ScopeMaxUsesEditor
																scopeName={sub.scope}
																scopeMaxUses={scopeMaxUses}
																compact
																onChangeMaxUses={(scope, val) => {
																	setScopeMaxUses((prev) => {
																		const next = { ...prev };
																		if (val === null) {
																			delete next[scope];
																		} else {
																			next[scope] = val;
																		}
																		return next;
																	});
																}}
															/>
															<ScopeTTLEditor
																scopeName={sub.scope}
																scopeTTLs={scopeTTLs}
																compact
																onChangeTTL={(scope, ttl) => {
																	setScopeTTLs((prev) => {
																		const next = { ...prev };
																		if (ttl === null) {
																			delete next[scope];
																		} else {
																			next[scope] = ttl;
																		}
																		return next;
																	});
																}}
															/>
														</>
													)}
													<button
														type="button"
														className="text-muted-foreground hover:text-foreground"
														onClick={() => toggleHidden(sub.scope)}
														title={sub.hidden ? "Make visible" : "Hide"}
													>
														{sub.hidden ? (
															<EyeOff className="h-3.5 w-3.5" />
														) : (
															<Eye className="h-3.5 w-3.5" />
														)}
													</button>
													<button
														type="button"
														className="text-muted-foreground hover:text-destructive"
														onClick={() => removePolicy(sub.scope)}
													>
														<Trash2 className="h-3.5 w-3.5" />
													</button>
												</div>
											);
										},
									)}
								</div>
							</div>
						)}

						<div className="border-t border-border/40 pt-3">
							{!showAddForm ? (
								<div className="flex items-center justify-between">
									<Button
										size="sm"
										variant="outline"
										className="h-8 text-xs"
										onClick={() => setShowAddForm(true)}
									>
										<Plus className="h-3 w-3 mr-1" />
										Add Sub-scope
									</Button>
									<Button
										size="sm"
										variant="ghost"
										className="h-8 text-xs text-muted-foreground"
										onClick={() => setSubScopeDialogOpen(false)}
									>
										Done
									</Button>
								</div>
							) : (
								<div className="space-y-3">
									<p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
										New sub-scope
									</p>

									<div>
										<Label className="text-xs">Sub-scope name</Label>
										<Input
											value={draft.scope}
											onChange={(e) =>
												setDraft((prev) => ({
													...prev,
													scope: e.target.value,
												}))
											}
											className="mt-1 h-9 text-sm font-mono"
											placeholder={`${selectedScope?.name ?? ""}_1_500`}
										/>
									</div>

									<div>
										<Label className="text-xs">Description</Label>
										<Input
											value={draft.description}
											onChange={(e) =>
												setDraft((prev) => ({
													...prev,
													description: e.target.value,
												}))
											}
											className="mt-1 h-9 text-sm"
											placeholder="Allows transfers up to 500"
										/>
									</div>

									{selectedScope?.hasInput && schemaFields.length > 0 && (
										<>
											<div>
												<Label className="text-xs">Constrain input field</Label>
												<select
													value={draft.path}
													onChange={(e) => {
														const fieldName = e.target.value;
														const field = schemaFields.find(
															(f) => f.name === fieldName,
														);
														const fieldType = field?.type ?? "string";
														const autoType: Constraint["type"] =
															fieldType === "number" || fieldType === "integer"
																? "number_range"
																: fieldType === "boolean"
																	? "boolean_value"
																	: "string_enum";
														setDraft((prev) => ({
															...prev,
															path: fieldName,
															constraintType: autoType,
														}));
													}}
													className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
												>
													<option value="">None (no input constraint)</option>
													{schemaFields.map((f) => (
														<option key={f.name} value={f.name}>
															{f.name} ({f.type})
														</option>
													))}
												</select>
											</div>

											{draft.path && (
												<>
													{(() => {
														const field = schemaFields.find(
															(f) => f.name === draft.path,
														);
														const isNumeric =
															field?.type === "number" ||
															field?.type === "integer";
														const isBool = field?.type === "boolean";
														return (
															<>
																{!isNumeric && !isBool && (
																	<div>
																		<Label className="text-xs">
																			Constraint type
																		</Label>
																		<select
																			value={draft.constraintType}
																			onChange={(e) =>
																				setDraft((prev) => ({
																					...prev,
																					constraintType: e.target
																						.value as Constraint["type"],
																				}))
																			}
																			className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
																		>
																			<option value="string_enum">
																				Allowed values
																			</option>
																			<option value="string_pattern">
																				Regex pattern
																			</option>
																		</select>
																	</div>
																)}

																{draft.constraintType === "number_range" && (
																	<div className="grid grid-cols-2 gap-2">
																		<div>
																			<Label className="text-xs">Min</Label>
																			<Input
																				value={draft.min}
																				onChange={(e) =>
																					setDraft((prev) => ({
																						...prev,
																						min: e.target.value,
																					}))
																				}
																				className="mt-1 h-9 text-sm"
																				placeholder="1"
																			/>
																		</div>
																		<div>
																			<Label className="text-xs">Max</Label>
																			<Input
																				value={draft.max}
																				onChange={(e) =>
																					setDraft((prev) => ({
																						...prev,
																						max: e.target.value,
																					}))
																				}
																				className="mt-1 h-9 text-sm"
																				placeholder="500"
																			/>
																		</div>
																	</div>
																)}

																{draft.constraintType === "string_enum" && (
																	<div>
																		<Label className="text-xs">
																			Allowed values
																		</Label>
																		<Input
																			value={draft.enumValues}
																			onChange={(e) =>
																				setDraft((prev) => ({
																					...prev,
																					enumValues: e.target.value,
																				}))
																			}
																			className="mt-1 h-9 text-sm font-mono"
																			placeholder="checking, savings, primary"
																		/>
																		<p className="text-[10px] text-muted-foreground mt-1">
																			Comma-separated list of allowed values
																		</p>
																	</div>
																)}

																{draft.constraintType === "string_pattern" && (
																	<div>
																		<Label className="text-xs">
																			Regex pattern
																		</Label>
																		<Input
																			value={draft.pattern}
																			onChange={(e) =>
																				setDraft((prev) => ({
																					...prev,
																					pattern: e.target.value,
																				}))
																			}
																			className="mt-1 h-9 text-sm font-mono"
																			placeholder="^[a-z]+@example\.com$"
																		/>
																		<p className="text-[10px] text-muted-foreground mt-1">
																			Value must match this regex
																		</p>
																	</div>
																)}

																{draft.constraintType === "boolean_value" && (
																	<div>
																		<Label className="text-xs">
																			Required value
																		</Label>
																		<select
																			value={String(draft.boolValue)}
																			onChange={(e) =>
																				setDraft((prev) => ({
																					...prev,
																					boolValue: e.target.value === "true",
																				}))
																			}
																			className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
																		>
																			<option value="true">true</option>
																			<option value="false">false</option>
																		</select>
																	</div>
																)}
															</>
														);
													})()}
												</>
											)}
										</>
									)}

									{draftError && (
										<p className="text-xs text-destructive">{draftError}</p>
									)}

									<div className="flex gap-2">
										<Button
											size="sm"
											className="h-8 text-xs"
											onClick={handleAddSubScope}
										>
											Save Sub-scope
										</Button>
										<Button
											size="sm"
											variant="ghost"
											className="h-8 text-xs text-muted-foreground"
											onClick={() => setShowAddForm(false)}
										>
											Cancel
										</Button>
									</div>
								</div>
							)}
						</div>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
