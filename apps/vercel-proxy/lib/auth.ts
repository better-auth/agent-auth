import { agentAuth } from "@better-auth/agent-auth";
import { createFromOpenAPI } from "@better-auth/agent-auth/openapi";
import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { anonymous, genericOAuth } from "better-auth/plugins";
import {
	db,
	getSetting,
	getUntransferredProjects,
	insertLog,
	markProjectTransferred,
	trackAutonomousProject,
} from "./db";

const VERCEL_OPENAPI_URL =
	"https://spec.speakeasy.com/vercel/vercel-docs/vercel-oas-with-code-samples";
const VERCEL_MCP_RESOURCE = "https://mcp.vercel.com/";
const VERCEL_MCP_CLIENT_ID = process.env.VERCEL_MCP_CLIENT_ID as string;
const VERCEL_MCP_REDIRECT_URI = `${process.env.BETTER_AUTH_URL}/callback`;
const VERCEL_MASTER_API_KEY = process.env.VERCEL_MASTER_API_KEY as string;
const vercelSpec = await fetch(VERCEL_OPENAPI_URL).then((r) => r.json());

const { onExecute: openapiOnExecute, ...openapiRest } = createFromOpenAPI(
	vercelSpec,
	{
		baseUrl: "https://api.vercel.com",
		defaultHostCapabilities: (c, { mode }) => {
			if (mode === "autonomous") {
				return true;
			}
			return c.method === "GET";
		},
		approvalStrength: {
			GET: "session",
			HEAD: "session",
			POST: "webauthn",
			PUT: "webauthn",
			PATCH: "webauthn",
			DELETE: "webauthn",
		},
		async resolveHeaders({ agentSession, ctx }) {
			if (agentSession.type === "autonomous") {
				return { Authorization: `Bearer ${VERCEL_MASTER_API_KEY}` };
			}

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
					"No Vercel access token found. User must sign in with Vercel first."
				);
			}

			return { Authorization: `Bearer ${account.accessToken}` };
		},
	}
);

function extractProjectId(
	result: unknown
): { projectId: string; projectName?: string } | null {
	if (!result || typeof result !== "object") {
		return null;
	}
	if ("__type" in (result as Record<string, unknown>)) {
		return null;
	}
	const data = result as Record<string, unknown>;
	if (typeof data.projectId === "string") {
		return { projectId: data.projectId, projectName: data.name as string };
	}
	if (typeof data.id === "string" && typeof data.name === "string") {
		return { projectId: data.id, projectName: data.name };
	}
	return null;
}

async function transferProjects(
	hostId: string,
	userAccessToken: string
): Promise<void> {
	const projects = getUntransferredProjects(hostId);
	if (projects.length === 0) {
		console.log("[transfer] No untransferred projects for host", hostId);
		return;
	}

	console.log(
		`[transfer] Attempting to transfer ${projects.length} project(s) for host ${hostId}`
	);

	for (const project of projects) {
		try {
			const transferUrl = `https://api.vercel.com/v1/projects/${project.projectId}/transfer-request`;
			console.log(`[transfer] POST ${transferUrl}`);
			const transferRes = await fetch(transferUrl, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${VERCEL_MASTER_API_KEY}`,
					"Content-Type": "application/json",
				},
				body: "{}",
			});

			if (!transferRes.ok) {
				const errBody = await transferRes.text();
				console.error(
					`[transfer] Transfer request failed for ${project.projectId}: ${transferRes.status} ${errBody}`
				);
				continue;
			}

			const { code } = (await transferRes.json()) as { code: string };
			console.log(
				`[transfer] Got transfer code for ${project.projectId}: ${code}`
			);

			const acceptUrl = `https://api.vercel.com/v1/projects/transfer-request/${code}`;
			console.log(`[transfer] PUT ${acceptUrl}`);
			const acceptRes = await fetch(acceptUrl, {
				method: "PUT",
				headers: {
					Authorization: `Bearer ${userAccessToken}`,
					"Content-Type": "application/json",
				},
				body: "{}",
			});

			if (acceptRes.ok || acceptRes.status === 202) {
				markProjectTransferred(project.projectId);
				console.log(
					`[transfer] Successfully transferred ${project.projectId} (${project.projectName})`
				);
			} else {
				const errBody = await acceptRes.text();
				console.error(
					`[transfer] Accept failed for ${project.projectId}: ${acceptRes.status} ${errBody}`
				);
			}
		} catch (err) {
			console.error(`[transfer] Error transferring ${project.projectId}:`, err);
		}
	}
}

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
							{
								method: "POST",
								headers: {
									"Content-Type": "application/x-www-form-urlencoded",
								},
								body: params.toString(),
							}
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
							}
						);

						if (!response.ok) {
							throw new Error(
								`Failed to fetch user info: ${await response.text()}`
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
		anonymous(),
		passkey({
			rpName: "Vercel Agent Auth",
		}),
		agentAuth({
			freshSessionWindow: () => {
				if (getSetting("freshSessionEnabled") !== "true") {
					return 0;
				}
				return Number.parseInt(getSetting("freshSessionWindow") ?? "300", 10);
			},
			...openapiRest,
			onExecute: async (context) => {
				const result = await openapiOnExecute?.(context);

				if (
					context.agentSession.type === "autonomous" &&
					context.agentSession.host?.id
				) {
					try {
						const extracted = extractProjectId(result);
						if (extracted) {
							trackAutonomousProject(
								context.agentSession.host.id,
								extracted.projectId,
								extracted.projectName
							);
						}
					} catch {
						// never break execution for tracking
					}
				}

				return result;
			},
			resolveAutonomousUser: () => ({
				id: "autonomous",
				name: "Autonomous Agent",
				email: "autonomous@vercel-proxy.local",
			}),
			onAutonomousAgentClaimed: async ({ ctx, hostId, userId }) => {
				console.log(
					`[claim] onAutonomousAgentClaimed fired — hostId=${hostId}, userId=${userId}`
				);
				try {
					const account = await ctx.context.adapter.findOne<{
						accessToken: string | null;
					}>({
						model: "account",
						where: [
							{ field: "userId", value: userId },
							{ field: "providerId", value: "vercel-mcp" },
						],
					});

					if (account?.accessToken) {
						console.log("[claim] Found Vercel access token, starting transfer");
						await transferProjects(hostId, account.accessToken);
					} else {
						console.warn(
							"[claim] No Vercel access token found for user",
							userId
						);
					}
				} catch (err) {
					console.error("[claim] Error in onAutonomousAgentClaimed:", err);
				}
			},
			allowDynamicHostRegistration: true,
			trustProxy: process.env.TRUST_PROXY === "true",
			proofOfPresence: {
				enabled: getSetting("webauthnEnabled") === "true",
			},
			providerName: "Vercel",
			providerDescription:
				"Vercel is a cloud platform for deploying and hosting frontend applications, serverless functions, and full-stack web projects with automatic CI/CD, edge networking, and seamless Git integration.",
			modes: ["delegated", "autonomous"],
			approvalMethods: ["ciba", "device_authorization"],
			resolveApprovalMethod: ({ preferredMethod, supportedMethods }) => {
				const serverPreferred =
					getSetting("preferredApprovalMethod") ?? "device_authorization";
				const method = preferredMethod ?? serverPreferred;
				return supportedMethods.includes(method)
					? method
					: "device_authorization";
			},
			onEvent: (event) => {
				try {
					const { type, actorId, actorType, agentId, hostId, orgId, ...rest } =
						event as unknown as Record<string, unknown>;
					insertLog.run(
						type ?? null,
						(actorId as string) ?? null,
						(actorType as string) ?? null,
						(agentId as string) ?? null,
						(hostId as string) ?? null,
						(orgId as string) ?? null,
						JSON.stringify(rest)
					);
				} catch {
					// never let logging break the flow
				}
			},
		}),
	],
});
