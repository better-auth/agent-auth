import { agentAuth } from "@better-auth/agent-auth";
import { fromOpenAPI, createOpenAPIHandler } from "@better-auth/agent-auth/openapi";
import { betterAuth } from "better-auth";
import { genericOAuth } from "better-auth/plugins";
import { db, getSetting, insertLog } from "./db";

const VERCEL_OPENAPI_URL =
	"https://spec.speakeasy.com/vercel/vercel-docs/vercel-oas-with-code-samples";

const vercelSpec = await fetch(VERCEL_OPENAPI_URL).then((r) => r.json());

const VERCEL_MCP_RESOURCE = "https://mcp.vercel.com/";
const VERCEL_MCP_CLIENT_ID = process.env.VERCEL_MCP_CLIENT_ID as string;
const VERCEL_MCP_REDIRECT_URI = `${process.env.BETTER_AUTH_URL}/callback`;

export const auth = betterAuth({
	database: db,
	plugins: [
		genericOAuth({
			config: [
				{
				providerId: "vercel-mcp",
				clientId: VERCEL_MCP_CLIENT_ID,
				redirectURI: `${process.env.BETTER_AUTH_URL}/callback`,
				authorizationUrl: "https://vercel.com/oauth/authorize",
				tokenUrl: "https://vercel.com/api/login/oauth/token",
				scopes: ["openid", "email", "profile", "offline_access"],
				pkce: true,
				prompt: "consent",
					authorizationUrlParams: {
						resource: VERCEL_MCP_RESOURCE,
					},
					getToken: async ({ code, codeVerifier }) => {
						const params = new URLSearchParams({
							grant_type: "authorization_code",
							client_id: VERCEL_MCP_CLIENT_ID,
							code,
							redirect_uri: VERCEL_MCP_REDIRECT_URI,
							resource: VERCEL_MCP_RESOURCE,
						});
						if (codeVerifier) {
							params.set("code_verifier", codeVerifier);
						}

						const response = await fetch(
							"https://vercel.com/api/login/oauth/token",
							{ method: "POST", body: params },
						);

						if (!response.ok) {
							const err = await response.text();
							throw new Error(`Token exchange failed: ${err}`);
						}

						const data = await response.json();
						return {
							accessToken: data.access_token,
							refreshToken: data.refresh_token,
							accessTokenExpiresAt: data.expires_in
								? new Date(Date.now() + data.expires_in * 1000)
								: undefined,
							scopes: data.scope?.split(" ") ?? [],
							tokenType: data.token_type,
							raw: data,
						};
					},
					getUserInfo: async (tokens) => {
						const response = await fetch(
							"https://api.vercel.com/login/oauth/userinfo",
							{
								method: "POST",
								headers: {
									Authorization: `Bearer ${tokens.accessToken}`,
								},
							},
						);

						if (!response.ok) {
							throw new Error(
								`Failed to fetch user info: ${await response.text()}`,
							);
						}

						const data = await response.json();
						return {
							id: data.sub,
							email: data.email,
							name: data.name || data.preferred_username,
							image: data.picture,
							emailVerified: data.email_verified ?? true,
						};
					},
				},
			],
		}),
		agentAuth({
			freshSessionWindow: () => {
				if (getSetting("freshSessionEnabled") !== "true") return 0;
				return parseInt(getSetting("freshSessionWindow") ?? "300", 10);
			},
			providerName: "vercel",
			providerDescription:
				"Vercel is a cloud platform for deploying and hosting frontend applications, serverless functions, and full-stack web projects with automatic CI/CD, edge networking, and seamless Git integration.",
			modes: ["delegated", "autonomous"],
			capabilities: fromOpenAPI(vercelSpec),
			onExecute: createOpenAPIHandler(vercelSpec, {
				baseUrl: "https://api.vercel.com",
				async resolveHeaders({ agentSession, ctx }) {
					const account = await ctx.context.adapter.findOne<{
						accessToken: string | null;
					}>({
						model: "account",
						where: [
							{ field: "userId", value: agentSession.user.id },
							{ field: "providerId", value: "vercel-mcp" },
						],
					});

					if (!account?.accessToken) {
						throw new Error(
							"No Vercel access token found. User must sign in with Vercel first.",
						);
					}

					return { Authorization: `Bearer ${account.accessToken}` };
				},
			}),
			onEvent: (event) => {
				try {
					const {
						type,
						actorId,
						actorType,
						agentId,
						hostId,
						orgId,
						...rest
					} = event as unknown as Record<string, unknown>;
					insertLog.run(
						type ?? null,
						(actorId as string) ?? null,
						(actorType as string) ?? null,
						(agentId as string) ?? null,
						(hostId as string) ?? null,
						(orgId as string) ?? null,
						JSON.stringify(rest),
					);
				} catch {
					// never let logging break the flow
				}
			},
		}),
	],
});

