import { agentAuth } from "@better-auth/agent-auth";
import type { GenericEndpointContext } from "@better-auth/core";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getSessionFromCtx } from "better-auth/api";
import { bearer, deviceAuthorization, organization } from "better-auth/plugins";
import { ac, admin, member, owner } from "@/lib/auth/permissions";
import * as betterAuthSchema from "@/lib/db/better-auth-schema";
import { db } from "@/lib/db/drizzle";
import { syncConnectionOnAccountLink } from "@/lib/db/sync-connection";
import { env } from "@/lib/env";

async function getOrgMetadataFromCtx(
	ctx: GenericEndpointContext,
): Promise<Record<string, unknown> | null> {
	try {
		const session = await getSessionFromCtx(ctx);
		if (!session?.user?.id) return null;

		const rows = await ctx.context.adapter.findMany<{
			organizationId: string;
		}>({
			model: "member",
			where: [{ field: "userId", value: session.user.id }],
		});

		if (rows.length === 0) return null;

		const org = await ctx.context.adapter.findOne<{
			metadata: string | null;
		}>({
			model: "organization",
			where: [{ field: "id", value: rows[0]!.organizationId }],
		});

		if (!org?.metadata) return null;
		try {
			return JSON.parse(org.metadata);
		} catch {
			return null;
		}
	} catch {
		return null;
	}
}

async function isOrgDynamicHostAllowed(
	ctx: GenericEndpointContext,
): Promise<boolean> {
	const meta = await getOrgMetadataFromCtx(ctx);
	if (!meta) return true;
	return meta.allowDynamicHostRegistration !== false;
}

async function getOrgDynamicHostDefaultScopes(
	ctx: GenericEndpointContext,
): Promise<string[]> {
	const meta = await getOrgMetadataFromCtx(ctx);
	if (!meta || !Array.isArray(meta.dynamicHostDefaultScopes)) return [];
	return meta.dynamicHostDefaultScopes;
}

async function getOrgFreshSessionWindow(
	ctx: GenericEndpointContext,
): Promise<number> {
	const meta = await getOrgMetadataFromCtx(ctx);
	if (!meta) return 0;
	if (meta.reAuthPolicy === "none") return 0;
	if (meta.reAuthPolicy === "fresh_session") {
		return typeof meta.freshSessionWindow === "number"
			? meta.freshSessionWindow
			: 300;
	}
	return 300;
}

const VALID_APPROVAL_METHODS = new Set(["ciba", "device_authorization"]);

async function resolveApproval({
	userId,
}: {
	userId: string | null;
	agentName: string;
	hostId: string | null;
	scopes: string[];
}): Promise<string> {
	if (!userId) return "device_authorization";

	try {
		const pref = await db.query.userPreference.findFirst({
			where: (t, { eq }) => eq(t.userId, userId),
			columns: { preferredApprovalMethod: true },
		});
		if (
			pref?.preferredApprovalMethod &&
			VALID_APPROVAL_METHODS.has(pref.preferredApprovalMethod)
		) {
			return pref.preferredApprovalMethod;
		}
	} catch {
		// user pref lookup is best-effort
	}

	try {
		const memberships = await db.query.member.findMany({
			where: (m, { eq }) => eq(m.userId, userId),
			columns: { organizationId: true },
			limit: 1,
		});
		if (memberships.length > 0) {
			const org = await db.query.organization.findFirst({
				where: (o, { eq }) => eq(o.id, memberships[0]!.organizationId),
				columns: { metadata: true },
			});
			if (org?.metadata) {
				const parsed =
					typeof org.metadata === "string"
						? JSON.parse(org.metadata)
						: org.metadata;
				const orgMethod = parsed?.defaultApprovalMethod;
				if (VALID_APPROVAL_METHODS.has(orgMethod)) {
					return orgMethod;
				}
			}
		}
	} catch {
		// org setting lookup is best-effort
	}

	return "ciba";
}

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "pg",
		schema: betterAuthSchema,
	}),
	databaseHooks: {
		account: {
			create: {
				after: async (account) => {
					syncConnectionOnAccountLink(account).catch((err) => {
						console.warn("Failed to sync connection on account link:", err);
					});
				},
			},
		},
	},
	emailAndPassword: {
		enabled: true,
		requireEmailVerification: false,
	},
	account: {
		accountLinking: {
			enabled: true,
			allowDifferentEmails: true,
		},
	},
	socialProviders: {
		google:
			env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
				? {
						prompt: "select_account",
						clientId: env.GOOGLE_CLIENT_ID,
						clientSecret: env.GOOGLE_CLIENT_SECRET,
					}
				: undefined,
		github:
			env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
				? {
						clientId: env.GITHUB_CLIENT_ID,
						clientSecret: env.GITHUB_CLIENT_SECRET,
						scope: ["user:email", "repo", "read:org"],
					}
				: undefined,
	},
	session: {
		cookieCache: {
			enabled: true,
			maxAge: 5 * 60,
		},
	},
	plugins: [
		bearer(),
		organization({
			ac,
			roles: { owner, admin, member },
		}),
		agentAuth({
			rateLimit: false, 
			freshSessionWindow: (ctx) => getOrgFreshSessionWindow(ctx),
			approvalMethods: ["device_authorization", "ciba"],
			resolveApprovalMethod: resolveApproval,
			providerName: "agent-idp",
			providerDescription: "Agent Auth Identity Provider",
			allowDynamicHostRegistration: (ctx) => isOrgDynamicHostAllowed(ctx),
			dynamicHostDefaultScopes: (ctx) => getOrgDynamicHostDefaultScopes(ctx),
		}),
		deviceAuthorization(),
	],
	trustedOrigins: [
		"http://localhost:3000",
		"http://localhost:4000",
		"chrome-extension://*",
		"better-auth-desktop://*",
	],
	baseURL: env.BETTER_AUTH_URL,
	basePath: "/api/auth",
});

export type Session = typeof auth.$Infer.Session;
