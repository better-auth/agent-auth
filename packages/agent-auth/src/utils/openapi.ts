import type { AgentAuthOptions, Capability } from "../types";

interface OpenAPIParameter {
	name: string;
	in: string;
	required?: boolean;
	schema?: Record<string, unknown>;
	description?: string;
}

interface OpenAPIRequestBody {
	required?: boolean;
	description?: string;
	content?: Record<string, { schema?: Record<string, unknown> }>;
}

interface OpenAPIOperation {
	operationId?: string;
	summary?: string;
	description?: string;
	parameters?: OpenAPIParameter[];
	requestBody?: OpenAPIRequestBody;
}

interface OpenAPIPathItem {
	[method: string]: OpenAPIOperation | undefined;
}

interface OpenAPISpec {
	servers?: Array<{ url: string }>;
	paths?: Record<string, OpenAPIPathItem>;
}

/** Internal representation of a resolved OpenAPI operation. */
interface ResolvedOperation {
	method: string;
	url: string;
	parameters: OpenAPIParameter[];
	requestBody?: OpenAPIRequestBody;
}

/**
 * Build a top-level `input` JSON Schema from OpenAPI parameters
 * and request body. This describes the `arguments` shape accepted
 * by `POST /capability/execute` (§6.11).
 */
function buildInputSchema(
	op: OpenAPIOperation,
): Record<string, unknown> | undefined {
	const properties: Record<string, unknown> = {};
	const required: string[] = [];

	if (op.parameters?.length) {
		for (const p of op.parameters) {
			const desc = p.description ?? (p.schema as Record<string, unknown>)?.description as string | undefined;
			const resolvedDesc = p.required
				? `(required) ${desc ?? p.name}`
				: desc;
			properties[p.name] = {
				...(p.schema ?? { type: "string" }),
				...(resolvedDesc ? { description: resolvedDesc } : {}),
			};
			if (p.required) required.push(p.name);
		}
	}

	if (op.requestBody) {
		const jsonContent = op.requestBody.content?.["application/json"];
		if (jsonContent?.schema) {
			const bodySchema = jsonContent.schema as Record<string, unknown>;
			const bodyProps =
				(bodySchema.properties as Record<string, unknown>) ?? {};
			const bodyRequired = (bodySchema.required as string[]) ?? [];

			for (const [key, val] of Object.entries(bodyProps)) {
				const prop = val as Record<string, unknown>;
				const isRequired = bodyRequired.includes(key);
				properties[key] = {
					...prop,
					...(isRequired
						? { description: `(required) ${(prop.description as string) ?? key}` }
						: {}),
				};
			}
			for (const r of bodyRequired) {
				if (!required.includes(r)) required.push(r);
			}
		}
	}

	if (Object.keys(properties).length === 0) return undefined;

	return {
		type: "object",
		properties,
		...(required.length > 0 ? { required } : {}),
	};
}

/** Build a map from operationId → resolved operation metadata. */
function buildOperationMap(
	spec: OpenAPISpec,
	baseUrl: string,
): Map<string, ResolvedOperation> {
	const map = new Map<string, ResolvedOperation>();

	for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
		if (!pathItem) continue;

		for (const [method, operation] of Object.entries(pathItem)) {
			if (
				!operation ||
				method === "parameters" ||
				method === "servers" ||
				method === "summary" ||
				method === "description"
			) {
				continue;
			}

			const op = operation as OpenAPIOperation;
			if (!op.operationId) continue;

			map.set(op.operationId, {
				method: method.toUpperCase(),
				url: `${baseUrl}${path}`,
				parameters: op.parameters ?? [],
				requestBody: op.requestBody,
			});
		}
	}

	return map;
}

/**
 * Convert an OpenAPI 3.x spec into `Capability[]`.
 *
 * Each operation with an `operationId` becomes a capability whose
 * `name` is the `operationId` and whose `input` is a JSON Schema
 * derived from the operation's parameters and request body.
 */
export function fromOpenAPI(spec: OpenAPISpec): Capability[] {
	const capabilities: Capability[] = [];

	for (const [_path, pathItem] of Object.entries(spec.paths ?? {})) {
		if (!pathItem) continue;

		for (const [method, operation] of Object.entries(pathItem)) {
			if (
				!operation ||
				method === "parameters" ||
				method === "servers" ||
				method === "summary" ||
				method === "description"
			) {
				continue;
			}

			const op = operation as OpenAPIOperation;
			if (!op.operationId) continue;

			const input = buildInputSchema(op);

			capabilities.push({
				name: op.operationId,
				description:
					op.description ?? op.summary ?? op.operationId,
				...(input ? { input } : {}),
			});
		}
	}

	return capabilities;
}

/**
 * Create an `onExecute` handler that proxies capability calls to an
 * HTTP API described by an OpenAPI spec.
 *
 * The handler maps `capability` to the matching OpenAPI operation,
 * substitutes path/query/header parameters from `arguments`, sends
 * remaining arguments as a JSON body, and returns the response.
 *
 * @example
 * ```ts
 * const spec = await fetch(openApiUrl).then(r => r.json());
 *
 * agentAuth({
 *   capabilities: fromOpenAPI(spec),
 *   onExecute: createOpenAPIHandler(spec, {
 *     baseUrl: "https://api.example.com",
 *     async resolveHeaders({ agentSession, ctx }) {
 *       const token = await getAccessToken(agentSession.user.id);
 *       return { Authorization: `Bearer ${token}` };
 *     },
 *   }),
 * });
 * ```
 */
export function createOpenAPIHandler(
	spec: OpenAPISpec,
	opts: {
		baseUrl: string;
		resolveHeaders?: (context: {
			ctx: Parameters<NonNullable<AgentAuthOptions["onExecute"]>>[0]["ctx"];
			capability: string;
			agentSession: Parameters<NonNullable<AgentAuthOptions["onExecute"]>>[0]["agentSession"];
		}) => Record<string, string> | Promise<Record<string, string>>;
		fetch?: typeof globalThis.fetch;
	},
): NonNullable<AgentAuthOptions["onExecute"]> {
	const opMap = buildOperationMap(spec, opts.baseUrl);
	const fetchFn = opts.fetch ?? globalThis.fetch;

	return async ({ ctx, capability, arguments: args, agentSession }) => {
		const op = opMap.get(capability);
		if (!op) {
			throw new Error(
				`No OpenAPI operation found for capability "${capability}".`,
			);
		}

		let url = op.url;
		const queryParams = new URLSearchParams();
		const headers: Record<string, string> = {
			"content-type": "application/json",
		};

		if (opts.resolveHeaders) {
			const extra = await opts.resolveHeaders({
				ctx,
				capability,
				agentSession,
			});
			Object.assign(headers, extra);
		}

		const consumed = new Set<string>();

		for (const param of op.parameters) {
			const value = args?.[param.name];
			if (value === undefined) continue;
			consumed.add(param.name);

			switch (param.in) {
				case "path":
					url = url.replace(
						`{${param.name}}`,
						encodeURIComponent(String(value)),
					);
					break;
				case "query":
					queryParams.set(param.name, String(value));
					break;
				case "header":
					headers[param.name] = String(value);
					break;
			}
		}

		const qs = queryParams.toString();
		if (qs) {
			url += (url.includes("?") ? "&" : "?") + qs;
		}

		const fetchOpts: RequestInit = { method: op.method, headers };

		if (
			op.requestBody &&
			op.method !== "GET" &&
			op.method !== "HEAD"
		) {
			const bodyArgs: Record<string, unknown> = {};
			if (args) {
				for (const [key, val] of Object.entries(args)) {
					if (!consumed.has(key)) bodyArgs[key] = val;
				}
			}
			if (Object.keys(bodyArgs).length > 0) {
				fetchOpts.body = JSON.stringify(bodyArgs);
			}
		}

		const response = await fetchFn(url, fetchOpts);

		if (!response.ok) {
			const errorBody = await response.text();
			throw new Error(
				`Upstream API error ${response.status}: ${errorBody}`,
			);
		}

		const contentType = response.headers.get("content-type");
		if (contentType?.includes("application/json")) {
			return response.json();
		}
		return response.text();
	};
}
