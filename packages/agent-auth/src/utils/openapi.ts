import type { Capability, HttpInvokeDescriptor } from "../types";

interface OpenAPIOperation {
	operationId?: string;
	summary?: string;
	description?: string;
	parameters?: Array<{
		name: string;
		in: string;
		required?: boolean;
		schema?: Record<string, unknown>;
		description?: string;
	}>;
	requestBody?: {
		required?: boolean;
		description?: string;
		content?: Record<string, { schema?: Record<string, unknown> }>;
	};
}

interface OpenAPIPathItem {
	[method: string]: OpenAPIOperation | undefined;
}

interface OpenAPISpec {
	servers?: Array<{ url: string }>;
	paths?: Record<string, OpenAPIPathItem>;
}

/**
 * Convert an OpenAPI 3.x spec into `Capability[]` with HTTP invoke
 * descriptors (§4.2).
 *
 * Each operation with an `operationId` becomes a capability whose
 * `id` is the `operationId` and whose `invoke` is a standard HTTP
 * descriptor.
 */
export function fromOpenAPI(
	spec: OpenAPISpec,
	baseUrl?: string,
): Capability[] {
	const capabilities: Capability[] = [];
	const serverBase =
		baseUrl ?? spec.servers?.[0]?.url ?? "";

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

			const invoke: HttpInvokeDescriptor = {
				type: "http",
				method: method.toUpperCase(),
				url: `${serverBase}${path}`,
			};

			if (op.parameters?.length) {
				invoke.input = {
					parameters: op.parameters.map((p) => ({
						name: p.name,
						in: p.in as "path" | "query" | "header",
						required: p.required,
						schema: p.schema,
						description: p.description,
					})),
				};
			}

			if (op.requestBody) {
				invoke.input = {
					...invoke.input,
					requestBody: {
						required: op.requestBody.required,
						description: op.requestBody.description,
						content: op.requestBody.content,
					},
				};
			}

			capabilities.push({
				id: op.operationId,
				title: op.summary ?? op.operationId,
				description:
					op.description ?? op.summary ?? op.operationId,
				invoke,
			});
		}
	}

	return capabilities;
}
