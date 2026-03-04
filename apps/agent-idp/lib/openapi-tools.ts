import "server-only";

export type OpenAPITool = {
	name: string;
	description: string;
	method: string;
	path: string;
	parameters: object[];
	requestBody?: object;
	inputSchema: Record<string, unknown>;
};

const toolsCache = new Map<
	string,
	{ tools: OpenAPITool[]; fetchedAt: number }
>();
const CACHE_TTL = 60_000;

export async function listOpenAPITools(
	specUrl: string,
): Promise<OpenAPITool[]> {
	const cached = toolsCache.get(specUrl);
	if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
		return cached.tools;
	}

	const res = await fetch(specUrl);
	if (!res.ok) {
		throw new Error(`Failed to fetch OpenAPI spec: ${res.status}`);
	}

	const spec = (await res.json()) as {
		paths?: Record<string, Record<string, unknown>>;
		servers?: Array<{ url: string }>;
	};

	const tools: OpenAPITool[] = [];
	const paths = spec.paths ?? {};

	for (const [path, methods] of Object.entries(paths)) {
		for (const [method, operation] of Object.entries(methods)) {
			if (
				!["get", "post", "put", "patch", "delete"].includes(
					method.toLowerCase(),
				)
			) {
				continue;
			}

			const op = operation as {
				operationId?: string;
				summary?: string;
				description?: string;
				parameters?: object[];
				requestBody?: {
					content?: Record<string, { schema?: Record<string, unknown> }>;
				};
			};

			const name =
				op.operationId ?? `${method.toLowerCase()}_${slugifyPath(path)}`;
			const description = op.summary ?? op.description ?? "";
			const parameters = op.parameters ?? [];

			let requestBody: object | undefined;
			if (op.requestBody?.content) {
				const jsonContent = op.requestBody.content["application/json"];
				if (jsonContent?.schema) {
					requestBody = jsonContent.schema;
				}
			}

			const inputSchema = buildInputSchema(parameters, requestBody);

			tools.push({
				name,
				description,
				method: method.toUpperCase(),
				path,
				parameters,
				requestBody,
				inputSchema,
			});
		}
	}

	toolsCache.set(specUrl, { tools, fetchedAt: Date.now() });
	return tools;
}

export function extractBaseUrl(spec: {
	servers?: Array<{ url: string }>;
}): string {
	return spec.servers?.[0]?.url ?? "";
}

/**
 * Build a fully-qualified URL by substituting path parameters and appending
 * query parameters for GET requests.
 */
export function buildUrl(
	baseUrl: string,
	path: string,
	args: Record<string, unknown>,
	method: string,
): string {
	const remaining = { ...args };

	// Substitute path parameters
	let resolvedPath = path.replace(/\{([^}]+)\}/g, (_, param: string) => {
		const value = remaining[param];
		delete remaining[param];
		return encodeURIComponent(String(value ?? ""));
	});

	// For GET/DELETE, append remaining args as query params
	if (["GET", "DELETE"].includes(method.toUpperCase())) {
		const entries = Object.entries(remaining).filter(
			([, v]) => v !== undefined && v !== null,
		);
		if (entries.length > 0) {
			const qs = entries
				.map(
					([k, v]) =>
						`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`,
				)
				.join("&");
			resolvedPath += `?${qs}`;
		}
	}

	// Combine base and path, avoiding double slashes
	const base = baseUrl.replace(/\/+$/, "");
	return `${base}${resolvedPath}`;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function slugifyPath(path: string): string {
	return path
		.replace(/[{}]/g, "")
		.replace(/\//g, "_")
		.replace(/^_+|_+$/g, "")
		.replace(/_+/g, "_");
}

function buildInputSchema(
	parameters: object[],
	requestBody?: object,
): Record<string, unknown> {
	const properties: Record<string, unknown> = {};
	const required: string[] = [];

	for (const param of parameters) {
		const p = param as {
			name: string;
			in: string;
			required?: boolean;
			schema?: Record<string, unknown>;
			description?: string;
		};
		properties[p.name] = {
			...(p.schema ?? { type: "string" }),
			description: p.description,
		};
		if (p.required) {
			required.push(p.name);
		}
	}

	if (requestBody) {
		const body = requestBody as {
			properties?: Record<string, unknown>;
			required?: string[];
		};
		if (body.properties) {
			Object.assign(properties, body.properties);
		}
		if (body.required) {
			required.push(...body.required);
		}
	}

	return {
		type: "object",
		properties,
		...(required.length > 0 ? { required } : {}),
	};
}
