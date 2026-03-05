import type { ResolvedAgentAuthOptions } from "./types";

/**
 * Resolve the `expiresAt` for a permission row.
 *
 * Priority: explicit TTL (from request body) > plugin resolver > null.
 * Returns a `Date` or `null`.
 */
export async function resolvePermissionExpiresAt(
	opts: ResolvedAgentAuthOptions,
	scope: string,
	context: {
		agentId: string;
		hostId: string | null;
		userId: string | null;
	},
	explicitTTLSeconds?: number | null,
): Promise<Date | null> {
	if (explicitTTLSeconds != null && explicitTTLSeconds > 0) {
		return new Date(Date.now() + explicitTTLSeconds * 1000);
	}

	if (opts.resolvePermissionTTL) {
		const ttl = await opts.resolvePermissionTTL({
			scope,
			agentId: context.agentId,
			hostId: context.hostId,
			userId: context.userId,
		});
		if (ttl != null && ttl > 0) {
			return new Date(Date.now() + ttl * 1000);
		}
	}

	return null;
}
