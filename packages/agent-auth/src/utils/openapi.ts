import type {
	AgentAuthOptions,
	ApprovalStrength,
	Capability,
	DefaultHostCapabilitiesContext,
} from "../types";
import { asyncResult, streamResult } from "../execute-helpers";

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
	info?: {
		title?: string;
		description?: string;
		version?: string;
	};
	servers?: Array<{ url: string }>;
	paths?: Record<string, OpenAPIPathItem>;
	components?: Record<string, unknown>;
}

/** Resolve a JSON Reference (`$ref`) against the spec root. */
function deref<T>(spec: OpenAPISpec, node: T): T {
	if (node && typeof node === "object" && "$ref" in node) {
		const ref = (node as Record<string, unknown>).$ref;
		if (typeof ref === "string" && ref.startsWith("#/")) {
			let resolved: unknown = spec;
			for (const part of ref.slice(2).split("/")) {
				resolved = (resolved as Record<string, unknown>)?.[part];
			}
			if (resolved != null) return resolved as T;
		}
	}
	return node;
}

/** Merge path-level and operation-level parameters, resolving any $refs. */
function mergeParams(
	spec: OpenAPISpec,
	pathItem: OpenAPIPathItem,
	op: OpenAPIOperation,
): OpenAPIParameter[] {
	const pathParams = ((pathItem as Record<string, unknown>).parameters as
		| OpenAPIParameter[]
		| undefined) ?? [];
	const opParams = op.parameters ?? [];
	const merged = new Map<string, OpenAPIParameter>();
	for (const p of pathParams) {
		const resolved = deref(spec, p);
		if (resolved?.name) merged.set(`${resolved.in}:${resolved.name}`, resolved);
	}
	for (const p of opParams) {
		const resolved = deref(spec, p);
		if (resolved?.name) merged.set(`${resolved.in}:${resolved.name}`, resolved);
	}
	return [...merged.values()];
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
	spec: OpenAPISpec,
	parameters: OpenAPIParameter[],
	requestBody?: OpenAPIRequestBody,
): Record<string, unknown> | undefined {
	const properties: Record<string, unknown> = {};
	const required: string[] = [];

	for (const p of parameters) {
		properties[p.name] = {
			...(p.schema ?? { type: "string" }),
			...(p.description ? { description: p.description } : {}),
		};
		if (p.required) required.push(p.name);
	}

	if (requestBody) {
		const jsonContent = requestBody.content?.["application/json"];
		if (jsonContent?.schema) {
			const bodySchema = deref(spec, jsonContent.schema) as Record<
				string,
				unknown
			>;
			const bodyProps =
				(bodySchema.properties as Record<string, unknown>) ?? {};
			const bodyRequired = (bodySchema.required as string[]) ?? [];

			for (const [key, val] of Object.entries(bodyProps)) {
				properties[key] = val;
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

			const parameters = mergeParams(spec, pathItem, op);
			const requestBody = deref(spec, op.requestBody);

			map.set(op.operationId, {
				method: method.toUpperCase(),
				url: `${baseUrl}${path}`,
				parameters,
				requestBody,
			});
		}
	}

	return map;
}

interface ParsedCapability extends Capability {
	/** The HTTP method this capability was derived from. */
	_method?: string;
}

function parseOpenAPICapabilities(spec: OpenAPISpec): ParsedCapability[] {
	const capabilities: ParsedCapability[] = [];

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

			const parameters = mergeParams(spec, pathItem, op);
			const requestBody = deref(spec, op.requestBody);
			const input = buildInputSchema(spec, parameters, requestBody);

			capabilities.push({
				name: op.operationId,
				description:
					op.description ?? op.summary ?? op.operationId,
				...(input ? { input } : {}),
				_method: method.toUpperCase(),
			});
		}
	}

	return capabilities;
}

/**
 * Convert an OpenAPI 3.x spec into `Capability[]`.
 *
 * Each operation with an `operationId` becomes a capability whose
 * `name` is the `operationId` and whose `input` is a JSON Schema
 * derived from the operation's parameters and request body.
 */
export function fromOpenAPI(spec: OpenAPISpec): Capability[] {
	return parseOpenAPICapabilities(spec).map(({ _method, ...cap }) => cap);
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

		if (!response.ok && response.status !== 202) {
			const errorBody = await response.text();
			throw new Error(
				`Upstream API error ${response.status}: ${errorBody}`,
			);
		}

		if (response.status === 202) {
			const body = await response.json() as Record<string, unknown>;
			const statusUrl =
				(body.status_url as string | undefined) ??
				response.headers.get("location") ??
				"";
			const retryAfter = response.headers.get("retry-after");
			return asyncResult(
				statusUrl,
				retryAfter ? parseInt(retryAfter, 10) : undefined,
			);
		}

		const contentType = response.headers.get("content-type");

		if (
			contentType?.includes("text/event-stream") &&
			response.body
		) {
			return streamResult(response.body);
		}

		if (contentType?.includes("application/json")) {
			return response.json();
		}
		return response.text();
	};
}

interface OpenAPICapabilityInfo {
	/** The capability name (operationId). */
	name: string;
	/** The HTTP method this operation uses (uppercase). */
	method: string;
	/** The capability description. */
	description: string;
}

/**
 * Filter for selecting which capabilities become default host capabilities.
 *
 * - `true` — all capabilities.
 * - `false` / `undefined` — none (default).
 * - `string` — a single HTTP method, e.g. `"GET"`.
 * - `string[]` — multiple HTTP methods, e.g. `["GET", "HEAD"]`.
 * - `(cap, context) => boolean` — callback with full runtime context
 *   (endpoint context, userId, hostId, mode) for dynamic filtering.
 */
type DefaultHostCapabilitiesFilter =
	| boolean
	| string
	| string[]
	| ((
			capability: OpenAPICapabilityInfo,
			context: DefaultHostCapabilitiesContext,
	  ) => boolean | Promise<boolean>);

/**
 * Filter for assigning `approvalStrength` to capabilities from an OpenAPI spec.
 *
 * - `ApprovalStrength` — apply to all capabilities.
 * - `Record<string, ApprovalStrength>` — map HTTP method → strength
 *   (e.g. `{ GET: "session", POST: "webauthn", DELETE: "webauthn" }`).
 * - `(cap) => ApprovalStrength` — per-capability callback.
 */
type ApprovalStrengthFilter =
	| ApprovalStrength
	| Record<string, ApprovalStrength>
	| ((capability: OpenAPICapabilityInfo) => ApprovalStrength);

type CreateFromOpenAPIOptions = {
	baseUrl: string;
	resolveHeaders?: (context: {
		ctx: Parameters<NonNullable<AgentAuthOptions["onExecute"]>>[0]["ctx"];
		capability: string;
		agentSession: Parameters<
			NonNullable<AgentAuthOptions["onExecute"]>
		>[0]["agentSession"];
	}) => Record<string, string> | Promise<Record<string, string>>;
	fetch?: typeof globalThis.fetch;
	/**
	 * Automatically populate `defaultHostCapabilities` from the spec.
	 *
	 * - `true` — every operation becomes a default host capability.
	 * - `false` / `undefined` — no default host capabilities (default).
	 * - `"GET"` — all GET operations (or any other HTTP method string).
	 * - `["GET", "HEAD"]` — all operations matching any of the listed methods.
	 * - `(cap, context) => boolean` — callback receiving the capability info
	 *   **and** the full runtime context (`ctx`, `userId`, `hostId`, `mode`,
	 *   `hostName`) for dynamic per-request filtering.
	 *
	 * @example
	 * ```ts
	 * // All read-only endpoints
	 * defaultHostCapabilities: ["GET", "HEAD"]
	 *
	 * // Dynamic filter based on user / host context
	 * defaultHostCapabilities: (cap, { userId }) =>
	 *   cap.method === "GET" || userId !== null
	 * ```
	 */
	defaultHostCapabilities?: DefaultHostCapabilitiesFilter;
	/**
	 * Assign `approvalStrength` to capabilities derived from the spec (§8.11).
	 *
	 * Controls which capabilities require proof of physical presence
	 * (WebAuthn) versus a standard session-based approval.
	 *
	 * @example
	 * ```ts
	 * // All mutating methods require WebAuthn
	 * approvalStrength: { GET: "session", POST: "webauthn", DELETE: "webauthn" }
	 *
	 * // Everything requires WebAuthn
	 * approvalStrength: "webauthn"
	 *
	 * // Per-capability callback
	 * approvalStrength: (cap) =>
	 *   cap.method === "DELETE" ? "webauthn" : "session"
	 * ```
	 */
	approvalStrength?: ApprovalStrengthFilter;
};

/** Resolve `approvalStrength` for a single parsed capability. */
function resolveApprovalStrength(
	cap: ParsedCapability,
	filter: ApprovalStrengthFilter | undefined,
): ApprovalStrength | undefined {
	if (filter === undefined) return undefined;
	if (typeof filter === "string") return filter;
	if (typeof filter === "function") {
		return filter({
			name: cap.name,
			method: cap._method ?? "GET",
			description: cap.description,
		});
	}
	return filter[cap._method ?? "GET"];
}

/**
 * Resolve the `defaultHostCapabilities` value to pass to the plugin.
 *
 * Static filters (boolean, string, string[]) are resolved once at init time
 * and returned as `string[]`. Callback filters are wrapped into the
 * `(context) => string[]` function form so they receive full runtime context.
 */
function resolveDefaultHostCaps(
	parsed: ParsedCapability[],
	filter: DefaultHostCapabilitiesFilter | undefined,
): AgentAuthOptions["defaultHostCapabilities"] | undefined {
	if (filter === undefined || filter === false) return undefined;
	if (filter === true) return parsed.map((c) => c.name);

	if (typeof filter === "function") {
		const capInfos: Array<OpenAPICapabilityInfo & { _name: string }> =
			parsed.map((c) => ({
				name: c.name,
				method: c._method ?? "GET",
				description: c.description,
				_name: c.name,
			}));

		return async (context: DefaultHostCapabilitiesContext) => {
			const results = await Promise.all(
				capInfos.map(async (info) => ({
					name: info._name,
					include: await filter(
						{ name: info.name, method: info.method, description: info.description },
						context,
					),
				})),
			);
			return results.filter((r) => r.include).map((r) => r.name);
		};
	}

	const methods = new Set(
		(Array.isArray(filter) ? filter : [filter]).map((m) => m.toUpperCase()),
	);
	return parsed.filter((c) => methods.has(c._method ?? "")).map((c) => c.name);
}

/**
 * Create agent-auth options from an OpenAPI 3.x spec.
 *
 * Returns an object you can spread directly into `agentAuth({ ... })`:
 * - `providerName` — from `info.title` in the spec
 * - `providerDescription` — from `info.description` in the spec
 * - `capabilities` — derived from every operation with an `operationId`
 * - `onExecute` — proxies capability calls to the upstream API
 * - `defaultHostCapabilities` — (optional) auto-granted caps for
 *   newly created hosts, based on the `defaultHostCapabilities` filter
 *
 * @example
 * ```ts
 * const spec = await fetch(openApiUrl).then(r => r.json());
 *
 * agentAuth({
 *   ...createFromOpenAPI(spec, {
 *     baseUrl: "https://api.example.com",
 *     defaultHostCapabilities: ["GET", "HEAD"],
 *     async resolveHeaders({ agentSession, ctx }) {
 *       const token = await getAccessToken(agentSession.user.id);
 *       return { Authorization: `Bearer ${token}` };
 *     },
 *   }),
 * });
 * ```
 */
export function createFromOpenAPI(
	spec: OpenAPISpec,
	opts: CreateFromOpenAPIOptions,
): Pick<
	AgentAuthOptions,
	| "providerName"
	| "providerDescription"
	| "capabilities"
	| "onExecute"
	| "defaultHostCapabilities"
> {
	const parsed = parseOpenAPICapabilities(spec);
	const capabilities: Capability[] = parsed.map(
		({ _method, ...cap }) => {
			const strength = resolveApprovalStrength(
				{ ...cap, _method },
				opts.approvalStrength,
			);
			if (strength) cap.approvalStrength = strength;
			return cap;
		},
	);

	const onExecute = createOpenAPIHandler(spec, {
		baseUrl: opts.baseUrl,
		resolveHeaders: opts.resolveHeaders,
		fetch: opts.fetch,
	});

	const defaultHostCapabilities = resolveDefaultHostCaps(
		parsed,
		opts.defaultHostCapabilities,
	);

	return {
		...(spec.info?.title ? { providerName: spec.info.title } : {}),
		...(spec.info?.description
			? { providerDescription: spec.info.description }
			: {}),
		capabilities,
		onExecute,
		...(defaultHostCapabilities !== undefined
			? { defaultHostCapabilities }
			: {}),
	};
}
