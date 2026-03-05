import { headers } from "next/headers";
import { auth } from "@/lib/auth/auth";
import {
	getOrgAvailableScopes,
	getOrgBySlug,
	getOrgHosts,
	getSession,
} from "@/lib/db/queries";
import { HostsClient } from "./hosts-client";

export default async function HostsPage({
	params,
}: {
	params: Promise<{ orgSlug: string }>;
}) {
	const { orgSlug } = await params;
	const [session, org] = await Promise.all([
		getSession(),
		getOrgBySlug(orgSlug),
	]);
	const orgId = org?.id ?? "";

	const reqHeaders = await headers();
	const [canReadAll, canCreate, canDelete] = await Promise.all([
		auth.api.hasPermission({
			headers: reqHeaders,
			body: { permissions: { host: ["readAll"] }, organizationId: orgId },
		}),
		auth.api.hasPermission({
			headers: reqHeaders,
			body: { permissions: { host: ["create"] }, organizationId: orgId },
		}),
		auth.api.hasPermission({
			headers: reqHeaders,
			body: { permissions: { host: ["delete"] }, organizationId: orgId },
		}),
	]);

	const [allHosts, availableScopes] = orgId
		? await Promise.all([getOrgHosts(orgId), getOrgAvailableScopes(orgId)])
		: [[], []];

	const hosts = canReadAll?.success
		? allHosts
		: allHosts.filter((h) => h.userId === session?.user?.id);

	return (
		<div className="max-w-5xl mx-auto">
			<HostsClient
				orgId={orgId}
				initialHosts={hosts}
				initialAvailableScopes={availableScopes}
				permissions={{
					canCreate: canCreate?.success ?? false,
					canDelete: canDelete?.success ?? false,
					canReadAll: canReadAll?.success ?? false,
				}}
			/>
		</div>
	);
}
