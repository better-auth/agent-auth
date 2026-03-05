"use client";

import { ChevronDown, Loader2, MoreHorizontal, Plus, X } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth/client";

type OrgMember = {
	id: string;
	role: string;
	userId: string;
	createdAt: string;
};

const ROLES = ["admin", "member", "auditor"] as const;

const ROLE_DESCRIPTIONS: Record<string, string> = {
	owner: "Full access, cannot be changed",
	admin: "Manage hosts, agents, connections, and settings",
	member: "Create and view own hosts and agents",
	auditor: "Read-only access across all resources",
};

function RoleBadge({ role }: { role: string }) {
	return (
		<span
			className={cn(
				"inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-md capitalize",
				role === "owner" && "bg-foreground/8 text-foreground",
				role === "admin" && "bg-foreground/8 text-foreground",
				role === "auditor" && "bg-foreground/5 text-muted-foreground",
				role === "member" && "bg-foreground/5 text-muted-foreground",
			)}
		>
			{role}
		</span>
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
	const [inviteRole, setInviteRole] = useState<string>("member");
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
				role: inviteRole as "member" | "admin" | "auditor",
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
				role: role as "member" | "admin" | "auditor",
			});
			void fetchMembers();
		} catch {}
	};

	const handleRemove = async (memberId: string) => {
		try {
			await ensureActiveOrg();
			await authClient.organization.removeMember({
				memberIdOrEmail: memberId,
			});
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
					className="h-8 text-xs gap-1.5"
					onClick={() => setShowInvite(!showInvite)}
				>
					{showInvite ? (
						<X className="h-3 w-3" />
					) : (
						<Plus className="h-3 w-3" />
					)}
					{showInvite ? "Cancel" : "Invite member"}
				</Button>
			</div>

			{error && (
				<div className="p-3 border border-destructive/30 bg-destructive/5 rounded-lg text-sm text-destructive">
					{error}
				</div>
			)}

			{showInvite && (
				<form
					onSubmit={handleInvite}
					className="border border-border/60 rounded-lg p-4 space-y-4"
				>
					<div className="grid grid-cols-1 sm:grid-cols-[1fr_160px] gap-3 items-end">
						<div className="space-y-1.5">
							<Label className="text-xs text-muted-foreground">
								Email address
							</Label>
							<Input
								type="email"
								value={inviteEmail}
								onChange={(e) => setInviteEmail(e.target.value)}
								placeholder="name@company.com"
								required
								className="h-9 text-sm"
							/>
						</div>
						<div className="space-y-1.5">
							<Label className="text-xs text-muted-foreground">Role</Label>
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<button
										type="button"
										className="flex items-center justify-between w-full h-9 px-3 text-sm bg-background border border-input rounded-md capitalize"
									>
										{inviteRole}
										<ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
									</button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end" className="w-64">
									{ROLES.map((role) => (
										<DropdownMenuItem
											key={role}
											onClick={() => setInviteRole(role)}
											className="flex flex-col items-start gap-0.5 py-2"
										>
											<span className="text-sm font-medium capitalize">
												{role}
											</span>
											<span className="text-[11px] text-muted-foreground">
												{ROLE_DESCRIPTIONS[role]}
											</span>
										</DropdownMenuItem>
									))}
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
					</div>
					<Button type="submit" size="sm" disabled={inviting} className="h-8">
						{inviting && <Loader2 className="h-3 w-3 animate-spin mr-1.5" />}
						Send invitation
					</Button>
				</form>
			)}

			<div className="border border-border/60 rounded-lg overflow-hidden">
				<table className="w-full">
					<thead>
						<tr className="border-b border-border/60 bg-muted/30">
							<th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider py-2.5 px-4">
								User
							</th>
							<th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider py-2.5 px-4">
								Role
							</th>
							<th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider py-2.5 px-4 hidden sm:table-cell">
								Joined
							</th>
							<th className="w-10 py-2.5 px-4" />
						</tr>
					</thead>
					<tbody className="divide-y divide-border/40">
						{members.length === 0 ? (
							<tr>
								<td
									colSpan={4}
									className="text-center py-12 text-sm text-muted-foreground"
								>
									No members yet
								</td>
							</tr>
						) : (
							members.map((member) => {
								const isCurrentUser = member.userId === currentUserId;
								const isOwner = member.role === "owner";
								const canManage = !isOwner && !isCurrentUser;

								return (
									<tr
										key={member.id}
										className="group hover:bg-muted/20 transition-colors"
									>
										<td className="py-3 px-4">
											<div className="flex items-center gap-3 min-w-0">
												<div className="h-7 w-7 bg-foreground/6 rounded-full flex items-center justify-center text-[11px] font-medium shrink-0">
													{member.userId[0]?.toUpperCase() || "U"}
												</div>
												<span className="text-sm truncate">
													{member.userId}
													{isCurrentUser && (
														<span className="ml-1.5 text-xs text-muted-foreground">
															(you)
														</span>
													)}
												</span>
											</div>
										</td>
										<td className="py-3 px-4">
											<RoleBadge role={member.role} />
										</td>
										<td className="py-3 px-4 hidden sm:table-cell">
											<span className="text-xs text-muted-foreground tabular-nums">
												{new Date(member.createdAt).toLocaleDateString(
													"en-US",
													{
														month: "short",
														day: "numeric",
														year: "numeric",
													},
												)}
											</span>
										</td>
										<td className="py-3 px-4">
											{canManage && (
												<MemberActions
													member={member}
													onRoleChange={handleRoleChange}
													onRemove={handleRemove}
												/>
											)}
										</td>
									</tr>
								);
							})
						)}
					</tbody>
				</table>
			</div>
		</div>
	);
}

function MemberActions({
	member,
	onRoleChange,
	onRemove,
}: {
	member: OrgMember;
	onRoleChange: (memberId: string, role: string) => void;
	onRemove: (memberId: string) => void;
}) {
	const [confirmRemove, setConfirmRemove] = useState(false);

	if (confirmRemove) {
		return (
			<div className="flex items-center gap-1">
				<Button
					variant="destructive"
					size="sm"
					className="h-6 text-[11px] px-2"
					onClick={() => onRemove(member.id)}
				>
					Confirm
				</Button>
				<Button
					variant="ghost"
					size="sm"
					className="h-6 text-[11px] px-2"
					onClick={() => setConfirmRemove(false)}
				>
					Cancel
				</Button>
			</div>
		);
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
				>
					<MoreHorizontal className="h-3.5 w-3.5" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-56">
				{ROLES.filter((r) => r !== member.role).map((role) => (
					<DropdownMenuItem
						key={role}
						onClick={() => onRoleChange(member.id, role)}
						className="flex flex-col items-start gap-0.5 py-2"
					>
						<span className="text-sm capitalize">Change to {role}</span>
						<span className="text-[11px] text-muted-foreground">
							{ROLE_DESCRIPTIONS[role]}
						</span>
					</DropdownMenuItem>
				))}
				<DropdownMenuSeparator />
				<DropdownMenuItem
					variant="destructive"
					onClick={() => setConfirmRemove(true)}
				>
					Remove from organization
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
