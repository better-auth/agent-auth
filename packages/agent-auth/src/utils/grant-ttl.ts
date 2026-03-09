import type { ResolvedAgentAuthOptions } from "../types";

/**
 * Resolve the `expiresAt` for a new capability grant.
 *
 * Priority: explicit TTL from request → plugin-level resolver → null.
 */
export async function resolveGrantExpiresAt(
	opts: ResolvedAgentAuthOptions,
	capability: string,
	context: {
		agentId: string;
		hostId: string | null;
		userId: string | null;
	},
	explicitTTL?: number,
): Promise<Date | null> {
	if (explicitTTL && explicitTTL > 0) {
		return new Date(Date.now() + explicitTTL * 1000);
	}

	if (opts.resolveGrantTTL) {
		const ttl = await opts.resolveGrantTTL({
			capability,
			agentId: context.agentId,
			hostId: context.hostId,
			userId: context.userId,
		});
		if (ttl && ttl > 0) {
			return new Date(Date.now() + ttl * 1000);
		}
	}

	return null;
}
