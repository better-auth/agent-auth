import { listConnectionsByOrg } from "@/lib/db/connections";
import { getOrgAgents, getOrgBySlug, getSession } from "@/lib/db/queries";
import { AgentsClient } from "./agents-client";

export default async function AgentsPage({
	params,
}: {
	params: Promise<{ orgSlug: string }>;
}) {
	const { orgSlug } = await params;
	const [session, org] = await Promise.all([
		getSession(),
		getOrgBySlug(orgSlug),
	]);

	if (!org) {
		return (
			<div className="max-w-5xl mx-auto">
				<AgentsClient
					initialAgents={[]}
					currentUserId=""
					providerTools={[]}
					orgId=""
				/>
			</div>
		);
	}

	const [agents, connections] = await Promise.all([
		getOrgAgents(org.id),
		listConnectionsByOrg(org.id),
	]);

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
				orgId={org.id}
			/>
		</div>
	);
}
