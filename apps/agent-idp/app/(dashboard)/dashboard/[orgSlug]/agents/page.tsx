import { headers } from "next/headers";
import { auth } from "@/lib/auth/auth";
import { listConnectionsByOrg } from "@/lib/db/connections";
import { getOrgAgents } from "@/lib/db/queries";
import { AgentsClient } from "./agents-client";

export default async function AgentsPage({
	params,
}: {
	params: Promise<{ orgSlug: string }>;
}) {
	const { orgSlug } = await params;
	const session = await auth.api.getSession({ headers: await headers() });
	const orgs = await auth.api.listOrganizations({ headers: await headers() });
	const org = orgs?.find((o: any) => o.slug === orgSlug);
	const agents = org ? await getOrgAgents(org.id) : [];

	const connections = org ? await listConnectionsByOrg(org.id) : [];
	const providerTools = connections
		.filter((c) => c.status === "active")
		.map((c) => ({
			name: c.name,
			displayName: c.displayName,
			tools: [] as Array<{ name: string; description: string }>,
		}));

	return (
		<div className="max-w-5xl mx-auto">
			<AgentsClient
				initialAgents={agents}
				currentUserId={session?.user?.id ?? ""}
				providerTools={providerTools}
				orgId={org?.id ?? ""}
			/>
		</div>
	);
}
