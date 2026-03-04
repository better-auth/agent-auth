import type { AgentSession } from "@better-auth/agent-auth";
import { verifyAgentRequest } from "@better-auth/agent-auth";
import { eq } from "drizzle-orm";
import { importJWK, jwtVerify } from "jose";
import { headers as nextHeaders } from "next/headers";
import { auth } from "@/lib/auth/auth";
import { agentHost, member } from "@/lib/db/better-auth-schema";
import { db } from "@/lib/db/drizzle";

export interface ResolvedAuth {
	userId: string;
	orgId: string;
	agentSession?: AgentSession;
}

/**
 * Resolve the authenticated user and their org from:
 * 1. Agent JWT (Authorization: Bearer <agent_jwt>)
 * 2. Host JWT (Authorization: Bearer <host_jwt>)
 * 3. User session (cookie)
 */
export async function resolveAuth(
	request: Request,
): Promise<ResolvedAuth | null> {
	const authHeader = request.headers.get("Authorization");

	if (authHeader?.startsWith("Bearer ")) {
		const token = authHeader.slice(7);

		try {
			const agentSession = await verifyAgentRequest({ auth, request });
			if (agentSession?.user) {
				const orgId = await getUserOrgId(agentSession.user.id);
				if (orgId) {
					return { userId: agentSession.user.id, orgId, agentSession };
				}
			}
		} catch {
			// Agent JWT failed — try host JWT
		}

		const hostResult = await tryResolveHostJWT(token);
		if (hostResult) {
			return hostResult;
		}
	}

	try {
		const session = await auth.api.getSession({
			headers: await nextHeaders(),
		});
		if (session?.user) {
			const orgId = await getUserOrgId(session.user.id);
			if (orgId) {
				return { userId: session.user.id, orgId };
			}
		}
	} catch {
		// Session auth failed
	}

	return null;
}

/**
 * Attempt to verify a JWT as a host JWT.
 * Host JWTs have `sub` = host ID and contain `host_public_key` in the payload.
 */
async function tryResolveHostJWT(token: string): Promise<ResolvedAuth | null> {
	try {
		const parts = token.split(".");
		if (parts.length !== 3) return null;

		const payloadStr = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
		const payload = JSON.parse(payloadStr) as {
			sub?: string;
			host_public_key?: Record<string, unknown>;
		};

		if (!payload.sub) return null;

		const [host] = await db
			.select()
			.from(agentHost)
			.where(eq(agentHost.id, payload.sub))
			.limit(1);

		if (!host || host.status !== "active" || !host.userId) return null;

		const publicKey = JSON.parse(host.publicKey);
		const key = await importJWK(publicKey, "EdDSA");
		await jwtVerify(token, key, { maxTokenAge: "120s" });

		const orgId = await getUserOrgId(host.userId);
		if (!orgId) return null;

		return { userId: host.userId, orgId };
	} catch {
		return null;
	}
}

async function getUserOrgId(userId: string): Promise<string | null> {
	const [membership] = await db
		.select({ orgId: member.organizationId })
		.from(member)
		.where(eq(member.userId, userId))
		.limit(1);
	return membership?.orgId ?? null;
}

/**
 * List hosts belonging to a user (via the agentHost table).
 */
export async function getUserHosts(userId: string) {
	return db.select().from(agentHost).where(eq(agentHost.userId, userId));
}
