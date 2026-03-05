"use client";

import { Building2, Check, Loader2, Mail, User, X } from "lucide-react";
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
		<div className="border border-border rounded-lg p-4 flex flex-col gap-3">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<p className="font-medium text-sm truncate">
						{invite.organizationName}
					</p>
					<p className="text-xs text-muted-foreground mt-0.5">
						Invited by {invite.inviterEmail} &middot;{" "}
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
	return (
		<div className="grid grid-cols-2 gap-3">
			<button
				type="button"
				onClick={() => onChange("personal")}
				className={cn(
					"flex flex-col items-center gap-2 rounded-lg border p-4 transition-all text-left",
					value === "personal"
						? "border-foreground bg-foreground/[0.04] ring-1 ring-foreground/10"
						: "border-border/60 hover:border-border hover:bg-foreground/[0.02]",
				)}
			>
				<User
					className={cn(
						"h-5 w-5",
						value === "personal"
							? "text-foreground"
							: "text-muted-foreground/50",
					)}
				/>
				<div className="text-center">
					<p className="text-[13px] font-medium">Personal</p>
					<p className="text-[11px] text-muted-foreground mt-0.5">
						Just for you and your agents
					</p>
				</div>
			</button>
			<button
				type="button"
				onClick={() => onChange("organization")}
				className={cn(
					"flex flex-col items-center gap-2 rounded-lg border p-4 transition-all text-left",
					value === "organization"
						? "border-foreground bg-foreground/[0.04] ring-1 ring-foreground/10"
						: "border-border/60 hover:border-border hover:bg-foreground/[0.02]",
				)}
			>
				<Building2
					className={cn(
						"h-5 w-5",
						value === "organization"
							? "text-foreground"
							: "text-muted-foreground/50",
					)}
				/>
				<div className="text-center">
					<p className="text-[13px] font-medium">Organization</p>
					<p className="text-[11px] text-muted-foreground mt-0.5">
						Collaborate with your team
					</p>
				</div>
			</button>
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
			<div className="w-full max-w-md">
				<div className="flex flex-col items-center mb-8">
					<BetterAuthLogo className="h-6 w-auto mb-4" />
					{hasInvitations && !showCreateOrg ? (
						<>
							<h1 className="text-xl font-medium tracking-tight">
								You&apos;ve been invited
							</h1>
							<p className="mt-1.5 text-sm text-muted-foreground text-center max-w-xs">
								Accept an invitation to join an existing organization, or create
								your own.
							</p>
						</>
					) : (
						<>
							<h1 className="text-xl font-medium tracking-tight">
								Get started
							</h1>
							<p className="mt-1.5 text-sm text-muted-foreground text-center max-w-xs">
								Set up your workspace to manage connections and agents.
							</p>
						</>
					)}
				</div>

				{error && (
					<div className="mb-4 p-3 border border-destructive/30 bg-destructive/5 rounded-lg">
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

						<div className="pt-4 border-t border-border mt-6">
							<button
								type="button"
								onClick={() => setShowCreateOrg(true)}
								className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
							>
								Skip &mdash; create my own workspace instead
							</button>
						</div>
					</div>
				) : (
					<>
						<form onSubmit={handleCreate} className="space-y-5">
							<OrgTypeSelector value={orgType} onChange={setOrgType} />

							{orgType === "organization" && (
								<>
									<div>
										<Label htmlFor="org-name" className="text-xs">
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
											className="mt-1"
										/>
									</div>
									<div>
										<Label htmlFor="org-slug" className="text-xs">
											URL slug
										</Label>
										<div className="flex items-center mt-1">
											<span className="text-xs text-muted-foreground mr-1.5 font-mono">
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
								</>
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
							<div className="pt-4 border-t border-border mt-6">
								<button
									type="button"
									onClick={() => setShowCreateOrg(false)}
									className="w-full flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
								>
									<Mail className="h-3.5 w-3.5" />
									Back to pending invitations ({invitations.length})
								</button>
							</div>
						)}
					</>
				)}
			</div>
		</div>
	);
}
