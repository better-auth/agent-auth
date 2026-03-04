import { headers } from "next/headers";
import { auth } from "@/lib/auth/auth";
import { ApprovalsClient } from "./approvals-client";

export default async function ApprovalsPage({
	params,
}: {
	params: Promise<{ orgSlug: string }>;
}) {
	const { orgSlug } = await params;
	const session = await auth.api.getSession({ headers: await headers() });
	const orgs = await auth.api.listOrganizations({ headers: await headers() });
	const org = orgs?.find((o: any) => o.slug === orgSlug);

	return (
		<div className="max-w-5xl mx-auto">
			<ApprovalsClient
				currentUserId={session?.user?.id ?? ""}
				orgId={org?.id ?? ""}
			/>
		</div>
	);
}
