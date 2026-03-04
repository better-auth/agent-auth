import { headers } from "next/headers";
import { auth } from "@/lib/auth/auth";
import { getOrgActivity } from "@/lib/db/queries";
import { ActivityClient } from "./activity-client";

export default async function ActivityPage({
	params,
}: {
	params: Promise<{ orgSlug: string }>;
}) {
	const { orgSlug } = await params;
	const orgs = await auth.api.listOrganizations({ headers: await headers() });
	const org = orgs?.find((o: any) => o.slug === orgSlug);
	const orgId = org?.id ?? "";

	const result = orgId
		? await getOrgActivity(orgId, { limit: 50 })
		: { activities: [], hasMore: false };

	return (
		<div className="max-w-5xl mx-auto">
			<ActivityClient
				orgId={orgId}
				orgSlug={orgSlug}
				initialActivities={result.activities}
				initialHasMore={result.hasMore}
			/>
		</div>
	);
}
