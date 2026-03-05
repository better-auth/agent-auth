"use client";

import {
	Check,
	Fingerprint,
	KeyRound,
	Loader2,
	Lock,
	Mail,
	Plus,
	Search,
	Shield,
	Users,
	X,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type ReAuthPolicy = "none" | "fresh_session" | "always";
type ApprovalMethod = "auto" | "ciba" | "device_authorization";

type AvailableScope = {
	name: string;
	description: string;
	provider: string;
};

interface SecuritySettings {
	allowDynamicHostRegistration: boolean;
	allowMemberHostCreation: boolean;
	dynamicHostDefaultScopes: string[];
	defaultApprovalMethod: ApprovalMethod;
	reAuthPolicy: ReAuthPolicy;
	freshSessionWindow: number;
	allowedReAuthMethods: ("password" | "passkey" | "email_otp")[];
}

const APPROVAL_METHODS: {
	id: ApprovalMethod;
	label: string;
	description: string;
}[] = [
	{
		id: "auto",
		label: "Automatic",
		description:
			"CIBA (push notification) when the user is known, device authorization (browser) otherwise.",
	},
	{
		id: "ciba",
		label: "CIBA (Push notification)",
		description:
			"Always send a push notification to the browser extension or dashboard for approval.",
	},
	{
		id: "device_authorization",
		label: "Device authorization (Browser)",
		description:
			"Always require the user to open a browser verification URL to approve.",
	},
];

type SecurityTab = "hosts" | "authentication" | "permissions";

const TABS: { id: SecurityTab; label: string; icon: typeof Shield }[] = [
	{ id: "hosts", label: "Hosts", icon: Shield },
	{ id: "authentication", label: "Authentication", icon: Fingerprint },
	{ id: "permissions", label: "Permissions", icon: Users },
];

function Toggle({
	checked,
	onChange,
	disabled,
}: {
	checked: boolean;
	onChange: (val: boolean) => void;
	disabled?: boolean;
}) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			disabled={disabled}
			onClick={() => !disabled && onChange(!checked)}
			className={cn(
				"relative mt-0.5 inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors",
				disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
				checked ? "bg-foreground" : "bg-muted-foreground/30",
			)}
		>
			<span
				className={cn(
					"pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-sm ring-0 transition-transform",
					checked ? "translate-x-4" : "translate-x-0",
				)}
			/>
		</button>
	);
}

function PermRow({
	label,
	owner,
	admin,
	member,
	auditor,
}: {
	label: string;
	owner: boolean;
	admin: boolean;
	member: boolean;
	auditor: boolean;
}) {
	const dot = (allowed: boolean) => (
		<span
			className={cn(
				"inline-block h-2 w-2 rounded-full",
				allowed ? "bg-emerald-500" : "bg-muted-foreground/20",
			)}
		/>
	);
	return (
		<tr>
			<td className="py-1.5 px-3 text-foreground/80">{label}</td>
			<td className="py-1.5 px-3 text-center">{dot(owner)}</td>
			<td className="py-1.5 px-3 text-center">{dot(admin)}</td>
			<td className="py-1.5 px-3 text-center">{dot(member)}</td>
			<td className="py-1.5 px-3 text-center">{dot(auditor)}</td>
		</tr>
	);
}

const RE_AUTH_POLICIES: {
	id: ReAuthPolicy;
	label: string;
	description: string;
}[] = [
	{
		id: "none",
		label: "None",
		description: "No re-authentication required for approvals.",
	},
	{
		id: "fresh_session",
		label: "Fresh session",
		description:
			"Require a recently authenticated session within the configured window.",
	},
	{
		id: "always",
		label: "Always re-authenticate",
		description: "Require re-authentication for every approval action.",
	},
];

const RE_AUTH_METHODS = [
	{
		id: "password" as const,
		label: "Password",
		icon: KeyRound,
		recommended: false,
	},
	{
		id: "passkey" as const,
		label: "Passkey",
		icon: Fingerprint,
		recommended: true,
	},
	{
		id: "email_otp" as const,
		label: "Email OTP",
		icon: Mail,
		recommended: false,
	},
];

export function SecurityClient({
	orgId,
	canUpdate,
	initialSettings,
	availableScopes = [],
}: {
	orgId: string;
	canUpdate: boolean;
	initialSettings?: SecuritySettings;
	availableScopes?: AvailableScope[];
}) {
	const [activeTab, setActiveTab] = useState<SecurityTab>("hosts");
	const [scopeSearch, setScopeSearch] = useState("");
	const [settings, setSettings] = useState<SecuritySettings>(
		initialSettings ?? {
			allowDynamicHostRegistration: true,
			allowMemberHostCreation: true,
			dynamicHostDefaultScopes: [],
			defaultApprovalMethod: "auto",
			reAuthPolicy: "fresh_session",
			freshSessionWindow: 300,
			allowedReAuthMethods: ["password", "passkey"],
		},
	);
	const [newScope, setNewScope] = useState("");
	const [loading, setLoading] = useState(false);
	const [saved, setSaved] = useState(false);

	const handleSave = async () => {
		setLoading(true);
		try {
			const res = await fetch("/api/org-settings", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ orgId, ...settings }),
			});
			if (res.ok) {
				const data: SecuritySettings = await res.json();
				setSettings(data);
				setSaved(true);
				setTimeout(() => setSaved(false), 2000);
			}
		} catch {}
		setLoading(false);
	};

	const update = <K extends keyof SecuritySettings>(
		key: K,
		value: SecuritySettings[K],
	) => {
		setSettings((prev) => ({ ...prev, [key]: value }));
	};

	const toggleReAuthMethod = (method: "password" | "passkey" | "email_otp") => {
		setSettings((prev) => {
			const current = prev.allowedReAuthMethods;
			const next = current.includes(method)
				? current.filter((m) => m !== method)
				: [...current, method];
			if (next.length === 0) return prev;
			return { ...prev, allowedReAuthMethods: next };
		});
	};

	const addDefaultScope = () => {
		const trimmed = newScope.trim();
		if (!trimmed) return;
		if (settings.dynamicHostDefaultScopes.includes(trimmed)) {
			setNewScope("");
			return;
		}
		update("dynamicHostDefaultScopes", [
			...settings.dynamicHostDefaultScopes,
			trimmed,
		]);
		setNewScope("");
	};

	const removeDefaultScope = (scope: string) => {
		update(
			"dynamicHostDefaultScopes",
			settings.dynamicHostDefaultScopes.filter((s) => s !== scope),
		);
	};

	return (
		<div className="flex flex-col h-full py-8">
			{/* Fixed header */}
			<div className="shrink-0">
				<div className="flex items-center justify-between">
					<div>
						<h1 className="text-xl font-medium tracking-tight">Security</h1>
						<p className="text-sm text-muted-foreground mt-0.5">
							Manage host registration, approval policies, and role permissions.
						</p>
					</div>
					{canUpdate && (
						<Button
							size="sm"
							onClick={handleSave}
							disabled={loading}
							className="h-8 text-xs"
						>
							{loading ? (
								<Loader2 className="h-3 w-3 animate-spin mr-1" />
							) : saved ? (
								<Check className="h-3 w-3 mr-1" />
							) : null}
							{saved ? "Saved" : "Save Changes"}
						</Button>
					)}
				</div>

				{!canUpdate && (
					<div className="flex items-center gap-2 mt-4 p-2.5 border border-muted-foreground/15 bg-muted/20 rounded-lg">
						<Lock className="h-3 w-3 shrink-0 text-muted-foreground/60" />
						<p className="text-[11px] text-muted-foreground">
							View-only — admins and owners can modify these settings.
						</p>
					</div>
				)}

				{/* Tabs */}
				<div className="flex gap-1 mt-5 p-0.5 bg-muted/50 rounded-lg w-fit border border-border/30">
					{TABS.map((tab) => (
						<button
							key={tab.id}
							type="button"
							onClick={() => setActiveTab(tab.id)}
							className={cn(
								"flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium transition-all rounded-md",
								activeTab === tab.id
									? "bg-background text-foreground shadow-sm"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							<tab.icon className="h-3 w-3" />
							{tab.label}
						</button>
					))}
				</div>
			</div>

			{/* Content */}
			<div className="mt-6 max-w-xl">
				{activeTab === "hosts" && (
					<div className="space-y-5">
						<div className="space-y-2">
							<div className="flex items-start gap-3 p-3 border border-border/50 rounded-lg">
								<Toggle
									checked={!settings.allowDynamicHostRegistration}
									onChange={(v) => update("allowDynamicHostRegistration", !v)}
									disabled={!canUpdate}
								/>
								<div className="flex-1">
									<Label className="text-xs font-medium">
										Require pre-registered hosts
									</Label>
									<p className="text-xs text-muted-foreground mt-0.5">
										Only hosts created via the dashboard or API can connect.
										Unknown hosts are rejected.
									</p>
								</div>
							</div>

							<div className="flex items-start gap-3 p-3 border border-border/50 rounded-lg">
								<Toggle
									checked={!settings.allowMemberHostCreation}
									onChange={(v) => update("allowMemberHostCreation", !v)}
									disabled={!canUpdate}
								/>
								<div className="flex-1">
									<Label className="text-xs font-medium">
										Restrict host creation to admins
									</Label>
									<p className="text-xs text-muted-foreground mt-0.5">
										Only admin and owner roles can create new hosts.
									</p>
								</div>
							</div>
						</div>

						{settings.allowDynamicHostRegistration && (
							<div className="p-3 border border-border/50 rounded-lg space-y-2.5">
								<div>
									<Label className="text-xs font-medium">
										Default scopes for new hosts
									</Label>
									<p className="text-xs text-muted-foreground mt-0.5">
										Scopes automatically pre-authorized on dynamically created
										hosts. Agents connecting through these hosts will have these
										scopes granted without user approval.
									</p>
								</div>

								{settings.dynamicHostDefaultScopes.length > 0 && (
									<div className="flex flex-wrap gap-1.5">
										{settings.dynamicHostDefaultScopes.map((scope) => (
											<span
												key={scope}
												className="inline-flex items-center gap-1 font-mono text-[10px] bg-muted px-2 py-1 rounded-md text-muted-foreground"
											>
												{scope}
												{canUpdate && (
													<button
														type="button"
														onClick={() => removeDefaultScope(scope)}
														className="hover:text-foreground transition-colors"
													>
														<X className="h-2.5 w-2.5" />
													</button>
												)}
											</span>
										))}
									</div>
								)}

								{canUpdate && availableScopes.length > 0 && (
									<div className="space-y-1.5">
										{availableScopes.length > 8 && (
											<div className="relative">
												<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
												<Input
													value={scopeSearch}
													onChange={(e) => setScopeSearch(e.target.value)}
													placeholder="Filter scopes..."
													className="h-7 text-xs pl-7 bg-muted/30 border-border/40"
												/>
											</div>
										)}
										<div className="max-h-40 overflow-y-auto space-y-2 rounded-md border border-border/40 p-2">
											{[
												...new Set(
													(scopeSearch
														? availableScopes.filter(
																(s) =>
																	s.name
																		.toLowerCase()
																		.includes(scopeSearch.toLowerCase()) ||
																	s.description
																		.toLowerCase()
																		.includes(scopeSearch.toLowerCase()),
															)
														: availableScopes
													).map((s) => s.provider),
												),
											]
												.sort()
												.map((provider) => {
													const providerScopes = scopeSearch
														? availableScopes.filter(
																(s) =>
																	s.provider === provider &&
																	(s.name
																		.toLowerCase()
																		.includes(scopeSearch.toLowerCase()) ||
																		s.description
																			.toLowerCase()
																			.includes(scopeSearch.toLowerCase())),
															)
														: availableScopes.filter(
																(s) => s.provider === provider,
															);
													const wildcard = `${provider}.*`;
													const wildcardActive =
														settings.dynamicHostDefaultScopes.includes(
															wildcard,
														);

													return (
														<div key={provider} className="space-y-0.5">
															<div className="flex items-center justify-between">
																<span className="text-[11px] font-mono font-medium text-foreground/80">
																	{provider}
																</span>
																<button
																	type="button"
																	onClick={() => {
																		if (wildcardActive) {
																			update(
																				"dynamicHostDefaultScopes",
																				settings.dynamicHostDefaultScopes.filter(
																					(s) => s !== wildcard,
																				),
																			);
																		} else {
																			update("dynamicHostDefaultScopes", [
																				...settings.dynamicHostDefaultScopes.filter(
																					(s) => s !== wildcard,
																				),
																				wildcard,
																			]);
																		}
																	}}
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
																	settings.dynamicHostDefaultScopes.includes(
																		scope.name,
																	) || wildcardActive;
																return (
																	<button
																		key={scope.name}
																		type="button"
																		onClick={() => {
																			if (wildcardActive) return;
																			if (active) {
																				removeDefaultScope(scope.name);
																			} else {
																				update("dynamicHostDefaultScopes", [
																					...settings.dynamicHostDefaultScopes,
																					scope.name,
																				]);
																			}
																		}}
																		disabled={wildcardActive}
																		className={cn(
																			"flex items-center gap-2 w-full rounded px-2 py-1 text-left transition-all text-[11px]",
																			active
																				? "bg-foreground/5"
																				: "hover:bg-muted/20",
																			wildcardActive &&
																				"opacity-50 cursor-default",
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
																		{scope.description && (
																			<span className="text-muted-foreground/60 truncate ml-auto">
																				{scope.description}
																			</span>
																		)}
																	</button>
																);
															})}
														</div>
													);
												})}
										</div>
									</div>
								)}

								{canUpdate && (
									<div className="flex items-center gap-1.5">
										<Input
											placeholder="Add custom scope..."
											value={newScope}
											onChange={(e) => setNewScope(e.target.value)}
											onKeyDown={(e) => {
												if (e.key === "Enter") {
													e.preventDefault();
													addDefaultScope();
												}
											}}
											className="h-7 text-xs font-mono flex-1"
										/>
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={addDefaultScope}
											disabled={!newScope.trim()}
											className="h-7 px-2"
										>
											<Plus className="h-3 w-3" />
										</Button>
									</div>
								)}

								{settings.dynamicHostDefaultScopes.length === 0 &&
									availableScopes.length === 0 && (
										<p className="text-[11px] text-muted-foreground/60">
											No default scopes. Agents will need user approval for
											every capability.
										</p>
									)}
							</div>
						)}

						<div className="p-3 border border-border/50 rounded-lg space-y-2.5">
							<div>
								<Label className="text-xs font-medium">
									Default approval method
								</Label>
								<p className="text-xs text-muted-foreground mt-0.5">
									How users are notified when agents need approval. Members can
									override this in their personal settings.
								</p>
							</div>

							<div className="space-y-1.5">
								{APPROVAL_METHODS.map((method) => (
									<button
										key={method.id}
										type="button"
										disabled={!canUpdate}
										onClick={() => update("defaultApprovalMethod", method.id)}
										className={cn(
											"flex items-start gap-3 w-full p-2.5 border rounded-lg text-left transition-all",
											settings.defaultApprovalMethod === method.id
												? "border-foreground/30 bg-foreground/3"
												: "border-border/40 hover:border-foreground/15",
											!canUpdate && "opacity-70 cursor-not-allowed",
										)}
									>
										<div
											className={cn(
												"mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border transition-colors",
												settings.defaultApprovalMethod === method.id
													? "border-foreground bg-foreground text-background"
													: "border-border",
											)}
										>
											{settings.defaultApprovalMethod === method.id && (
												<Check className="h-2 w-2" />
											)}
										</div>
										<div>
											<p className="text-xs font-medium">{method.label}</p>
											<p className="text-[11px] text-muted-foreground/70 mt-0.5">
												{method.description}
											</p>
										</div>
									</button>
								))}
							</div>
						</div>
					</div>
				)}

				{activeTab === "authentication" && (
					<div className="space-y-6">
						{/* Re-auth Policy */}
						<section className="space-y-3">
							<div>
								<h3 className="text-xs font-medium">
									Approval Re-authentication
								</h3>
								<p className="text-[11px] text-muted-foreground mt-1">
									Controls when users must re-authenticate before approving
									agents or scope escalations.
								</p>
							</div>

							<div className="space-y-1.5">
								{RE_AUTH_POLICIES.map((policy) => (
									<button
										key={policy.id}
										type="button"
										disabled={!canUpdate}
										onClick={() => update("reAuthPolicy", policy.id)}
										className={cn(
											"flex items-start gap-3 w-full p-3 border rounded-lg text-left transition-all",
											settings.reAuthPolicy === policy.id
												? "border-foreground/30 bg-foreground/3"
												: "border-border/50 hover:border-foreground/15",
											!canUpdate && "opacity-70 cursor-not-allowed",
										)}
									>
										<div
											className={cn(
												"mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors",
												settings.reAuthPolicy === policy.id
													? "border-foreground bg-foreground text-background"
													: "border-border",
											)}
										>
											{settings.reAuthPolicy === policy.id && (
												<Check className="h-2.5 w-2.5" />
											)}
										</div>
										<div>
											<p className="text-xs font-medium">{policy.label}</p>
											<p className="text-[11px] text-muted-foreground/70 mt-0.5">
												{policy.description}
											</p>
										</div>
									</button>
								))}
							</div>

							{settings.reAuthPolicy === "fresh_session" && (
								<div className="flex items-center gap-3 pl-7">
									<Label className="text-xs text-muted-foreground whitespace-nowrap">
										Window
									</Label>
									<Input
										type="number"
										min={30}
										max={3600}
										step={30}
										value={settings.freshSessionWindow}
										onChange={(e) =>
											update("freshSessionWindow", Number(e.target.value))
										}
										disabled={!canUpdate}
										className="h-7 w-24 text-xs font-mono"
									/>
									<span className="text-[11px] text-muted-foreground">
										seconds ({Math.round(settings.freshSessionWindow / 60)}m)
									</span>
								</div>
							)}
						</section>

						{/* Verification Methods */}
						{settings.reAuthPolicy !== "none" && (
							<section className="space-y-3 border-t border-border/40 pt-6">
								<div>
									<h3 className="text-xs font-medium">Verification Methods</h3>
									<p className="text-[11px] text-muted-foreground mt-1">
										Users can verify with any enabled method. At least one must
										remain active.
									</p>
								</div>

								<div className="space-y-1.5">
									{RE_AUTH_METHODS.map((method) => {
										const active = settings.allowedReAuthMethods.includes(
											method.id,
										);
										const isLast =
											active && settings.allowedReAuthMethods.length === 1;
										return (
											<button
												key={method.id}
												type="button"
												disabled={!canUpdate || isLast}
												onClick={() => toggleReAuthMethod(method.id)}
												className={cn(
													"flex items-center gap-3 w-full p-3 border rounded-lg text-left transition-all",
													active
														? "border-foreground/20 bg-foreground/3"
														: "border-border/40",
													(!canUpdate || isLast) &&
														"opacity-60 cursor-not-allowed",
												)}
											>
												<div
													className={cn(
														"flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
														active
															? "border-foreground bg-foreground text-background"
															: "border-border/60",
													)}
												>
													{active && <Check className="h-2.5 w-2.5" />}
												</div>
												<method.icon className="h-3.5 w-3.5 text-muted-foreground" />
												<span className="text-xs font-medium">
													{method.label}
												</span>
												{method.recommended && (
													<span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ml-auto">
														Recommended
													</span>
												)}
											</button>
										);
									})}
								</div>
							</section>
						)}
					</div>
				)}

				{activeTab === "permissions" && (
					<div className="space-y-3">
						<div>
							<h3 className="text-xs font-medium">Role Permissions</h3>
							<p className="text-[11px] text-muted-foreground mt-1">
								What each role can do within the organization. Some permissions
								are affected by settings above.
							</p>
						</div>

						<div className="border border-border/50 rounded-lg overflow-hidden">
							<table className="w-full text-xs">
								<thead>
									<tr className="border-b bg-muted/30">
										<th className="text-left py-2 px-3 font-medium text-muted-foreground">
											Permission
										</th>
										<th className="text-center py-2 px-3 font-medium text-muted-foreground">
											Owner
										</th>
										<th className="text-center py-2 px-3 font-medium text-muted-foreground">
											Admin
										</th>
										<th className="text-center py-2 px-3 font-medium text-muted-foreground">
											Member
										</th>
										<th className="text-center py-2 px-3 font-medium text-muted-foreground">
											Auditor
										</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-border/50">
									<PermRow label="View own hosts" owner admin member auditor />
									<PermRow label="View all hosts" owner admin member={false} auditor />
									<PermRow
										label="Create hosts"
										owner
										admin
										member={settings.allowMemberHostCreation}
										auditor={false}
									/>
									<PermRow
										label="Delete / revoke hosts"
										owner
										admin
										member={false}
										auditor={false}
									/>
									<PermRow label="Create agents" owner admin member auditor={false} />
									<PermRow label="View all agents" owner admin member={false} auditor />
									<PermRow label="Approve agents" owner admin member={false} auditor={false} />
									<PermRow
										label="Manage connections"
										owner
										admin
										member={false}
										auditor={false}
									/>
									<PermRow
										label="Update security settings"
										owner
										admin
										member={false}
										auditor={false}
									/>
								</tbody>
							</table>
						</div>

						{settings.allowMemberHostCreation && (
							<p className="text-[10px] text-muted-foreground/60 flex items-center gap-1.5 px-1">
								<Shield className="h-2.5 w-2.5 shrink-0" />
								Members can create hosts because "Restrict host creation to
								admins" is off.
							</p>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
