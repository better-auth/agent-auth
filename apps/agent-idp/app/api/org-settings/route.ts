import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { audit } from "@/lib/audit";
import { auth } from "@/lib/auth/auth";
import { organization } from "@/lib/db/better-auth-schema";
import { db } from "@/lib/db/drizzle";
import type { OrgSecuritySettings } from "@/lib/db/queries";
import { resolveSecuritySettings } from "@/lib/db/queries";

function parseMetadata(raw: string | null): Record<string, unknown> {
	if (!raw) return {};
	try {
		return JSON.parse(raw);
	} catch {
		return {};
	}
}

export async function GET(req: Request) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const url = new URL(req.url);
	const orgId = url.searchParams.get("orgId");
	if (!orgId) {
		return Response.json({ error: "orgId required" }, { status: 400 });
	}

	const [org] = await db
		.select({ metadata: organization.metadata })
		.from(organization)
		.where(eq(organization.id, orgId))
		.limit(1);

	if (!org) {
		return Response.json({ error: "Org not found" }, { status: 404 });
	}

	return Response.json(resolveSecuritySettings(parseMetadata(org.metadata)));
}

const SETTING_KEYS: (keyof OrgSecuritySettings)[] = [
	"allowDynamicHostRegistration",
	"allowMemberHostCreation",
	"dynamicHostDefaultScopes",
	"disabledScopes",
	"inputScopePolicies",
	"defaultApprovalMethod",
	"reAuthPolicy",
	"freshSessionWindow",
	"allowedReAuthMethods",
	"scopeTTLs",
	"scopeMaxUses",
];

export async function PATCH(req: Request) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const reqHeaders = await headers();

	const hasSettingsPermission = await auth.api.hasPermission({
		headers: reqHeaders,
		body: { permissions: { settings: ["update"] } },
	});
	if (!hasSettingsPermission?.success) {
		return Response.json(
			{ error: "You don't have permission to update settings" },
			{ status: 403 },
		);
	}

	const body = await req.json();
	const { orgId, ...updates } = body as {
		orgId: string;
	} & Partial<OrgSecuritySettings>;

	if (!orgId) {
		return Response.json({ error: "orgId required" }, { status: 400 });
	}

	const [org] = await db
		.select({ metadata: organization.metadata })
		.from(organization)
		.where(eq(organization.id, orgId))
		.limit(1);

	if (!org) {
		return Response.json({ error: "Org not found" }, { status: 404 });
	}

	const meta = parseMetadata(org.metadata);

	for (const key of SETTING_KEYS) {
		if (updates[key] !== undefined) {
			(meta as Record<string, unknown>)[key] = updates[key];
		}
	}

	await db
		.update(organization)
		.set({ metadata: JSON.stringify(meta) })
		.where(eq(organization.id, orgId));

	audit.log({
		eventType: "settings.updated",
		orgId,
		actorId: session.user.id,
		metadata: updates,
	});

	return Response.json(resolveSecuritySettings(meta));
}
