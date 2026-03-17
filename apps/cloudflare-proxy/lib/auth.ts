import { agentAuth } from "@better-auth/agent-auth";
import { fromOpenAPI } from "@better-auth/agent-auth/openapi";
import { betterAuth } from "better-auth";
import { anonymous, genericOAuth } from "better-auth/plugins";
import {
	db,
	getRegistration,
	getSetting,
	insertLog,
	setRegistration,
} from "./db";
import { callMcpTool, parseToolResult, registerMcpClient } from "./mcp-client";

const MCP_BASE = "https://mcp.cloudflare.com";
const REDIRECT_URI = `${process.env.BETTER_AUTH_URL}/callback`;
const CLOUDFLARE_OPENAPI_URL =
	"https://raw.githubusercontent.com/cloudflare/api-schemas/main/openapi.json";

const isBuild = process.env.NEXT_PHASE === "phase-production-build";

let clientId = getRegistration("clientId");
let useMcpOAuth = true;

if (!clientId) {
	if (isBuild) {
		clientId = "build-placeholder";
	} else {
		try {
			clientId = await registerMcpClient(REDIRECT_URI);
			setRegistration("clientId", clientId);
		} catch (e) {
			if (process.env.CLOUDFLARE_CLIENT_ID) {
				clientId = process.env.CLOUDFLARE_CLIENT_ID;
				useMcpOAuth = false;
				console.log(
					"[cloudflare-proxy] MCP dynamic registration failed, using manual CLOUDFLARE_CLIENT_ID."
				);
			} else {
				throw new Error(
					`MCP dynamic registration failed (${(e as Error).message}). ` +
						"For local dev, either set BETTER_AUTH_URL to an HTTPS URL (e.g. via cloudflared tunnel) " +
						"or provide CLOUDFLARE_CLIENT_ID and CLOUDFLARE_CLIENT_SECRET env vars."
				);
			}
		}
	}
}

const cloudflareSpec = isBuild
	? { paths: {} }
	: await fetch(CLOUDFLARE_OPENAPI_URL).then((r) => r.json());

interface OpenAPIOperation {
	description?: string;
	operationId?: string;
	parameters?: Array<{
		name: string;
		in: string;
		required?: boolean;
	}>;
	requestBody?: unknown;
	summary?: string;
}

interface OperationMeta {
	hasBody: boolean;
	method: string;
	path: string;
	pathParams: string[];
	queryParams: string[];
}

const opMap = new Map<string, OperationMeta>();
const spec = cloudflareSpec as {
	paths?: Record<string, Record<string, OpenAPIOperation>>;
};
for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
	for (const [method, op] of Object.entries(pathItem ?? {})) {
		if (
			!op?.operationId ||
			["parameters", "servers", "summary", "description"].includes(method)
		) {
			continue;
		}
		const params = op.parameters ?? [];
		opMap.set(op.operationId, {
			method: method.toUpperCase(),
			path,
			pathParams: params.filter((p) => p.in === "path").map((p) => p.name),
			queryParams: params.filter((p) => p.in === "query").map((p) => p.name),
			hasBody: !!op.requestBody,
		});
	}
}

const capabilities = fromOpenAPI(cloudflareSpec);

async function getMcpToken(
	userId: string,
	adapter: {
		findOne: (opts: {
			model: string;
			where: Array<{ field: string; value: string }>;
		}) => Promise<{ accessToken: string | null } | null>;
	}
) {
	const account = await adapter.findOne({
		model: "account",
		where: [
			{ field: "userId", value: userId },
			{ field: "providerId", value: "cloudflare" },
		],
	});
	if (!account?.accessToken) {
		throw new Error(
			"No Cloudflare MCP token found. User must sign in with Cloudflare first."
		);
	}
	return account.accessToken;
}

export const auth = betterAuth({
	database: db,
	plugins: [
		genericOAuth({
			config: [
				{
					providerId: "cloudflare",
					clientId,
					...(useMcpOAuth
						? {}
						: {
								clientSecret: process.env.CLOUDFLARE_CLIENT_SECRET,
							}),
					redirectURI: REDIRECT_URI,
					authorizationUrl: useMcpOAuth
						? `${MCP_BASE}/authorize`
						: "https://dash.cloudflare.com/oauth2/auth",
					tokenUrl: useMcpOAuth
						? `${MCP_BASE}/token`
						: "https://dash.cloudflare.com/oauth2/token",
					scopes: useMcpOAuth
						? [
								"user:read",
								"account:read",
								"offline_access",
								"workers:read",
								"workers:write",
								"workers_scripts:write",
								"workers_kv:write",
								"d1:write",
								"r2_catalog:write",
								"dns_records:read",
								"dns_records:edit",
								"zone:read",
								"pages:read",
								"pages:write",
							]
						: ["openid", "email", "profile", "offline_access"],
					pkce: true,
					prompt: "consent",
					getUserInfo: async (tokens) => {
						if (!tokens.accessToken) {
							throw new Error("No access token received from Cloudflare");
						}

						if (useMcpOAuth) {
							const result = await callMcpTool(tokens.accessToken, "execute", {
								code: `async () => {
										const response = await cloudflare.request({
											method: 'GET',
											path: '/user'
										});
										return response;
									}`,
							});

							const data = parseToolResult(result) as {
								result?: {
									id: string;
									email: string;
									first_name?: string;
									last_name?: string;
									username?: string;
								};
							};

							const user = data?.result;
							if (!user) {
								throw new Error(
									"Failed to fetch user info from Cloudflare MCP"
								);
							}

							return {
								id: user.id,
								email: user.email,
								name:
									[user.first_name, user.last_name].filter(Boolean).join(" ") ||
									user.username ||
									user.email,
								image: undefined,
								emailVerified: true,
							};
						}

						const response = await fetch(
							"https://api.cloudflare.com/client/v4/user",
							{
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
						const user = (
							data as {
								result: {
									id: string;
									email: string;
									first_name?: string;
									last_name?: string;
									username?: string;
								};
							}
						).result;

						return {
							id: user.id,
							email: user.email,
							name:
								[user.first_name, user.last_name].filter(Boolean).join(" ") ||
								user.username ||
								user.email,
							image: undefined,
							emailVerified: true,
						};
					},
				},
			],
		}),
		anonymous(),
		agentAuth({
			freshSessionWindow: () => {
				if (getSetting("freshSessionEnabled") !== "true") {
					return 0;
				}
				return Number.parseInt(getSetting("freshSessionWindow") ?? "300", 10);
			},
			capabilities,
			defaultHostCapabilities: capabilities
				.filter((c) => {
					const op = opMap.get(c.name);
					return op?.method === "GET";
				})
				.map((c) => c.name),
			async onExecute({ ctx, capability, arguments: args, agentSession }) {
				const token = await getMcpToken(
					agentSession.user.id,
					ctx.context.adapter
				);

				const op = opMap.get(capability);
				if (!op) {
					throw new Error(
						`No operation mapping for capability "${capability}".`
					);
				}

				let resolvedPath = op.path;
				const queryEntries: [string, unknown][] = [];
				const bodyEntries: [string, unknown][] = [];

				for (const [key, value] of Object.entries(args ?? {})) {
					if (op.pathParams.includes(key)) {
						resolvedPath = resolvedPath.replace(
							`{${key}}`,
							encodeURIComponent(String(value))
						);
					} else if (op.queryParams.includes(key)) {
						queryEntries.push([key, value]);
					} else if (op.hasBody) {
						bodyEntries.push([key, value]);
					}
				}

				const queryObj =
					queryEntries.length > 0
						? Object.fromEntries(queryEntries)
						: undefined;
				const bodyObj =
					bodyEntries.length > 0 ? Object.fromEntries(bodyEntries) : undefined;

				if (useMcpOAuth) {
					const codeParts = [
						"async () => {",
						"  const response = await cloudflare.request({",
						`    method: '${op.method}',`,
						`    path: '${resolvedPath}',`,
					];
					if (queryObj) {
						codeParts.push(`    query: ${JSON.stringify(queryObj)},`);
					}
					if (bodyObj && op.method !== "GET" && op.method !== "HEAD") {
						codeParts.push(`    body: ${JSON.stringify(bodyObj)},`);
					}
					codeParts.push("  });", "  return response;", "}");

					const result = await callMcpTool(token, "execute", {
						code: codeParts.join("\n"),
					});

					return parseToolResult(result);
				}

				let url = `https://api.cloudflare.com/client/v4${resolvedPath}`;
				if (queryObj) {
					const qs = new URLSearchParams(
						Object.entries(queryObj).map(([k, v]) => [k, String(v)])
					).toString();
					if (qs) {
						url += `?${qs}`;
					}
				}

				const fetchOpts: RequestInit = {
					method: op.method,
					headers: {
						Authorization: `Bearer ${token}`,
						"Content-Type": "application/json",
					},
				};

				if (bodyObj && op.method !== "GET" && op.method !== "HEAD") {
					fetchOpts.body = JSON.stringify(bodyObj);
				}

				const response = await fetch(url, fetchOpts);

				if (!response.ok) {
					const errorBody = await response.text();
					throw new Error(
						`Cloudflare API error ${response.status}: ${errorBody}`
					);
				}

				const contentType = response.headers.get("content-type");
				if (contentType?.includes("application/json")) {
					return response.json();
				}
				return response.text();
			},
			providerName: "Cloudflare",
			providerDescription:
				"Cloudflare is a global cloud platform providing CDN, DNS, DDoS protection, serverless compute (Workers), object storage (R2), and a suite of security and performance services for web applications.",
			modes: ["delegated"],
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
