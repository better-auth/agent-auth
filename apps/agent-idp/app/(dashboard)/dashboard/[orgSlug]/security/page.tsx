import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import {
	getOrgAvailableScopes,
	getOrgBySlug,
	getOrgSecuritySettings,
	getSession,
} from "@/lib/db/queries";
import { SecurityClient } from "./security-client";

export default async function SecurityPage({
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
	const [canUpdateSettings, initialSettings, availableScopes] =
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
			orgId ? getOrgAvailableScopes(orgId) : [],
		]);

	return (
		<div className="max-w-5xl mx-auto">
			<SecurityClient
				orgId={orgId}
				canUpdate={canUpdateSettings?.success ?? false}
				initialSettings={initialSettings}
				availableScopes={availableScopes}
			/>
		</div>
	);
}
