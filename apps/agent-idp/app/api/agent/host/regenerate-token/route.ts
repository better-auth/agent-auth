import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { agentHost } from "@/lib/db/better-auth-schema";
import { db } from "@/lib/db/drizzle";

const ENROLLMENT_TOKEN_TTL = 3600;

async function generateEnrollmentToken(): Promise<{
	plaintext: string;
	hash: string;
}> {
	const bytes = new Uint8Array(32);
	globalThis.crypto.getRandomValues(bytes);
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	const plaintext = btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");

	const digest = await globalThis.crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(plaintext),
	);
	const hashBytes = new Uint8Array(digest);
	let hashBinary = "";
	for (const byte of hashBytes) {
		hashBinary += String.fromCharCode(byte);
	}
	const hash = btoa(hashBinary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");

	return { plaintext, hash };
}

export async function POST(request: Request) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const body = await request.json();
	const hostId = body.hostId;
	if (!hostId || typeof hostId !== "string") {
		return NextResponse.json({ error: "Missing hostId" }, { status: 400 });
	}

	const [host] = await db
		.select()
		.from(agentHost)
		.where(eq(agentHost.id, hostId))
		.limit(1);

	if (!host) {
		return NextResponse.json({ error: "Host not found" }, { status: 404 });
	}

	if (host.status === "revoked") {
		return NextResponse.json({ error: "Host is revoked" }, { status: 403 });
	}

	if (host.status === "active") {
		return NextResponse.json(
			{ error: "Host is already enrolled" },
			{ status: 400 },
		);
	}

	const token = await generateEnrollmentToken();
	const now = new Date();
	const expiresAt = new Date(now.getTime() + ENROLLMENT_TOKEN_TTL * 1000);

	await db
		.update(agentHost)
		.set({
			enrollmentTokenHash: token.hash,
			enrollmentTokenExpiresAt: expiresAt,
			updatedAt: now,
		})
		.where(eq(agentHost.id, hostId));

	return NextResponse.json({
		hostId,
		enrollmentToken: token.plaintext,
		enrollmentTokenExpiresAt: expiresAt.toISOString(),
	});
}
