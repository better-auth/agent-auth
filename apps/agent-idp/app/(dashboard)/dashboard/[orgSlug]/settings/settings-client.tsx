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
		label: "Automatic",
		description:
			"Let the agent choose the best method for its environment, with the organization default as fallback.",
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
		void fetchUserPreference();
	}, [fetchUserPreference]);

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

	return (
		<div className="flex flex-col gap-6 py-8">
			<div>
				<h1 className="text-xl font-medium tracking-tight">Settings</h1>
				<p className="text-sm text-muted-foreground mt-0.5">
					Manage your organization and account settings.
				</p>
			</div>

			{/* Organization */}
			<div className="space-y-4 max-w-lg">
				<div>
					<h2 className="text-sm font-medium">Organization</h2>
					<p className="text-xs text-muted-foreground mt-0.5">
						General organization details.
					</p>
				</div>
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

			<div className="border-t border-border/40" />

			{/* Account */}
			<div className="space-y-6 max-w-lg">
				<div>
					<h2 className="text-sm font-medium">Account</h2>
					<p className="text-xs text-muted-foreground mt-0.5">
						Your personal account details.
					</p>
				</div>
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
		</div>
	);
}
