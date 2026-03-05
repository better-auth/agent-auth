import type {
	AgentCapability,
	HttpCapabilityParameter,
	HttpCapabilityRequestBody,
} from "./types";

interface OpenAPIParameter {
	name: string;
	in: "path" | "query" | "header" | "cookie";
	required?: boolean;
	description?: string;
	schema?: Record<string, unknown>;
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
	[key: string]: unknown;
}

interface OpenAPIPathItem {
	get?: OpenAPIOperation;
	post?: OpenAPIOperation;
	put?: OpenAPIOperation;
	delete?: OpenAPIOperation;
	patch?: OpenAPIOperation;
	parameters?: OpenAPIParameter[];
	[key: string]: unknown;
}

interface OpenAPISpec {
	openapi?: string;
	info?: { title?: string; version?: string };
	servers?: Array<{ url: string }>;
	paths?: Record<string, OpenAPIPathItem>;
	[key: string]: unknown;
}

export interface FromOpenAPIOptions {
	/**
	 * The OpenAPI 3.x spec as a parsed object.
	 * Pass the result of `JSON.parse(specJson)` or import it directly.
	 */
	spec: OpenAPISpec;
	/**
	 * Base URL to prepend to path templates.
	 * If omitted, uses the first `servers[].url` from the spec.
	 */
	baseUrl?: string;
	/**
	 * Filter operations by operationId. Only matching operations
	 * are included. When omitted, all operations are converted.
	 */
	include?: string[];
	/**
	 * Exclude operations by operationId. Applied after `include`.
	 */
	exclude?: string[];
	/**
	 * Map an operationId to a capability name.
	 * When omitted, the operationId is used as-is.
	 */
	nameMap?: Record<string, string>;
}

const HTTP_METHODS = ["get", "post", "put", "delete", "patch"] as const;

function generateName(method: string, path: string): string {
	const parts = path
		.replace(/\{[^}]+\}/g, "")
		.split("/")
		.filter(Boolean);
	const resource = parts[parts.length - 1] ?? "resource";
	const prefixes: Record<string, string> = {
		get: "get",
		post: "create",
		put: "update",
		delete: "delete",
		patch: "update",
	};
	const prefix = prefixes[method] ?? method;
	return `${prefix}_${resource}`;
}

/**
 * Convert an OpenAPI 3.x spec into an array of `AgentCapability` definitions.
 *
 * Each path + method pair becomes one capability with the `http` block
 * populated from the spec's parameters, requestBody, and operationId.
 *
 * @example
 * ```ts
 * import spec from "./openapi.json";
 * import { fromOpenAPI } from "@better-auth/agent-auth/openapi";
 *
 * agentAuth({
 *   capabilities: fromOpenAPI({ spec, baseUrl: "http://localhost:4100" }),
 * })
 * ```
 */
export function fromOpenAPI(options: FromOpenAPIOptions): AgentCapability[] {
	const { spec, include, exclude, nameMap } = options;
	const paths = spec.paths ?? {};

	const baseUrl =
		options.baseUrl?.replace(/\/+$/, "") ??
		spec.servers?.[0]?.url?.replace(/\/+$/, "") ??
		"";

	const capabilities: AgentCapability[] = [];

	for (const [path, pathItem] of Object.entries(paths)) {
		const pathLevelParams = (pathItem as OpenAPIPathItem).parameters ?? [];

		for (const method of HTTP_METHODS) {
			const operation = (pathItem as OpenAPIPathItem)[method];
			if (!operation) continue;

			const opId = operation.operationId;

			if (include && include.length > 0) {
				if (!opId || !include.includes(opId)) continue;
			}
			if (exclude && exclude.length > 0) {
				if (opId && exclude.includes(opId)) continue;
			}

			const name = nameMap?.[opId ?? ""] ?? opId ?? generateName(method, path);
			const description =
				operation.summary ?? operation.description ?? `${method.toUpperCase()} ${path}`;

			const allParams = [
				...pathLevelParams,
				...(operation.parameters ?? []),
			];

			const parameters: HttpCapabilityParameter[] = allParams
				.filter((p) => p.in !== "cookie")
				.map((p) => ({
					name: p.name,
					in: p.in as "path" | "query" | "header",
					required: p.required,
					schema: p.schema,
					description: p.description,
				}));

			let requestBody: HttpCapabilityRequestBody | undefined;
			if (operation.requestBody) {
				requestBody = {
					required: operation.requestBody.required,
					content: operation.requestBody.content,
				};
			}

			capabilities.push({
				name,
				description,
				type: "http",
				http: {
					method: method.toUpperCase(),
					url: `${baseUrl}${path}`,
					operationId: opId,
					...(parameters.length > 0 ? { parameters } : {}),
					...(requestBody ? { requestBody } : {}),
				},
			});
		}
	}

	return capabilities;
}
