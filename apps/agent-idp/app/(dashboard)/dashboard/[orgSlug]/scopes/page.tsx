import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import {
	getOrgBySlug,
	getOrgScopesWithSchema,
	getOrgSecuritySettings,
	getSession,
} from "@/lib/db/queries";
import { ScopesClient } from "./scopes-client";

export default async function ScopesPage({
	params,
}: {
	params: Promise<{ orgSlug: string }>;
}) {
	const { orgSlug } = await params;
	const [session, org] = await Promise.all([
		getSession(),
		getOrgBySlug(orgSlug),
	]);
	if (!session?.user) redirect("/sign-in");

	const orgId = org?.id ?? "";
	const reqHeaders = await headers();
	const [canUpdateSettings, initialSettings, connectionScopes] =
		await Promise.all([
			auth.api
				.hasPermission({
					headers: reqHeaders,
					body: {
						permissions: { settings: ["update"] },
						organizationId: orgId,
					},
				})
				.catch(() => ({ success: false })),
			orgId ? getOrgSecuritySettings(orgId) : undefined,
			orgId ? getOrgScopesWithSchema(orgId, session?.user?.id) : [],
		]);

	return (
		<div className="max-w-6xl mx-auto">
			<ScopesClient
				orgId={orgId}
				canUpdate={canUpdateSettings?.success ?? false}
				connectionScopes={connectionScopes}
				initialPolicies={initialSettings?.inputScopePolicies ?? []}
				initialDisabledScopes={initialSettings?.disabledScopes ?? []}
				initialScopeTTLs={initialSettings?.scopeTTLs ?? {}}
			/>
		</div>
	);
}
