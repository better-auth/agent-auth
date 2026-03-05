import { generateAgentKeypair } from "@auth/agents";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { auth } from "@/lib/auth/auth";
import { agentHost } from "@/lib/db/better-auth-schema";
import { db } from "@/lib/db/drizzle";
import { mcpHostKeypair } from "@/lib/db/schema";

export async function POST(request: Request) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const body = await request.json();
	const name = body.name;
	const scopes = body.scopes;

	if (!name || typeof name !== "string") {
		return NextResponse.json({ error: "Name is required" }, { status: 400 });
	}

	const keypair = await generateAgentKeypair();

	const publicKeyJwk = {
		...keypair.publicKey,
		kid: keypair.kid,
	};

	const createRes = await auth.api.createHost({
		headers: await headers(),
		body: {
			name,
			publicKey: publicKeyJwk,
			scopes: scopes ?? [],
		},
	});

	const hostId = (createRes as Record<string, unknown>).hostId as
		| string
		| undefined;

	if (!hostId) {
		return NextResponse.json(
			{ error: "Failed to create host" },
			{ status: 500 },
		);
	}

	await db
		.insert(mcpHostKeypair)
		.values({
			appUrl: `host:${hostId}`,
			hostId,
			keypair: {
				privateKey: keypair.privateKey as unknown as Record<string, unknown>,
				publicKey: keypair.publicKey as unknown as Record<string, unknown>,
				kid: keypair.kid,
			},
		})
		.onConflictDoUpdate({
			target: mcpHostKeypair.appUrl,
			set: {
				hostId,
				keypair: {
					privateKey: keypair.privateKey as unknown as Record<string, unknown>,
					publicKey: keypair.publicKey as unknown as Record<string, unknown>,
					kid: keypair.kid,
				},
			},
		});

	const [host] = await db
		.select({ status: agentHost.status })
		.from(agentHost)
		.where(eq(agentHost.id, hostId))
		.limit(1);

	audit.log({
		eventType: "host.remote_created",
		orgId: "",
		actorId: session.user.id,
		hostId,
		metadata: { name, scopes },
	});

	return NextResponse.json({
		hostId,
		status: host?.status ?? "active",
	});
}
