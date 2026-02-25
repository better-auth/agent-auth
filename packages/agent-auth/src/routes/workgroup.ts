import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { getSessionFromCtx } from "better-auth/api";
import * as z from "zod";
import { AGENT_AUTH_ERROR_CODES as ERROR_CODES } from "../error-codes";
import type { Agent, Workgroup } from "../types";

const WORKGROUP_TABLE = "agentWorkgroup";
const AGENT_TABLE = "agent";

/**
 * Verify the user has at least one agent in the given org,
 * proving they are a participant (not an outsider).
 */
async function assertOrgMembership(
	adapter: {
		count: (data: {
			model: string;
			where?: Array<{ field: string; value: string }>;
		}) => Promise<number>;
	},
	userId: string,
	orgId: string | null,
) {
	if (!orgId) return;
	const count = await adapter.count({
		model: AGENT_TABLE,
		where: [
			{ field: "userId", value: userId },
			{ field: "orgId", value: orgId },
		],
	});
	if (count === 0) {
		throw new APIError("FORBIDDEN", {
			message: "You do not have agents in this organization.",
		});
	}
}

export function createWorkgroup() {
	return createAuthEndpoint(
		"/agent/workgroup/create",
		{
			method: "POST",
			body: z.object({
				name: z.string().min(1).meta({ description: "Workgroup name" }),
				orgId: z
					.string()
					.meta({ description: "Organization this workgroup belongs to" })
					.optional(),
				description: z
					.string()
					.meta({ description: "Optional description" })
					.optional(),
			}),
			metadata: {
				openapi: {
					description: "Create a new workgroup within an organization.",
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.UNAUTHORIZED_SESSION);
			}

			await assertOrgMembership(
				ctx.context.adapter,
				session.user.id,
				ctx.body.orgId ?? null,
			);

			const now = new Date();
			const workgroup = await ctx.context.adapter.create<
				Record<string, unknown>,
				Workgroup
			>({
				model: WORKGROUP_TABLE,
				data: {
					name: ctx.body.name,
					orgId: ctx.body.orgId ?? null,
					description: ctx.body.description ?? null,
					createdAt: now,
					updatedAt: now,
				},
			});

			return ctx.json({
				id: workgroup.id,
				name: workgroup.name,
				orgId: workgroup.orgId,
				description: workgroup.description,
			});
		},
	);
}

export function listWorkgroups() {
	return createAuthEndpoint(
		"/agent/workgroup/list",
		{
			method: "GET",
			query: z
				.object({
					orgId: z
						.string()
						.meta({ description: "Filter by organization" })
						.optional(),
				})
				.optional(),
			metadata: {
				openapi: {
					description: "List workgroups for an organization.",
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.UNAUTHORIZED_SESSION);
			}

			await assertOrgMembership(
				ctx.context.adapter,
				session.user.id,
				ctx.query?.orgId ?? null,
			);

			const where: Array<{ field: string; value: string }> = [];
			if (ctx.query?.orgId) {
				where.push({ field: "orgId", value: ctx.query.orgId });
			}

			const workgroups = await ctx.context.adapter.findMany<Workgroup>({
				model: WORKGROUP_TABLE,
				where: where.length > 0 ? where : undefined,
				sortBy: { field: "createdAt", direction: "desc" },
			});

			return ctx.json({
				workgroups: workgroups.map((w) => ({
					id: w.id,
					name: w.name,
					orgId: w.orgId,
					description: w.description,
					createdAt: w.createdAt,
					updatedAt: w.updatedAt,
				})),
			});
		},
	);
}

export function updateWorkgroup() {
	return createAuthEndpoint(
		"/agent/workgroup/update",
		{
			method: "POST",
			body: z.object({
				workgroupId: z.string().min(1).meta({ description: "Workgroup ID" }),
				name: z.string().min(1).optional(),
				description: z.string().optional(),
			}),
			metadata: {
				openapi: {
					description: "Update a workgroup.",
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.UNAUTHORIZED_SESSION);
			}

			const existing = await ctx.context.adapter.findOne<Workgroup>({
				model: WORKGROUP_TABLE,
				where: [{ field: "id", value: ctx.body.workgroupId }],
			});
			if (!existing) {
				throw new APIError("NOT_FOUND", {
					message: "Workgroup not found.",
				});
			}

			await assertOrgMembership(
				ctx.context.adapter,
				session.user.id,
				existing.orgId,
			);

			const update: Record<string, unknown> = { updatedAt: new Date() };
			if (ctx.body.name !== undefined) update.name = ctx.body.name;
			if (ctx.body.description !== undefined)
				update.description = ctx.body.description;

			const updated = await ctx.context.adapter.update<Workgroup>({
				model: WORKGROUP_TABLE,
				where: [{ field: "id", value: ctx.body.workgroupId }],
				update,
			});

			if (!updated) {
				throw new APIError("INTERNAL_SERVER_ERROR", {
					message: "Failed to update workgroup.",
				});
			}

			return ctx.json({
				id: updated.id,
				name: updated.name,
				orgId: updated.orgId,
				description: updated.description,
			});
		},
	);
}

export function deleteWorkgroup() {
	return createAuthEndpoint(
		"/agent/workgroup/delete",
		{
			method: "POST",
			body: z.object({
				workgroupId: z.string().min(1).meta({ description: "Workgroup ID" }),
			}),
			metadata: {
				openapi: {
					description:
						"Delete a workgroup. Agents in this workgroup will have their workgroupId set to null.",
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.UNAUTHORIZED_SESSION);
			}

			const existing = await ctx.context.adapter.findOne<Workgroup>({
				model: WORKGROUP_TABLE,
				where: [{ field: "id", value: ctx.body.workgroupId }],
			});
			if (!existing) {
				throw new APIError("NOT_FOUND", {
					message: "Workgroup not found.",
				});
			}

			await assertOrgMembership(
				ctx.context.adapter,
				session.user.id,
				existing.orgId,
			);

			// Cascade: unassign all agents from this workgroup
			const agents = await ctx.context.adapter.findMany<Agent>({
				model: AGENT_TABLE,
				where: [{ field: "workgroupId", value: ctx.body.workgroupId }],
			});
			for (const agent of agents) {
				await ctx.context.adapter.update({
					model: AGENT_TABLE,
					where: [{ field: "id", value: agent.id }],
					update: { workgroupId: null, updatedAt: new Date() },
				});
			}

			await ctx.context.adapter.delete({
				model: WORKGROUP_TABLE,
				where: [{ field: "id", value: ctx.body.workgroupId }],
			});

			return ctx.json({ success: true });
		},
	);
}
