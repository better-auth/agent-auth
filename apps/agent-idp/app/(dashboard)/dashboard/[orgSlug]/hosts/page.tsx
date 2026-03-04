import { headers } from "next/headers";
import { auth } from "@/lib/auth/auth";
import { getOrgAvailableScopes, getOrgHosts } from "@/lib/db/queries";
import { HostsClient } from "./hosts-client";

export default async function HostsPage({
	params,
}: {
	params: Promise<{ orgSlug: string }>;
}) {
	const { orgSlug } = await params;
	const reqHeaders = await headers();
	const session = await auth.api.getSession({ headers: reqHeaders });
	const orgs = await auth.api.listOrganizations({ headers: reqHeaders });
	const org = orgs?.find((o: any) => o.slug === orgSlug);
	const orgId = org?.id ?? "";

	const canReadAll = await auth.api.hasPermission({
		headers: reqHeaders,
		body: { permissions: { host: ["readAll"] } },
	});
	const canCreate = await auth.api.hasPermission({
		headers: reqHeaders,
		body: { permissions: { host: ["create"] } },
	});
	const canDelete = await auth.api.hasPermission({
		headers: reqHeaders,
		body: { permissions: { host: ["delete"] } },
	});

	const allHosts = orgId ? await getOrgHosts(orgId) : [];

	const hosts =
		canReadAll?.success
			? allHosts
			: allHosts.filter((h) => h.userId === session?.user?.id);

	const availableScopes = orgId
		? await getOrgAvailableScopes(orgId)
		: [];

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
