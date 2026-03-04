"use client";

import { Check, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";
import { cn } from "@/lib/utils";

type ApprovalMethod = "auto" | "ciba" | "device_authorization";

const APPROVAL_METHOD_OPTIONS: {
	id: ApprovalMethod;
	label: string;
	description: string;
}[] = [
	{
		id: "auto",
		label: "Use organization default",
		description: "Follow the approval method set by your organization admin.",
	},
	{
		id: "ciba",
		label: "Push notification (CIBA)",
		description:
			"Receive approval requests in the browser extension or dashboard.",
	},
	{
		id: "device_authorization",
		label: "Browser verification",
		description: "Open a browser URL to approve agent requests.",
	},
];

interface SettingsClientProps {
	orgName: string;
	orgSlugValue: string;
	userName: string;
	userEmail: string;
	orgSlug: string;
	orgId: string;
}

export function SettingsClient({
	orgName: initialOrgName,
	orgSlugValue,
	userName: initialUserName,
	userEmail,
	orgSlug,
	orgId,
}: SettingsClientProps) {
	const [activeTab, setActiveTab] = useState<
		"general" | "account" | "security"
	>("general");

	const [orgName, setOrgName] = useState(initialOrgName);
	const [orgLoading, setOrgLoading] = useState(false);
	const [orgSaved, setOrgSaved] = useState(false);

	const [name, setName] = useState(initialUserName);
	const [accountLoading, setAccountLoading] = useState(false);
	const [accountSaved, setAccountSaved] = useState(false);
	const [accountError, setAccountError] = useState<string | null>(null);
	const [approvalMethod, setApprovalMethod] = useState<ApprovalMethod>("auto");
	const [approvalMethodLoading, setApprovalMethodLoading] = useState(false);
	const [approvalMethodSaved, setApprovalMethodSaved] = useState(false);

	const [allowDynamicHosts, setAllowDynamicHosts] = useState(true);
	const [securityLoading, setSecurityLoading] = useState(false);
	const [securitySaved, setSecuritySaved] = useState(false);
	const [securityInitialized, setSecurityInitialized] = useState(false);

	const fetchSecuritySettings = useCallback(async () => {
		try {
			const res = await fetch(
				`/api/org-settings?orgId=${encodeURIComponent(orgId)}`,
			);
			if (res.ok) {
				const data = await res.json();
				setAllowDynamicHosts(data.allowDynamicHostRegistration !== false);
			}
		} catch {}
		setSecurityInitialized(true);
	}, [orgId]);

	const fetchUserPreference = useCallback(async () => {
		try {
			const res = await fetch("/api/user-preference");
			if (res.ok) {
				const data = await res.json();
				setApprovalMethod(data.preferredApprovalMethod ?? "auto");
			}
		} catch {}
	}, []);

	useEffect(() => {
		void fetchSecuritySettings();
		void fetchUserPreference();
	}, [fetchSecuritySettings, fetchUserPreference]);

	const handleApprovalMethodSave = async () => {
		setApprovalMethodLoading(true);
		try {
			const res = await fetch("/api/user-preference", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ preferredApprovalMethod: approvalMethod }),
			});
			if (res.ok) {
				setApprovalMethodSaved(true);
				setTimeout(() => setApprovalMethodSaved(false), 2000);
			}
		} catch {}
		setApprovalMethodLoading(false);
	};

	const handleOrgSave = async () => {
		setOrgLoading(true);
		try {
			await authClient.organization.setActive({ organizationId: orgId });
			await authClient.organization.update({ data: { name: orgName } });
			setOrgSaved(true);
			setTimeout(() => setOrgSaved(false), 2000);
		} catch {}
		setOrgLoading(false);
	};

	const handleAccountSave = async () => {
		setAccountLoading(true);
		setAccountError(null);
		try {
			await authClient.updateUser({ name });
			setAccountSaved(true);
			setTimeout(() => setAccountSaved(false), 2000);
		} catch {
			setAccountError("Failed to update account");
		}
		setAccountLoading(false);
	};

	const handleSecuritySave = async () => {
		setSecurityLoading(true);
		try {
			const res = await fetch("/api/org-settings", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					orgId,
					allowDynamicHostRegistration: allowDynamicHosts,
				}),
			});
			if (res.ok) {
				setSecuritySaved(true);
				setTimeout(() => setSecuritySaved(false), 2000);
			}
		} catch {}
		setSecurityLoading(false);
	};

	const tabs = [
		{ id: "general" as const, label: "General" },
		{ id: "security" as const, label: "Security" },
		{ id: "account" as const, label: "Account" },
	];

	return (
		<div className="flex flex-col gap-6 py-8">
			<div>
				<h1 className="text-xl font-medium tracking-tight">Settings</h1>
				<p className="text-sm text-muted-foreground mt-0.5">
					Manage your organization and account settings.
				</p>
			</div>

			<div className="flex gap-1 p-0.5 bg-muted/50 rounded-lg w-fit">
				{tabs.map((tab) => (
					<button
						key={tab.id}
						className={`px-4 py-1.5 text-xs font-medium transition-all rounded-md ${
							activeTab === tab.id
								? "bg-background text-foreground shadow-sm"
								: "text-muted-foreground hover:text-foreground"
						}`}
						onClick={() => setActiveTab(tab.id)}
					>
						{tab.label}
					</button>
				))}
			</div>

			{activeTab === "general" && (
				<div className="space-y-4 max-w-lg">
					<div>
						<Label className="text-xs">Organization name</Label>
						<Input
							value={orgName}
							onChange={(e) => setOrgName(e.target.value)}
							className="mt-1"
						/>
					</div>
					<div>
						<Label className="text-xs">URL slug</Label>
						<Input value={orgSlugValue} disabled className="mt-1 bg-muted" />
						<p className="text-xs text-muted-foreground mt-1">
							The slug cannot be changed after creation.
						</p>
					</div>
					<Button size="sm" onClick={handleOrgSave} disabled={orgLoading}>
						{orgLoading ? (
							<Loader2 className="h-3 w-3 animate-spin mr-1" />
						) : orgSaved ? (
							<Check className="h-3 w-3 mr-1" />
						) : null}
						{orgSaved ? "Saved" : "Save Changes"}
					</Button>
				</div>
			)}

			{activeTab === "security" && (
				<div className="space-y-6 max-w-lg">
					<div className="space-y-4">
						<div>
							<h2 className="text-sm font-medium">Host Registration</h2>
							<p className="text-xs text-muted-foreground mt-0.5">
								Control how agent hosts are registered with your organization.
							</p>
						</div>

						{!securityInitialized ? (
							<div className="flex items-center gap-2 text-xs text-muted-foreground">
								<Loader2 className="h-3 w-3 animate-spin" />
								Loading...
							</div>
						) : (
							<>
								<div className="flex items-start gap-3 p-3 border rounded-lg">
									<button
										type="button"
										role="switch"
										aria-checked={!allowDynamicHosts}
										onClick={() => setAllowDynamicHosts(!allowDynamicHosts)}
										className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
											!allowDynamicHosts
												? "bg-foreground"
												: "bg-muted-foreground/30"
										}`}
									>
										<span
											className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-sm ring-0 transition-transform ${
												!allowDynamicHosts ? "translate-x-4" : "translate-x-0"
											}`}
										/>
									</button>
									<div className="flex-1">
										<Label className="text-xs font-medium">
											Require pre-registered hosts
										</Label>
										<p className="text-xs text-muted-foreground mt-0.5">
											When enabled, only hosts that have been explicitly
											registered via the dashboard or API can connect agents.
											Unknown hosts will be rejected instead of triggering the
											approval flow.
										</p>
									</div>
								</div>

								{!allowDynamicHosts && (
									<div className="p-3 border border-amber-500/30 bg-amber-500/5 rounded-lg">
										<p className="text-xs text-amber-600 dark:text-amber-400">
											Dynamic host registration is disabled. Agents can only
											connect through hosts created via{" "}
											<code className="text-[11px] px-1 py-0.5 rounded bg-amber-500/10">
												POST /api/auth/agent/host/create
											</code>{" "}
											or the Hosts page.
										</p>
									</div>
								)}

								<Button
									size="sm"
									onClick={handleSecuritySave}
									disabled={securityLoading}
								>
									{securityLoading ? (
										<Loader2 className="h-3 w-3 animate-spin mr-1" />
									) : securitySaved ? (
										<Check className="h-3 w-3 mr-1" />
									) : null}
									{securitySaved ? "Saved" : "Save Changes"}
								</Button>
							</>
						)}
					</div>
				</div>
			)}

			{activeTab === "account" && (
				<div className="space-y-6 max-w-lg">
					<div className="space-y-4">
						{accountError && (
							<div className="p-3 border border-destructive/50 bg-destructive/10 text-sm text-destructive">
								{accountError}
							</div>
						)}
						<div>
							<Label className="text-xs">Name</Label>
							<Input
								value={name}
								onChange={(e) => setName(e.target.value)}
								className="mt-1"
							/>
						</div>
						<div>
							<Label className="text-xs">Email</Label>
							<Input value={userEmail} disabled className="mt-1 bg-muted" />
						</div>
						<Button
							size="sm"
							onClick={handleAccountSave}
							disabled={accountLoading}
						>
							{accountLoading ? (
								<Loader2 className="h-3 w-3 animate-spin mr-1" />
							) : accountSaved ? (
								<Check className="h-3 w-3 mr-1" />
							) : null}
							{accountSaved ? "Saved" : "Save Changes"}
						</Button>
					</div>

					<div className="border-t border-border/40 pt-6 space-y-3">
						<div>
							<h3 className="text-sm font-medium">Approval notifications</h3>
							<p className="text-xs text-muted-foreground mt-0.5">
								Choose how you want to be notified when an agent needs your
								approval. This overrides the organization default.
							</p>
						</div>

						<div className="space-y-1.5">
							{APPROVAL_METHOD_OPTIONS.map((option) => (
								<button
									key={option.id}
									type="button"
									onClick={() => setApprovalMethod(option.id)}
									className={cn(
										"flex items-start gap-3 w-full p-3 border rounded-lg text-left transition-all",
										approvalMethod === option.id
											? "border-foreground/30 bg-foreground/3"
											: "border-border/40 hover:border-foreground/15",
									)}
								>
									<div
										className={cn(
											"mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border transition-colors",
											approvalMethod === option.id
												? "border-foreground bg-foreground text-background"
												: "border-border",
										)}
									>
										{approvalMethod === option.id && (
											<Check className="h-2 w-2" />
										)}
									</div>
									<div>
										<p className="text-xs font-medium">{option.label}</p>
										<p className="text-[11px] text-muted-foreground/70 mt-0.5">
											{option.description}
										</p>
									</div>
								</button>
							))}
						</div>

						<Button
							size="sm"
							onClick={handleApprovalMethodSave}
							disabled={approvalMethodLoading}
						>
							{approvalMethodLoading ? (
								<Loader2 className="h-3 w-3 animate-spin mr-1" />
							) : approvalMethodSaved ? (
								<Check className="h-3 w-3 mr-1" />
							) : null}
							{approvalMethodSaved ? "Saved" : "Save Preference"}
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
