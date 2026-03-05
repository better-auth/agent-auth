import { headers } from "next/headers";
import {
	discoverAgentAuth,
	registerAgentWithProvider,
	serializeAgentAuthCredential,
} from "@/lib/agent-auth-proxy";
import { auth } from "@/lib/auth/auth";
import { createConnection } from "@/lib/db/connections";

/**
 * POST /api/connections/agent-auth
 *
 * Add an Agent Auth connection. If a session token for the remote provider
 * is included, the IDP registers an agent on the remote provider immediately.
 */
export async function POST(req: Request) {
	const reqHeaders = await headers();
	const session = await auth.api.getSession({ headers: reqHeaders });
	if (!session?.user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const body = (await req.json()) as {
		name?: string;
		displayName?: string;
		orgId?: string;
		providerUrl?: string;
		sessionToken?: string;
		scopes?: string[];
	};

	if (!body.orgId || !body.providerUrl) {
		return Response.json(
			{ error: "orgId and providerUrl are required." },
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

	const providerUrl = body.providerUrl.replace(/\/+$/, "");

	const discovery = await discoverAgentAuth(providerUrl);
	if (!discovery) {
		return Response.json(
			{
				error:
					"Could not discover agent auth configuration. Make sure the URL has a valid /.well-known/agent-configuration endpoint.",
			},
			{ status: 400 },
		);
	}

	const displayName =
		body.displayName || discovery.provider_name || "Agent Auth Provider";
	const name = (body.name || displayName)
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, "-")
		.replace(/-+/g, "-");

	let credentialMetadata: string | undefined;

	if (body.sessionToken) {
		try {
			const credential = await registerAgentWithProvider(
				providerUrl,
				body.sessionToken,
				`${displayName} (IDP Proxy)`,
				body.scopes ?? [],
			);
			credentialMetadata = serializeAgentAuthCredential(credential);
		} catch (err) {
			return Response.json(
				{
					error: `Failed to register with provider: ${err instanceof Error ? err.message : String(err)}`,
				},
				{ status: 502 },
			);
		}
	}

	try {
		const conn = await createConnection({
			orgId: body.orgId,
			name,
			displayName,
			type: "agent-auth",
			baseUrl: providerUrl,
			credentialType: credentialMetadata ? "agent-auth" : "none",
			transport: null,
			mcpEndpoint: null,
			specUrl: null,
			authMethod: null,
		});

		return Response.json(
			{
				id: conn.id,
				orgId: conn.orgId,
				name: conn.name,
				displayName: conn.displayName,
				type: conn.type,
				baseUrl: conn.baseUrl,
				status: conn.status,
				providerName: discovery.provider_name,
				providerDescription: discovery.provider_description,
				connected: !!credentialMetadata,
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
