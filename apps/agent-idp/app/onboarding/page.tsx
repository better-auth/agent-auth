"use client";

import { Check, Loader2, Mail, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BetterAuthLogo } from "@/components/icons/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient, useSession } from "@/lib/auth/client";
import { cn } from "@/lib/utils";

type OrgType = "personal" | "organization";

type Invitation = {
	id: string;
	organizationName: string;
	organizationSlug: string;
	organizationId: string;
	inviterEmail: string;
	role: string;
	status: string;
	expiresAt: string;
};

function PersonalIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 24 24" fill="none" className={className} strokeWidth="1.4" stroke="currentColor">
			<circle cx="12" cy="8" r="4" />
			<path d="M5.5 21a6.5 6.5 0 0 1 13 0" strokeLinecap="round" />
		</svg>
	);
}

function OrgIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 24 24" fill="none" className={className} strokeWidth="1.4" stroke="currentColor">
			<rect x="3" y="3" width="18" height="18" rx="2" />
			<path d="M9 3v18M3 9h18" />
		</svg>
	);
}

function InvitationCard({
	invite,
	onAccept,
	onReject,
	loading,
}: {
	invite: Invitation;
	onAccept: () => void;
	onReject: () => void;
	loading: string | null;
}) {
	const isAccepting = loading === `accept-${invite.id}`;
	const isRejecting = loading === `reject-${invite.id}`;
	const isDisabled = loading !== null;

	return (
		<div className="border border-foreground/10 p-4 flex flex-col gap-3">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<p className="font-medium text-sm truncate">
						{invite.organizationName}
					</p>
					<p className="text-[11px] text-muted-foreground/60 mt-0.5 font-mono">
						{invite.inviterEmail} &middot;{" "}
						<span className="capitalize">{invite.role}</span>
					</p>
				</div>
				<div className="shrink-0 flex items-center gap-1.5">
					<Button
						size="sm"
						variant="outline"
						className="h-7 px-2 text-xs"
						onClick={onReject}
						disabled={isDisabled}
					>
						{isRejecting ? (
							<Loader2 className="h-3 w-3 animate-spin" />
						) : (
							<X className="h-3 w-3" />
						)}
						<span className="ml-1">Decline</span>
					</Button>
					<Button
						size="sm"
						className="h-7 px-2 text-xs"
						onClick={onAccept}
						disabled={isDisabled}
					>
						{isAccepting ? (
							<Loader2 className="h-3 w-3 animate-spin" />
						) : (
							<Check className="h-3 w-3" />
						)}
						<span className="ml-1">Accept</span>
					</Button>
				</div>
			</div>
		</div>
	);
}

function OrgTypeSelector({
	value,
	onChange,
}: {
	value: OrgType;
	onChange: (v: OrgType) => void;
}) {
	const options: { key: OrgType; label: string; desc: string; icon: typeof PersonalIcon }[] = [
		{ key: "personal", label: "Personal", desc: "Just for you and your agents", icon: PersonalIcon },
		{ key: "organization", label: "Organization", desc: "Collaborate with your team", icon: OrgIcon },
	];

	return (
		<div className="grid grid-cols-2 gap-3">
			{options.map((opt) => {
				const active = value === opt.key;
				return (
					<button
						key={opt.key}
						type="button"
						onClick={() => onChange(opt.key)}
						className={cn(
							"group relative flex flex-col items-center gap-3 border p-5 transition-all text-center",
							active
								? "border-foreground bg-foreground/[0.03]"
								: "border-foreground/8 hover:border-foreground/15 hover:bg-foreground/[0.02]",
						)}
					>
						{/* Selection indicator */}
						<div
							className={cn(
								"absolute top-2.5 right-2.5 h-4 w-4 border flex items-center justify-center transition-all",
								active
									? "border-foreground bg-foreground"
									: "border-foreground/15",
							)}
						>
							{active && (
								<Check className="h-2.5 w-2.5 text-background" strokeWidth={2.5} />
							)}
						</div>

						<div
							className={cn(
								"h-10 w-10 flex items-center justify-center border transition-all",
								active
									? "border-foreground/20 bg-foreground/[0.06]"
									: "border-foreground/8 bg-foreground/[0.02]",
							)}
						>
							<opt.icon
								className={cn(
									"h-5 w-5 transition-colors",
									active ? "text-foreground" : "text-foreground/30",
								)}
							/>
						</div>

						<div>
							<p className={cn(
								"text-[13px] font-medium transition-colors",
								active ? "text-foreground" : "text-foreground/70",
							)}>
								{opt.label}
							</p>
							<p className="text-[10px] text-muted-foreground/50 mt-0.5 font-mono">
								{opt.desc}
							</p>
						</div>
					</button>
				);
			})}
		</div>
	);
}

export default function OnboardingPage() {
	const router = useRouter();
	const { data: session, isPending } = useSession();
	const [orgType, setOrgType] = useState<OrgType>("personal");
	const [orgName, setOrgName] = useState("");
	const [orgSlug, setOrgSlug] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const [invitations, setInvitations] = useState<Invitation[]>([]);
	const [initialLoading, setInitialLoading] = useState(true);
	const [actionLoading, setActionLoading] = useState<string | null>(null);
	const [showCreateOrg, setShowCreateOrg] = useState(false);
	const [hasOrg, setHasOrg] = useState(false);

	useEffect(() => {
		if (!isPending && !session?.user) {
			router.push("/");
		}
	}, [isPending, session, router]);

	useEffect(() => {
		if (!session?.user) return;

		void (async () => {
			try {
				const orgsRes = await authClient.organization.list();
				const orgs = (orgsRes.data ?? []) as { slug: string }[];
				if (orgs.length > 0) {
					setHasOrg(true);
					router.replace(`/dashboard/${orgs[0].slug}`);
					return;
				}

				const invRes = await authClient.organization.listUserInvitations();
				const pending = ((invRes.data as Invitation[] | null) ?? []).filter(
					(inv) => inv.status === "pending",
				);
				setInvitations(pending);
				if (pending.length === 0) setShowCreateOrg(true);
			} catch {
				setShowCreateOrg(true);
			} finally {
				setInitialLoading(false);
			}
		})();
	}, [session?.user, router]);

	if (isPending || !session?.user || hasOrg) {
		return null;
	}

	const handleNameChange = (value: string) => {
		setOrgName(value);
		setOrgSlug(
			value
				.toLowerCase()
				.replace(/[^a-z0-9-]/g, "-")
				.replace(/-+/g, "-")
				.replace(/^-|-$/g, ""),
		);
	};

	const handleCreate = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsLoading(true);
		setError(null);
		try {
			const orgsRes = await authClient.organization.list();
			const existing = (orgsRes.data ?? []) as { slug: string }[];
			if (existing.length > 0) {
				router.replace(`/dashboard/${existing[0].slug}`);
				return;
			}

			const isPersonal = orgType === "personal";
			const name = isPersonal
				? (session.user.name || session.user.email.split("@")[0])
				: orgName;
			const slug = isPersonal
				? (session.user.name || session.user.email.split("@")[0])
						.toLowerCase()
						.replace(/[^a-z0-9-]/g, "-")
						.replace(/-+/g, "-")
						.replace(/^-|-$/g, "")
				: orgSlug;

			const metadata = isPersonal
				? { orgType: "personal" as const }
				: {
						orgType: "organization" as const,
						dynamicHostDefaultScopes: [
							"idp.list_members",
							"idp.request_scope_approval",
							"idp.update_name",
						],
					};

			const result = await authClient.organization.create({
				name,
				slug,
				metadata,
			});
			if (result.error) {
				setError(result.error.message || "Failed to create workspace");
				setIsLoading(false);
				return;
			}
			await authClient.organization.setActive({
				organizationId: result.data!.id,
			});
			router.replace(`/dashboard/${slug}`);
		} catch {
			setError("An unexpected error occurred");
			setIsLoading(false);
		}
	};

	const handleAccept = async (invite: Invitation) => {
		setActionLoading(`accept-${invite.id}`);
		try {
			const result = await authClient.organization.acceptInvitation({
				invitationId: invite.id,
			});
			if (result.error) {
				setError(result.error.message || "Failed to accept invitation");
				setActionLoading(null);
				return;
			}
			await authClient.organization.setActive({
				organizationId: invite.organizationId,
			});
			router.replace(`/dashboard/${invite.organizationSlug}`);
		} catch {
			setError("Failed to accept invitation");
			setActionLoading(null);
		}
	};

	const handleReject = async (invite: Invitation) => {
		setActionLoading(`reject-${invite.id}`);
		try {
			await authClient.organization.rejectInvitation({
				invitationId: invite.id,
			});
			const remaining = invitations.filter((i) => i.id !== invite.id);
			setInvitations(remaining);
			if (remaining.length === 0) setShowCreateOrg(true);
		} catch {
			setError("Failed to decline invitation");
		}
		setActionLoading(null);
	};

	const hasInvitations = invitations.length > 0;

	if (initialLoading) {
		return (
			<div className="min-h-dvh flex items-center justify-center bg-background">
				<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
			</div>
		);
	}

	return (
		<div className="min-h-dvh flex items-center justify-center bg-background px-4">
			{/* Subtle dot grid */}
			<div
				className="fixed inset-0 pointer-events-none"
				style={{
					backgroundImage: "radial-gradient(circle, var(--foreground) 0.5px, transparent 0.5px)",
					backgroundSize: "24px 24px",
					opacity: 0.03,
					maskImage: "radial-gradient(ellipse 50% 50% at 50% 50%, black, transparent)",
					WebkitMaskImage: "radial-gradient(ellipse 50% 50% at 50% 50%, black, transparent)",
				}}
			/>

			<div className="relative w-full max-w-md">
				<div className="flex flex-col items-center mb-8">
					<BetterAuthLogo className="h-6 w-auto mb-5" />
					{hasInvitations && !showCreateOrg ? (
						<>
							<h1 className="text-lg font-medium tracking-tight">
								You&apos;ve been invited
							</h1>
							<p className="mt-1.5 text-[13px] text-muted-foreground/60 text-center max-w-xs">
								Accept an invitation to join an existing organization, or create
								your own.
							</p>
						</>
					) : (
						<>
							<h1 className="text-lg font-medium tracking-tight">
								Get started
							</h1>
							<p className="mt-1.5 text-[13px] text-muted-foreground/60 text-center max-w-xs">
								Set up your workspace to manage connections and agents.
							</p>
						</>
					)}
				</div>

				{error && (
					<div className="mb-4 p-3 border border-destructive/20 bg-destructive/5">
						<p className="text-sm text-destructive">{error}</p>
					</div>
				)}

				{hasInvitations && !showCreateOrg ? (
					<div className="space-y-3">
						{invitations.map((invite) => (
							<InvitationCard
								key={invite.id}
								invite={invite}
								onAccept={() => handleAccept(invite)}
								onReject={() => handleReject(invite)}
								loading={actionLoading}
							/>
						))}

						<div className="pt-4 border-t border-foreground/8 mt-6">
							<button
								type="button"
								onClick={() => setShowCreateOrg(true)}
								className="w-full text-center text-[12px] text-muted-foreground/50 hover:text-foreground/70 transition-colors py-2 font-mono"
							>
								Skip — create my own workspace
							</button>
						</div>
					</div>
				) : (
					<>
						<form onSubmit={handleCreate} className="space-y-5">
							<OrgTypeSelector value={orgType} onChange={setOrgType} />

							{orgType === "organization" && (
								<div className="space-y-4 animate-fade-in">
									<div>
										<Label htmlFor="org-name" className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground/60">
											Organization name
										</Label>
										<Input
											id="org-name"
											type="text"
											value={orgName}
											onChange={(e) => handleNameChange(e.target.value)}
											required
											placeholder="Acme Inc"
											disabled={isLoading}
											className="mt-1.5"
										/>
									</div>
									<div>
										<Label htmlFor="org-slug" className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground/60">
											URL slug
										</Label>
										<div className="flex items-center mt-1.5">
											<span className="text-[11px] text-muted-foreground/40 mr-1.5 font-mono shrink-0">
												/dashboard/
											</span>
											<Input
												id="org-slug"
												type="text"
												value={orgSlug}
												onChange={(e) =>
													setOrgSlug(
														e.target.value
															.toLowerCase()
															.replace(/[^a-z0-9-]/g, "-"),
													)
												}
												required
												placeholder="acme-inc"
												disabled={isLoading}
												pattern="[a-z0-9-]+"
												minLength={2}
											/>
										</div>
									</div>
								</div>
							)}

							<Button
								type="submit"
								className="w-full"
								disabled={
									isLoading ||
									(orgType === "organization" && (!orgName || !orgSlug))
								}
							>
								{isLoading ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Creating...
									</>
								) : orgType === "personal" ? (
									"Create Personal Workspace"
								) : (
									"Create Organization"
								)}
							</Button>
						</form>

						{hasInvitations && (
							<div className="pt-4 border-t border-foreground/8 mt-6">
								<button
									type="button"
									onClick={() => setShowCreateOrg(false)}
									className="w-full flex items-center justify-center gap-1.5 text-[12px] text-muted-foreground/50 hover:text-foreground/70 transition-colors py-2 font-mono"
								>
									<Mail className="h-3.5 w-3.5" />
									Back to invitations ({invitations.length})
								</button>
							</div>
						)}
					</>
				)}
			</div>
		</div>
	);
}
