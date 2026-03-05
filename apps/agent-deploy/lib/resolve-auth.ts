import { headers } from "next/headers";
import { verifyAgentRequest } from "@better-auth/agent-auth";
import { auth } from "./auth";
import { db } from "./db";
import { agentActivity } from "./db/schema";

type AgentPermissionView = {
	scope: string;
	status: string;
};

export type AuthResult =
	| {
			type: "user";
			userId: string;
			session: Awaited<ReturnType<typeof auth.api.getSession>>;
	  }
	| {
			type: "agent";
			userId: string;
			agentId: string;
			agentName: string;
			hostId: string | null;
			scopes: string[];
	  };

export async function resolveAuth(
	request?: Request,
): Promise<AuthResult | null> {
	const h = await headers();
	const hasBearer = h.get("authorization")?.startsWith("Bearer ");

	if (hasBearer && request) {
		try {
			const agentSession = await verifyAgentRequest({ auth, request });
			if (agentSession) {
				const scopes = (agentSession.agent.permissions ?? [])
					.filter((p: AgentPermissionView) => p.status === "active")
					.map((p: AgentPermissionView) => p.scope);

				return {
					type: "agent",
					userId: agentSession.user.id,
					agentId: agentSession.agent.id,
					agentName: agentSession.agent.name,
					hostId: agentSession.host?.id ?? agentSession.agent.hostId ?? null,
					scopes,
				};
			}
		} catch {
			return null;
		}
	}

	if (hasBearer) {
		try {
			const agentSession = await auth.api.getAgentSession({ headers: h });
			if (agentSession) {
				const scopes = (agentSession.agent.permissions ?? [])
					.filter((p: AgentPermissionView) => p.status === "active")
					.map((p: AgentPermissionView) => p.scope);

				return {
					type: "agent",
					userId: agentSession.user.id,
					agentId: agentSession.agent.id,
					agentName: agentSession.agent.name,
					hostId: agentSession.host?.id ?? agentSession.agent.hostId ?? null,
					scopes,
				};
			}
		} catch {
			return null;
		}
	}

	let session: Awaited<ReturnType<typeof auth.api.getSession>>;
	try {
		session = await auth.api.getSession({ headers: h });
	} catch {
		return null;
	}
	if (!session?.user) return null;

	return {
		type: "user",
		userId: session.user.id,
		session,
	};
}

export function hasScope(
	authResult: AuthResult,
	requiredScope: string,
): boolean {
	if (authResult.type === "user") return true;
	const { scopes } = authResult;
	return scopes.includes("*") || scopes.includes(requiredScope);
}

export function requireScope(
	authResult: AuthResult,
	requiredScope: string,
): Response | null {
	if (!hasScope(authResult, requiredScope)) {
		return Response.json(
			{
				error: `Missing required scope: ${requiredScope}`,
				requiredScope,
				hint: "Request this scope via POST /api/auth/agent/request-scope",
			},
			{ status: 403 },
		);
	}
	return null;
}

export function logActivity(
	authResult: AuthResult,
	action: string,
	resourceType?: string,
	resourceId?: string,
	details?: string,
) {
	if (authResult.type !== "agent") return;

	db.insert(agentActivity)
		.values({
			id: crypto.randomUUID(),
			agentId: authResult.agentId,
			agentName: authResult.agentName,
			action,
			resourceType: resourceType ?? null,
			resourceId: resourceId ?? null,
			details: details ?? null,
			status: "success",
			createdAt: new Date().toISOString(),
		})
		.run();
}
