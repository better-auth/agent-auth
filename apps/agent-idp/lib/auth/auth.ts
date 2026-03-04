import { agentAuth } from "@better-auth/agent-auth";
import type { GenericEndpointContext } from "@better-auth/core";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getSessionFromCtx } from "better-auth/api";
import { deviceAuthorization, organization } from "better-auth/plugins";
import { ac, admin, member, owner } from "@/lib/auth/permissions";
import * as betterAuthSchema from "@/lib/db/better-auth-schema";
import { db } from "@/lib/db/drizzle";
import { syncConnectionOnAccountLink } from "@/lib/db/sync-connection";
import { env } from "@/lib/env";

async function isOrgDynamicHostAllowed(
	ctx: GenericEndpointContext,
): Promise<boolean> {
	try {
		const session = await getSessionFromCtx(ctx);
		if (!session?.user?.id) return true;

		const rows = await ctx.context.adapter.findMany<{
			organizationId: string;
		}>({
			model: "member",
			where: [{ field: "userId", value: session.user.id }],
		});

		if (rows.length === 0) return true;

		const org = await ctx.context.adapter.findOne<{
			metadata: string | null;
		}>({
			model: "organization",
			where: [{ field: "id", value: rows[0]!.organizationId }],
		});

		if (!org?.metadata) return true;
		try {
			const parsed = JSON.parse(org.metadata);
			return parsed.allowDynamicHostRegistration !== false;
		} catch {
			return true;
		}
	} catch {
		return true;
	}
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
		organization({
			ac,
			roles: { owner, admin, member },
		}),
		agentAuth({
			rateLimit: false,
			approvalMethods: ["device_authorization", "ciba"],
			providerName: "agent-idp",
			providerDescription: "Agent Auth Identity Provider",
			allowDynamicHostRegistration: (ctx) => isOrgDynamicHostAllowed(ctx),
		}),
		deviceAuthorization(),
	],
	trustedOrigins: ["http://localhost:3000", "http://localhost:4000"],
	baseURL: env.BETTER_AUTH_URL,
	basePath: "/api/auth",
});

export type Session = typeof auth.$Infer.Session;
