import type { AgentSession } from "@better-auth/agent-auth";
import { and, eq } from "drizzle-orm";
import { audit } from "@/lib/audit";
import {
	agent,
	agentPermission,
	cibaAuthRequest,
	member,
	user,
} from "@/lib/db/better-auth-schema";
import { db } from "@/lib/db/drizzle";

export const IDP_PROVIDER_NAME = "idp";

export const IDP_DEFAULT_SCOPES = [
	"idp.list_members",
	"idp.request_scope_approval",
	"idp.update_name",
];

export const IDP_PERSONAL_DEFAULT_SCOPES = ["idp.update_name"];

export const IDP_TOOLS = [
	{
		name: "list_members",
		description:
			"List members of the organization. Returns each member's user ID, name, email, and role.",
		inputSchema: {
			type: "object" as const,
			properties: {},
		},
	},
	{
		name: "request_scope_approval",
		description:
			"Request a specific org member to approve additional scopes for this agent. " +
			"The member receives an approval notification and can approve or deny. " +
			"Use list_members first to discover member user IDs.",
		inputSchema: {
			type: "object" as const,
			properties: {
				targetUserId: {
					type: "string",
					description: "User ID of the org member to request approval from",
				},
				scopes: {
					type: "array",
					items: { type: "string" },
					description: "Scopes to request approval for",
				},
				reason: {
					type: "string",
					description: "Human-readable reason shown to the approver",
				},
			},
			required: ["targetUserId", "scopes"],
		},
	},
	{
		name: "update_name",
		description:
			"Update your agent's display name. Use this when your purpose has evolved " +
			"and the current name no longer reflects what you're doing. " +
			"For example, if you started as 'PR Reviewer' but are now also managing deploys, " +
			"rename to 'PR & Deploy Manager'.",
		inputSchema: {
			type: "object" as const,
			properties: {
				name: {
					type: "string",
					description: "New agent name reflecting your current purpose",
				},
			},
			required: ["name"],
		},
	},
] as const;

export const PERSONAL_IDP_TOOLS = IDP_TOOLS.filter(
	(t) => t.name !== "list_members" && t.name !== "request_scope_approval",
);

interface IdpToolContext {
	orgId: string;
	userId: string;
	agentSession: AgentSession;
}

export async function executeIdpTool(
	toolName: string,
	args: Record<string, unknown>,
	ctx: IdpToolContext,
): Promise<{
	content: Array<{ type: string; text: string }>;
	isError: boolean;
}> {
	const startTime = Date.now();
	try {
		let result: unknown;

		switch (toolName) {
			case "list_members":
				result = await handleListMembers(ctx);
				break;
			case "request_scope_approval":
				result = await handleRequestScopeApproval(ctx, args);
				break;
			case "update_name":
				result = await handleUpdateName(ctx, args);
				break;
			default:
				return {
					content: [{ type: "text", text: `Unknown IDP tool: ${toolName}` }],
					isError: true,
				};
		}

		const durationMs = Date.now() - startTime;
		const resultText = JSON.stringify(result);
		audit.onEvent({
			type: "tool.executed",
			orgId: ctx.orgId,
			agentId: ctx.agentSession.agent.id,
			agentName: ctx.agentSession.agent.name,
			userId: ctx.userId,
			tool: toolName,
			provider: IDP_PROVIDER_NAME,
			toolArgs: args,
			toolOutput: resultText,
			status: "success",
			durationMs,
		});

		return {
			content: [{ type: "text", text: resultText }],
			isError: false,
		};
	} catch (err) {
		const durationMs = Date.now() - startTime;
		const errorMsg = err instanceof Error ? err.message : String(err);

		audit.onEvent({
			type: "tool.executed",
			orgId: ctx.orgId,
			agentId: ctx.agentSession.agent.id,
			agentName: ctx.agentSession.agent.name,
			userId: ctx.userId,
			tool: toolName,
			provider: IDP_PROVIDER_NAME,
			toolArgs: args,
			status: "error",
			durationMs,
			error: errorMsg,
		});

		return {
			content: [{ type: "text", text: errorMsg }],
			isError: true,
		};
	}
}

async function handleListMembers(ctx: IdpToolContext) {
	const members = await db
		.select({
			memberId: member.id,
			userId: member.userId,
			role: member.role,
			name: user.name,
			email: user.email,
		})
		.from(member)
		.innerJoin(user, eq(member.userId, user.id))
		.where(eq(member.organizationId, ctx.orgId));

	return {
		members: members.map((m) => ({
			userId: m.userId,
			name: m.name,
			email: m.email,
			role: m.role,
		})),
	};
}

const CIBA_EXPIRES_IN = 300;

async function handleRequestScopeApproval(
	ctx: IdpToolContext,
	args: Record<string, unknown>,
) {
	const targetUserId = args.targetUserId as string;
	const scopes = args.scopes as string[];
	const reason = (args.reason as string) ?? null;

	if (!targetUserId || !scopes?.length) {
		throw new Error("targetUserId and scopes are required");
	}

	// Verify target is an org member
	const [targetMember] = await db
		.select({
			userId: member.userId,
			name: user.name,
			email: user.email,
		})
		.from(member)
		.innerJoin(user, eq(member.userId, user.id))
		.where(
			and(
				eq(member.organizationId, ctx.orgId),
				eq(member.userId, targetUserId),
			),
		)
		.limit(1);

	if (!targetMember) {
		throw new Error("Target user is not a member of this organization");
	}

	const now = new Date();
	const agentId = ctx.agentSession.agent.id;
	const agentName = ctx.agentSession.agent.name;

	// Check which scopes have already been granted/requested FROM this specific user.
	// A scope granted by Alice is separate from the same scope granted by Bob.
	const existing = await db
		.select({
			scope: agentPermission.scope,
			status: agentPermission.status,
			grantedBy: agentPermission.grantedBy,
		})
		.from(agentPermission)
		.where(eq(agentPermission.agentId, agentId));

	const alreadyActive = new Set(
		existing.filter((e) => e.status === "active").map((e) => e.scope),
	);
	const targetUserPerms = existing.filter((e) => e.grantedBy === targetUserId);
	const pendingFromTarget = new Set(
		targetUserPerms.filter((e) => e.status === "pending").map((e) => e.scope),
	);

	const needsCreation = scopes.filter(
		(s) => !alreadyActive.has(s) && !pendingFromTarget.has(s),
	);
	const alreadyPending = scopes.filter((s) => pendingFromTarget.has(s));

	for (const scope of needsCreation) {
		await db.insert(agentPermission).values({
			id: crypto.randomUUID(),
			agentId,
			scope,
			referenceId: null,
			grantedBy: targetUserId,
			expiresAt: null,
			status: "pending",
			reason,
			createdAt: now,
			updatedAt: now,
		});
	}

	const allPending = [...needsCreation, ...alreadyPending];
	if (allPending.length === 0) {
		return {
			status: "already_granted",
			message: `All requested scopes are already granted by ${targetMember.name}.`,
		};
	}

	// Create CIBA request targeting the member
	const expiresAt = new Date(now.getTime() + CIBA_EXPIRES_IN * 1000);
	const cibaId = crypto.randomUUID();

	await db.insert(cibaAuthRequest).values({
		id: cibaId,
		clientId: "agent-auth",
		loginHint: targetMember.email,
		userId: targetUserId,
		scope: `scope_approval:${agentId}`,
		bindingMessage:
			`${targetMember.name}: Agent "${agentName}" (owned by a different user) ` +
			`requests your approval for scopes: ${allPending.join(", ")}` +
			(reason ? `. Reason: ${reason}` : ""),
		clientNotificationToken: null,
		clientNotificationEndpoint: null,
		deliveryMode: "poll",
		status: "pending",
		accessToken: null,
		interval: 5,
		lastPolledAt: null,
		expiresAt,
		createdAt: now,
		updatedAt: now,
	});

	return {
		status: "pending",
		message: `Approval request sent to ${targetMember.name} (${targetMember.email})`,
		pending_scopes: allPending,
		auth_req_id: cibaId,
		expires_in: CIBA_EXPIRES_IN,
		target_user: {
			name: targetMember.name,
			email: targetMember.email,
		},
	};
}

async function handleUpdateName(
	ctx: IdpToolContext,
	args: Record<string, unknown>,
) {
	const newName = args.name as string;
	if (!newName?.trim()) {
		throw new Error("Name is required");
	}

	await db
		.update(agent)
		.set({ name: newName.trim(), updatedAt: new Date() })
		.where(eq(agent.id, ctx.agentSession.agent.id));

	return {
		status: "updated",
		name: newName.trim(),
	};
}
