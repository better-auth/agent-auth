import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import { getSessionFromCtx } from "../../../api";
import { AGENT_GATEWAY_ERROR_CODES as ERROR_CODES } from "../error-codes";
import type { AgentGatewayOptions, MCPProvider } from "../types";

const PROVIDER_TABLE = "mcpProvider";

async function requireProviderAdmin(
	session: {
		user: {
			id: string;
			role?: string | null;
			[key: string]: string | number | boolean | null | undefined;
		};
	},
	opts?: AgentGatewayOptions,
) {
	const guard = opts?.authorizeProviderManagement;
	if (guard === true) return;
	if (typeof guard === "function") {
		const allowed = await guard(session.user);
		if (!allowed) {
			throw new APIError("FORBIDDEN", {
				message: "You do not have permission to manage MCP providers.",
			});
		}
		return;
	}
	if (session.user.role !== "admin") {
		throw new APIError("FORBIDDEN", {
			message: "Provider management requires admin role.",
		});
	}
}

const providerBodySchema = z.object({
	name: z
		.string()
		.min(1)
		.meta({ description: "Unique provider name (scope namespace)" }),
	displayName: z
		.string()
		.min(1)
		.meta({ description: "Human-readable display name" }),
	transport: z.enum(["stdio", "sse"]).meta({ description: "Transport type" }),
	command: z
		.string()
		.meta({ description: "For stdio: command to spawn" })
		.optional(),
	args: z
		.array(z.string())
		.meta({ description: "For stdio: command arguments" })
		.optional(),
	env: z
		.record(z.string(), z.string())
		.meta({ description: "For stdio: environment variables" })
		.optional(),
	url: z
		.string()
		.meta({ description: "For SSE: remote MCP server URL" })
		.optional(),
	headers: z
		.record(z.string(), z.string())
		.meta({ description: "For SSE: HTTP headers" })
		.optional(),
	toolScopes: z
		.record(z.string(), z.array(z.string()))
		.meta({ description: "Scope-to-tools mapping" })
		.optional(),
});

export function registerProvider(opts?: AgentGatewayOptions) {
	return createAuthEndpoint(
		"/agent/gateway/provider/register",
		{
			method: "POST",
			body: providerBodySchema,
			metadata: {
				openapi: {
					description:
						"Register a new MCP provider. Requires admin role by default.",
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.UNAUTHORIZED_SESSION);
			}
			await requireProviderAdmin(session, opts);

			if (ctx.body.transport === "stdio" && !ctx.body.command) {
				throw new APIError("BAD_REQUEST", {
					message: "stdio transport requires a command.",
				});
			}
			if (ctx.body.transport === "sse" && !ctx.body.url) {
				throw new APIError("BAD_REQUEST", {
					message: "sse transport requires a url.",
				});
			}

			const existing = await ctx.context.adapter.findOne<MCPProvider>({
				model: PROVIDER_TABLE,
				where: [{ field: "name", value: ctx.body.name }],
			});

			if (existing && existing.status === "active") {
				throw new APIError("BAD_REQUEST", {
					message: `Provider "${ctx.body.name}" already exists.`,
				});
			}

			const now = new Date();

			if (existing && existing.status === "disabled") {
				const updated = await ctx.context.adapter.update<MCPProvider>({
					model: PROVIDER_TABLE,
					where: [{ field: "id", value: existing.id }],
					update: {
						displayName: ctx.body.displayName,
						transport: ctx.body.transport,
						command: ctx.body.command ?? null,
						args: ctx.body.args ? JSON.stringify(ctx.body.args) : null,
						env: ctx.body.env ? JSON.stringify(ctx.body.env) : null,
						url: ctx.body.url ?? null,
						headers: ctx.body.headers ? JSON.stringify(ctx.body.headers) : null,
						toolScopes: ctx.body.toolScopes
							? JSON.stringify(ctx.body.toolScopes)
							: null,
						status: "active",
						updatedAt: now,
					},
				});
				if (!updated) {
					throw new APIError("INTERNAL_SERVER_ERROR", {
						message: "Failed to reactivate provider.",
					});
				}
				return ctx.json({
					id: updated.id,
					name: updated.name,
					displayName: updated.displayName,
					transport: updated.transport,
					status: updated.status,
				});
			}

			const provider = await ctx.context.adapter.create<
				Record<string, unknown>,
				MCPProvider
			>({
				model: PROVIDER_TABLE,
				data: {
					name: ctx.body.name,
					displayName: ctx.body.displayName,
					transport: ctx.body.transport,
					command: ctx.body.command ?? null,
					args: ctx.body.args ? JSON.stringify(ctx.body.args) : null,
					env: ctx.body.env ? JSON.stringify(ctx.body.env) : null,
					url: ctx.body.url ?? null,
					headers: ctx.body.headers ? JSON.stringify(ctx.body.headers) : null,
					toolScopes: ctx.body.toolScopes
						? JSON.stringify(ctx.body.toolScopes)
						: null,
					status: "active",
					createdAt: now,
					updatedAt: now,
				},
			});

			return ctx.json({
				id: provider.id,
				name: provider.name,
				displayName: provider.displayName,
				transport: provider.transport,
				status: provider.status,
			});
		},
	);
}

export function listProviders() {
	return createAuthEndpoint(
		"/agent/gateway/provider/list",
		{
			method: "GET",
			metadata: {
				openapi: {
					description: "List all registered MCP providers.",
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.UNAUTHORIZED_SESSION);
			}

			const providers = await ctx.context.adapter.findMany<MCPProvider>({
				model: PROVIDER_TABLE,
				where: [{ field: "status", value: "active" }],
			});

			return ctx.json({
				providers: providers.map((p) => ({
					id: p.id,
					name: p.name,
					displayName: p.displayName,
					transport: p.transport,
					status: p.status,
					createdAt: p.createdAt,
				})),
			});
		},
	);
}

export function deleteProvider(opts?: AgentGatewayOptions) {
	return createAuthEndpoint(
		"/agent/gateway/provider/delete",
		{
			method: "POST",
			body: z.object({
				name: z.string().meta({ description: "Provider name to delete" }),
			}),
			metadata: {
				openapi: {
					description:
						"Disable an MCP provider (soft-delete). Requires admin role by default.",
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.UNAUTHORIZED_SESSION);
			}
			await requireProviderAdmin(session, opts);

			const provider = await ctx.context.adapter.findOne<MCPProvider>({
				model: PROVIDER_TABLE,
				where: [{ field: "name", value: ctx.body.name }],
			});

			if (!provider) {
				throw new APIError("NOT_FOUND", {
					message: `Provider "${ctx.body.name}" not found.`,
				});
			}

			await ctx.context.adapter.delete({
				model: PROVIDER_TABLE,
				where: [{ field: "id", value: provider.id }],
			});

			return ctx.json({ success: true });
		},
	);
}
