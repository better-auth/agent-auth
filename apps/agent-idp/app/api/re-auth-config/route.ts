import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth/auth";
import { member, organization } from "@/lib/db/better-auth-schema";
import { db } from "@/lib/db/drizzle";
import { resolveSecuritySettings } from "@/lib/db/queries";

export async function GET() {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user) {
		return Response.json({ allowedMethods: ["password", "passkey"] });
	}

	const [membership] = await db
		.select({ orgId: member.organizationId })
		.from(member)
		.where(eq(member.userId, session.user.id))
		.limit(1);

	if (!membership) {
		return Response.json({ allowedMethods: ["password", "passkey"] });
	}

	const [org] = await db
		.select({ metadata: organization.metadata })
		.from(organization)
		.where(eq(organization.id, membership.orgId))
		.limit(1);

	if (!org) {
		return Response.json({ allowedMethods: ["password", "passkey"] });
	}

	const meta = org.metadata ? JSON.parse(org.metadata) : {};
	const settings = resolveSecuritySettings(meta);

	return Response.json({
		allowedMethods: settings.allowedReAuthMethods,
	});
}
