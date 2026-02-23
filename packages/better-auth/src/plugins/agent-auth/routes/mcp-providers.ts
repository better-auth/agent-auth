import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import { getSessionFromCtx } from "../../../api";
import { AGENT_AUTH_ERROR_CODES as ERROR_CODES } from "../error-codes";
import type { MCPProvider, ResolvedAgentAuthOptions } from "../types";

const PROVIDER_TABLE = "mcpProvider";

async function requireProviderAdmin(
	_ctx: { headers?: Headers | null },
	session: { user: { id: string; role?: string | null; [key: string]: unknown } },
	opts: ResolvedAgentAuthOptions,
) {
	const guard = opts.authorizeProviderManagement;
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
	// Default: require admin role (matches better-auth's default user.role field)
	if (session.user.role !== "admin") {
		throw new APIError("FORBIDDEN", {
			message: "Provider management requires admin role.",
		});
	}
}

const providerBodySchema = z
	.object({
		name: z
			.string()
			.min(1)
			.meta({ description: "Unique provider name (scope namespace)" }),
		displayName: z
			.string()
			.min(1)
			.meta({ description: "Human-readable display name" }),
		transport: z
			.enum(["stdio", "sse"])
			.meta({ description: "Transport type" }),
		command: z
			.string()
			.min(1)
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
			.url()
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
	})
	.refine(
		(data) => {
			if (data.transport === "stdio") return !!data.command;
			if (data.transport === "sse") return !!data.url;
			return true;
		},
		{
			message:
				'stdio transport requires "command", sse transport requires "url"',
		},
	);

export function registerProvider(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/agent/mcp-provider/register",
		{
			method: "POST",
			body: providerBodySchema,
			metadata: {
				openapi: {
					description: "Register a new MCP provider. Requires admin role by default.",
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.UNAUTHORIZED_SESSION);
			}
			await requireProviderAdmin(ctx, session, opts);

			const existing = await ctx.context.adapter.findOne<MCPProvider>({
				model: PROVIDER_TABLE,
				where: [{ field: "name", value: ctx.body.name }],
			});

			if (existing) {
				throw new APIError("BAD_REQUEST", {
					message: `Provider "${ctx.body.name}" already exists.`,
				});
			}

			const now = new Date();
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

/**
 * Intentionally no admin guard — listing providers is read-only and
 * low-sensitivity (no secrets like env vars or auth headers). Returns
 * id, name, displayName, transport, status, and createdAt. Any
 * authenticated user can see which providers are available so they
 * can request the right scopes when creating agents.
 */
export function listProviders() {
	return createAuthEndpoint(
		"/agent/mcp-provider/list",
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

export function deleteProvider(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/agent/mcp-provider/delete",
		{
			method: "POST",
			body: z.object({
				name: z.string().meta({ description: "Provider name to delete" }),
			}),
			metadata: {
				openapi: {
					description: "Delete an MCP provider. Requires admin role by default.",
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.UNAUTHORIZED_SESSION);
			}
			await requireProviderAdmin(ctx, session, opts);

			const provider = await ctx.context.adapter.findOne<MCPProvider>({
				model: PROVIDER_TABLE,
				where: [
					{ field: "name", value: ctx.body.name },
					{ field: "status", value: "active" },
				],
			});

			if (!provider) {
				throw new APIError("NOT_FOUND", {
					message: `Provider "${ctx.body.name}" not found.`,
				});
			}

			// Soft-delete so the gateway's ProviderManager can observe
			// the status change and tear down live connections gracefully.
			await ctx.context.adapter.update({
				model: PROVIDER_TABLE,
				where: [{ field: "id", value: provider.id }],
				update: {
					status: "disabled",
					updatedAt: new Date(),
				},
			});

			return ctx.json({ success: true });
		},
	);
}
