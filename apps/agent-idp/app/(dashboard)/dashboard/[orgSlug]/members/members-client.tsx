"use client";

import { Crown, Loader2, Mail, Shield, Trash2, UserPlus } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";

type OrgMember = {
	id: string;
	role: string;
	userId: string;
	createdAt: string;
};

function RoleBadge({ role }: { role: string }) {
	const styles: Record<string, string> = {
		owner: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
		admin: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
		member: "bg-muted text-muted-foreground",
	};

	const icons: Record<string, React.ReactNode> = {
		owner: <Crown className="h-3 w-3" />,
		admin: <Shield className="h-3 w-3" />,
	};

	return (
		<span
			className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${styles[role] || styles.member}`}
		>
			{icons[role]}
			{role}
		</span>
	);
}

function MemberRow({
	member,
	currentUserId,
	onRoleChange,
	onRemove,
}: {
	member: OrgMember;
	currentUserId: string;
	onRoleChange: (memberId: string, role: string) => void;
	onRemove: (memberId: string) => void;
}) {
	const [confirmRemove, setConfirmRemove] = useState(false);
	const isCurrentUser = member.userId === currentUserId;
	const isOwner = member.role === "owner";

	return (
		<div className="flex items-center justify-between p-4 border border-border/60 rounded-lg bg-card/50">
			<div className="flex items-center gap-3 min-w-0">
				<div className="h-8 w-8 bg-foreground/[0.06] rounded-md flex items-center justify-center text-xs font-medium shrink-0">
					{member.userId[0]?.toUpperCase() || "U"}
				</div>
				<div className="min-w-0">
					<p className="text-sm font-medium truncate">
						{member.userId}
						{isCurrentUser && (
							<span className="ml-1 text-xs text-muted-foreground">(you)</span>
						)}
					</p>
					<p className="text-xs text-muted-foreground">
						Joined {new Date(member.createdAt).toLocaleDateString()}
					</p>
				</div>
			</div>

			<div className="flex items-center gap-2 shrink-0">
				<RoleBadge role={member.role} />
				{!isOwner && !isCurrentUser && (
					<>
						<select
							value={member.role}
							onChange={(e) => onRoleChange(member.id, e.target.value)}
							className="h-7 text-xs bg-muted border-0 font-mono px-2 cursor-pointer rounded"
						>
							<option value="member">member</option>
							<option value="admin">admin</option>
						</select>
						{confirmRemove ? (
							<div className="flex gap-1">
								<Button
									variant="destructive"
									size="sm"
									className="h-7 text-xs"
									onClick={() => onRemove(member.id)}
								>
									Remove
								</Button>
								<Button
									variant="ghost"
									size="sm"
									className="h-7 text-xs"
									onClick={() => setConfirmRemove(false)}
								>
									Cancel
								</Button>
							</div>
						) : (
							<Button
								variant="ghost"
								size="sm"
								className="h-7 px-2 text-muted-foreground hover:text-destructive"
								onClick={() => setConfirmRemove(true)}
							>
								<Trash2 className="h-3 w-3" />
							</Button>
						)}
					</>
				)}
			</div>
		</div>
	);
}

export function MembersClient({
	initialMembers,
	currentUserId,
	orgId,
	orgSlug,
}: {
	initialMembers: OrgMember[];
	currentUserId: string;
	orgId: string;
	orgSlug: string;
}) {
	const [members, setMembers] = useState<OrgMember[]>(initialMembers);
	const [showInvite, setShowInvite] = useState(false);
	const [inviteEmail, setInviteEmail] = useState("");
	const [inviteRole, setInviteRole] = useState("member");
	const [inviting, setInviting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const ensureActiveOrg = useCallback(async () => {
		await authClient.organization.setActive({ organizationId: orgId });
	}, [orgId]);

	const fetchMembers = useCallback(async () => {
		try {
			await ensureActiveOrg();
			const result = await authClient.organization.getFullOrganization();
			if (result.data) {
				setMembers(result.data.members as any[]);
			}
		} catch {}
	}, [ensureActiveOrg]);

	const handleInvite = async (e: React.FormEvent) => {
		e.preventDefault();
		setInviting(true);
		setError(null);
		try {
			await ensureActiveOrg();
			const result = await authClient.organization.inviteMember({
				email: inviteEmail,
				role: inviteRole as "member" | "admin",
			});
			if (result.error) {
				setError(result.error.message || "Failed to invite member");
			} else {
				setInviteEmail("");
				setInviteRole("member");
				setShowInvite(false);
				void fetchMembers();
			}
		} catch {
			setError("Failed to invite member");
		}
		setInviting(false);
	};

	const handleRoleChange = async (memberId: string, role: string) => {
		try {
			await ensureActiveOrg();
			await authClient.organization.updateMemberRole({
				memberId,
				role: role as "member" | "admin",
			});
			void fetchMembers();
		} catch {}
	};

	const handleRemove = async (memberId: string) => {
		try {
			await ensureActiveOrg();
			await authClient.organization.removeMember({ memberIdOrEmail: memberId });
			void fetchMembers();
		} catch {}
	};

	return (
		<div className="flex flex-col gap-6 py-8">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-xl font-medium tracking-tight">Members</h1>
					<p className="text-sm text-muted-foreground mt-0.5">
						Manage organization members and invitations.
					</p>
				</div>
				<Button
					variant="outline"
					size="sm"
					className="h-8 text-xs"
					onClick={() => setShowInvite(!showInvite)}
				>
					<UserPlus className="h-3 w-3 mr-1.5" />
					Invite
				</Button>
			</div>

			{error && (
				<div className="p-3 border border-destructive/50 bg-destructive/10 text-sm text-destructive">
					{error}
				</div>
			)}

			{showInvite && (
				<form
					onSubmit={handleInvite}
					className="border border-border/60 rounded-lg p-4 space-y-3 bg-card/30"
				>
					<h3 className="text-sm font-medium">Invite member</h3>
					<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
						<div className="sm:col-span-2">
							<Label className="text-xs">Email</Label>
							<Input
								type="email"
								value={inviteEmail}
								onChange={(e) => setInviteEmail(e.target.value)}
								placeholder="colleague@example.com"
								required
								className="h-8 text-sm"
							/>
						</div>
						<div>
							<Label className="text-xs">Role</Label>
							<select
								value={inviteRole}
								onChange={(e) => setInviteRole(e.target.value)}
								className="w-full h-8 text-sm bg-background border border-input px-2 font-mono rounded"
							>
								<option value="member">member</option>
								<option value="admin">admin</option>
							</select>
						</div>
					</div>
					<Button type="submit" size="sm" disabled={inviting}>
						{inviting ? (
							<Loader2 className="h-3 w-3 animate-spin mr-1" />
						) : (
							<Mail className="h-3 w-3 mr-1" />
						)}
						Send Invitation
					</Button>
				</form>
			)}

			<div>
				<h2 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-3">
					Members ({members.length})
				</h2>
				<div className="space-y-2">
					{members.length === 0 ? (
						<div className="border border-dashed border-border/60 rounded-lg p-12 text-center text-sm text-muted-foreground">
							No members yet
						</div>
					) : (
						members.map((member) => (
							<MemberRow
								key={member.id}
								member={member}
								currentUserId={currentUserId}
								onRoleChange={handleRoleChange}
								onRemove={handleRemove}
							/>
						))
					)}
				</div>
			</div>
		</div>
	);
}
