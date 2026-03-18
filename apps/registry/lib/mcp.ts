import {
	AgentAuthClient,
	getAgentAuthTools,
	filterTools,
	type AgentAuthTool,
	type ToolParameters,
} from "@auth/agent";
import { createUserStorage } from "./storage";
import { sql } from "./db";
import type { z, ZodRawShape, ZodTypeAny } from "zod";

const clientCache = new Map<string, AgentAuthClient>();

interface PendingApproval {
	verificationUri: string;
	verificationUriComplete?: string;
	userCode?: string;
	expiresIn: number;
}

const pendingApprovals = new Map<string, PendingApproval>();

const APPROVAL_TIMEOUT_MS = 500;

export function getClientForUser(userId: string): AgentAuthClient {
	let client = clientCache.get(userId);
	if (client) return client;

	const storage = createUserStorage(sql, userId);

	client = new AgentAuthClient({
		storage,
		registryUrl: process.env.AGENT_AUTH_REGISTRY_URL ?? "https://agent-auth.directory",
		allowDirectDiscovery: true,
		hostName: process.env.AGENT_AUTH_HOST_NAME ?? "Agent Auth Registry",
		approvalTimeoutMs: APPROVAL_TIMEOUT_MS,
		onApprovalRequired(info) {
			pendingApprovals.set(userId, {
				verificationUri: info.verification_uri ?? "",
				verificationUriComplete: info.verification_uri_complete,
				userCode: info.user_code,
				expiresIn: info.expires_in,
			});
		},
	});

	clientCache.set(userId, client);
	return client;
}

/**
 * Return wrapped Agent Auth tools where connect_agent and
 * request_capability handle the approval timeout gracefully.
 *
 * When approval is needed the SDK times out quickly (500ms)
 * and we return the approval URL as a tool result so the AI
 * can present it to the user across all MCP clients.
 */
const ADMIN_TOOLS = [
	"rotate_host_key",
	"rotate_agent_key",
	"enroll_host",
];

export function getToolsForUser(userId: string): AgentAuthTool[] {
	const client = getClientForUser(userId);
	const tools = filterTools(getAgentAuthTools(client), { exclude: ADMIN_TOOLS });

	return tools.map((tool) => {
		if (tool.name !== "connect_agent" && tool.name !== "request_capability") {
			return tool;
		}

		return {
			...tool,
			async execute(
				args: Record<string, unknown>,
				context?: { signal?: AbortSignal },
			) {
				try {
					return await tool.execute(args, context);
				} catch (err: unknown) {
					const pending = pendingApprovals.get(userId);
					const isTimeout =
						err &&
						typeof err === "object" &&
						"code" in err &&
						(err as { code: string }).code === "approval_timeout";

					if (isTimeout && pending) {
						pendingApprovals.delete(userId);
						const uri =
							pending.verificationUriComplete || pending.verificationUri;
						const codeNote = pending.userCode
							? `\nVerification code: ${pending.userCode}`
							: "";
						const agentId =
							err &&
							typeof err === "object" &&
							"agentId" in err
								? (err as { agentId: string }).agentId
								: undefined;

						return {
							status: "approval_required",
							approval_url: uri,
							...(agentId ? { agent_id: agentId } : {}),
							message:
								`User approval is required. Please open the following URL to approve access:` +
								`\n\n${uri}${codeNote}` +
								`\n\nAfter approving, retry this tool call.` +
								(agentId ? ` Use agent_id: ${agentId}` : ""),
						};
					}
					throw err;
				}
			},
		};
	});
}

// ── JSON Schema → Zod conversion ──────────────────────────────

interface PropertyDescriptor {
	type?: string;
	items?: PropertyDescriptor & { oneOf?: PropertyDescriptor[] };
	enum?: [string, ...string[]];
	description?: string;
	properties?: Record<string, PropertyDescriptor>;
	required?: string[];
	oneOf?: PropertyDescriptor[];
}

function propToZod(prop: PropertyDescriptor, zod: typeof z): ZodTypeAny {
	if (prop.oneOf && prop.oneOf.length >= 2) {
		const [a, b, ...rest] = prop.oneOf.map((p) => propToZod(p, zod));
		return zod.union([a, b, ...rest] as [ZodTypeAny, ZodTypeAny, ...ZodTypeAny[]]);
	}

	if (prop.type === "array") {
		const items = prop.items;
		if (items?.oneOf) {
			return zod.array(propToZod(items, zod));
		}
		return zod.array(items?.type === "string" ? zod.string() : zod.unknown());
	}

	if (prop.enum) {
		return zod.enum(prop.enum);
	}

	if (prop.type === "object" && prop.properties) {
		const shape: ZodRawShape = {};
		const req = new Set(prop.required ?? []);
		for (const [k, v] of Object.entries(prop.properties)) {
			let s = propToZod(v, zod);
			if (v.description) s = s.describe(v.description);
			shape[k] = req.has(k) ? s : s.optional();
		}
		return zod.object(shape);
	}

	switch (prop.type) {
		case "string":
			return zod.string();
		case "number":
			return zod.number();
		case "boolean":
			return zod.boolean();
		case "object":
			return zod.record(zod.string(), zod.unknown());
		default:
			return zod.unknown();
	}
}

export function jsonSchemaToZod(
	params: ToolParameters,
	zod: typeof z,
): ZodRawShape | undefined {
	const { properties, required } = params;
	const entries = Object.entries(properties);
	if (entries.length === 0) return undefined;

	const shape: ZodRawShape = {};
	const requiredSet = new Set(required ?? []);

	for (const [key, value] of entries) {
		const prop = value as PropertyDescriptor;
		let schema = propToZod(prop, zod);
		if (prop.description) schema = schema.describe(prop.description);
		shape[key] = requiredSet.has(key) ? schema : schema.optional();
	}

	return shape;
}
