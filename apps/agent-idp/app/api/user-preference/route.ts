import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { audit } from "@/lib/audit";
import { auth } from "@/lib/auth/auth";
import { db } from "@/lib/db/drizzle";
import { userPreference } from "@/lib/db/schema";

const VALID_APPROVAL_METHODS = new Set([
	"auto",
	"ciba",
	"device_authorization",
]);

export async function GET() {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const [pref] = await db
		.select()
		.from(userPreference)
		.where(eq(userPreference.userId, session.user.id))
		.limit(1);

	return Response.json({
		preferredApprovalMethod: pref?.preferredApprovalMethod ?? "auto",
	});
}

export async function PATCH(req: Request) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const body = (await req.json()) as {
		preferredApprovalMethod?: string;
	};

	const method = body.preferredApprovalMethod;
	if (method !== undefined && !VALID_APPROVAL_METHODS.has(method)) {
		return Response.json({ error: "Invalid approval method" }, { status: 400 });
	}

	await db
		.insert(userPreference)
		.values({
			userId: session.user.id,
			preferredApprovalMethod: method === "auto" ? null : (method ?? null),
			updatedAt: new Date(),
		})
		.onConflictDoUpdate({
			target: userPreference.userId,
			set: {
				preferredApprovalMethod: method === "auto" ? null : (method ?? null),
				updatedAt: new Date(),
			},
		});

	audit.log({
		eventType: "user_preference.updated",
		orgId: "",
		actorId: session.user.id,
		metadata: { preferredApprovalMethod: method },
	});

	return Response.json({
		preferredApprovalMethod: method ?? "auto",
	});
}
