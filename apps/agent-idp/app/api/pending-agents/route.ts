import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listMCPTools } from "@/lib/mcp-client";
import { listProviders } from "@/lib/mcp-providers";

/**
 * GET /api/pending-agents
 *
 * Lists behalf_of agents in "pending" status that belong to the
 * current user. Autonomous agents are never pending — they are
 * created active and link to a user later via connect_account (§2).
 */
export async function GET() {
	const session = await auth.api.getSession({
		headers: await headers(),
	});

	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const ctx = await (auth as any).$context;
	const adapter = ctx.adapter;

	const pendingAgents = await adapter.findMany({
		model: "agent",
		where: [
			{ field: "status", value: "pending" },
			{ field: "userId", value: session.user.id },
		],
		sortBy: { field: "createdAt", direction: "desc" },
	});

	const agents = await Promise.all(
		pendingAgents.map(async (a: any) => {
			const permissions = await adapter.findMany({
				model: "agentPermission",
				where: [{ field: "agentId", value: a.id }],
			});
			return {
				id: a.id,
				name: a.name,
				status: a.status,
				mode: a.mode,
				hostId: a.hostId,
				createdAt: a.createdAt,
				requestedScopes: permissions.map((p: any) => p.scope),
			};
		}),
	);

	const roles = ctx.options?.plugins?.find((p: any) => p.id === "agent-auth")
		?.options?.roles;
	const configScopes: string[] = roles
		? [...new Set(Object.values(roles as Record<string, string[]>).flat())]
		: [];

	const providers = listProviders(session.user.id);
	const toolScopes: string[] = [];
	for (const provider of providers) {
		try {
			const tools = await listMCPTools(provider.endpoint);
			for (const tool of tools) {
				toolScopes.push(tool.name);
			}
		} catch {}
	}

	const allScopes = [...new Set([...configScopes, ...toolScopes])].sort();

	return NextResponse.json({ agents, allScopes });
}
