import { headers } from "next/headers";
import { auth } from "@/lib/auth/auth";
import { createConnection, listConnectionsByOrg } from "@/lib/db/connections";

export async function GET(req: Request) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const url = new URL(req.url);
	const orgId = url.searchParams.get("orgId");

	if (!orgId) {
		return Response.json(
			{ error: "orgId query parameter is required" },
			{ status: 400 },
		);
	}

	const connections = await listConnectionsByOrg(orgId);
	const mcpConnections = connections.filter((c) => c.type === "mcp");

	return Response.json(
		mcpConnections.map((c) => ({
			id: c.id,
			orgId: c.orgId,
			name: c.name,
			displayName: c.displayName,
			transport: c.transport,
			mcpEndpoint: c.mcpEndpoint,
			credentialType: c.credentialType,
			status: c.status,
			createdAt: c.createdAt,
		})),
	);
}

export async function POST(req: Request) {
	const reqHeaders = await headers();
	const session = await auth.api.getSession({ headers: reqHeaders });
	if (!session?.user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const body = (await req.json()) as {
		type?: string;
		name?: string;
		displayName?: string;
		mcpEndpoint?: string;
		transport?: string;
		credentialType?: string;
		orgId?: string;
		specUrl?: string;
		baseUrl?: string;
		authMethod?: string;
	};

	if (!body.name || !body.orgId) {
		return Response.json(
			{ error: "name and orgId are required." },
			{ status: 400 },
		);
	}

	const canCreate = await auth.api.hasPermission({
		headers: reqHeaders,
		body: {
			permissions: { connection: ["create"] },
			organizationId: body.orgId,
		},
	});
	if (!canCreate?.success) {
		return Response.json(
			{ error: "Only admins can add connections." },
			{ status: 403 },
		);
	}

	const connectionType = body.type === "openapi" ? "openapi" : "mcp";

	if (connectionType === "mcp") {
		const transport = body.transport ?? "http";
		if (transport === "http" && !body.mcpEndpoint) {
			return Response.json(
				{ error: "mcpEndpoint is required for HTTP transport." },
				{ status: 400 },
			);
		}
	}

	if (connectionType === "openapi" && !body.specUrl) {
		return Response.json(
			{ error: "specUrl is required for OpenAPI connections." },
			{ status: 400 },
		);
	}

	try {
		const conn = await createConnection({
			orgId: body.orgId,
			name: body.name.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
			displayName: body.displayName || body.name,
			type: connectionType,
			transport: connectionType === "mcp" ? (body.transport ?? "http") : null,
			mcpEndpoint: connectionType === "mcp" ? (body.mcpEndpoint ?? null) : null,
			credentialType: body.credentialType ?? "none",
			specUrl: connectionType === "openapi" ? (body.specUrl ?? null) : null,
			baseUrl: connectionType === "openapi" ? (body.baseUrl ?? null) : null,
			authMethod:
				connectionType === "openapi" ? (body.authMethod ?? null) : null,
		});

		return Response.json(
			{
				id: conn.id,
				orgId: conn.orgId,
				name: conn.name,
				displayName: conn.displayName,
				type: conn.type,
				transport: conn.transport,
				mcpEndpoint: conn.mcpEndpoint,
				specUrl: conn.specUrl,
				baseUrl: conn.baseUrl,
				authMethod: conn.authMethod,
				credentialType: conn.credentialType,
				status: conn.status,
				createdAt: conn.createdAt,
			},
			{ status: 201 },
		);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		const isUnique = msg.includes("unique") || msg.includes("duplicate");
		return Response.json(
			{
				error: isUnique
					? "A connection with this name already exists in the organization."
					: msg,
			},
			{ status: isUnique ? 409 : 400 },
		);
	}
}
