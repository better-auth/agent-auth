import { and, count, eq, inArray } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth/auth";
import { agent, agentHost, member } from "@/lib/db/better-auth-schema";
import { db } from "@/lib/db/drizzle";

function parseScopes(value: unknown): string[] {
	if (Array.isArray(value)) return value;
	if (typeof value !== "string" || !value) return [];
	try {
		let parsed: unknown = JSON.parse(value);
		if (typeof parsed === "string") parsed = JSON.parse(parsed);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

/**
 * GET /api/hosts
 *
 * Returns hosts for the user's org. Session auth required.
 */
export async function GET(req: Request) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const url = new URL(req.url);
	const orgId = url.searchParams.get("orgId");
	if (!orgId) {
		return Response.json({ error: "orgId required" }, { status: 400 });
	}

	const orgMembers = await db
		.select({ userId: member.userId })
		.from(member)
		.where(eq(member.organizationId, orgId));

	const userIds = orgMembers.map((m) => m.userId);
	if (userIds.length === 0) {
		return Response.json([]);
	}

	const hosts = await db
		.select()
		.from(agentHost)
		.where(inArray(agentHost.userId, userIds));

	const hostsWithAgentCount = await Promise.all(
		hosts.map(async (host) => {
			const [agentCount] = await db
				.select({ count: count() })
				.from(agent)
				.where(and(eq(agent.hostId, host.id), eq(agent.status, "active")));

			const scopes = parseScopes(host.scopes);

			return {
				id: host.id,
				name: host.name ?? null,
				userId: host.userId,
				status: host.status,
				scopes,
				activeAgents: agentCount?.count ?? 0,
				createdAt: host.createdAt?.toISOString() ?? null,
				lastUsedAt: host.lastUsedAt?.toISOString() ?? null,
			};
		}),
	);

	return Response.json(hostsWithAgentCount);
}
