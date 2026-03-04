import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth/auth";
import { organization } from "@/lib/db/better-auth-schema";
import { db } from "@/lib/db/drizzle";

export interface OrgSecuritySettings {
	allowDynamicHostRegistration: boolean;
	allowMemberHostCreation: boolean;
}

const SETTINGS_DEFAULTS: OrgSecuritySettings = {
	allowDynamicHostRegistration: true,
	allowMemberHostCreation: true,
};

function parseMetadata(raw: string | null): Record<string, unknown> {
	if (!raw) return {};
	try {
		return JSON.parse(raw);
	} catch {
		return {};
	}
}

export function resolveSettings(
	meta: Record<string, unknown>,
): OrgSecuritySettings {
	return {
		allowDynamicHostRegistration:
			meta.allowDynamicHostRegistration !== false
				? SETTINGS_DEFAULTS.allowDynamicHostRegistration
				: false,
		allowMemberHostCreation:
			meta.allowMemberHostCreation !== false
				? SETTINGS_DEFAULTS.allowMemberHostCreation
				: false,
	};
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

	return Response.json(resolveSettings(parseMetadata(org.metadata)));
}

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
		allowDynamicHostRegistration?: boolean;
		allowMemberHostCreation?: boolean;
	};

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

	if (updates.allowDynamicHostRegistration !== undefined) {
		meta.allowDynamicHostRegistration = updates.allowDynamicHostRegistration;
	}
	if (updates.allowMemberHostCreation !== undefined) {
		meta.allowMemberHostCreation = updates.allowMemberHostCreation;
	}

	await db
		.update(organization)
		.set({ metadata: JSON.stringify(meta) })
		.where(eq(organization.id, orgId));

	return Response.json(resolveSettings(meta));
}
