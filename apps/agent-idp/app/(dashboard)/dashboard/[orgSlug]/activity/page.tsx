import {
	getActivityFilterOptions,
	getOrgActivity,
	getOrgBySlug,
} from "@/lib/db/queries";
import { ActivityClient } from "./activity-client";

const PAGE_SIZE = 50;

export default async function ActivityPage({
	params,
	searchParams,
}: {
	params: Promise<{ orgSlug: string }>;
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const { orgSlug } = await params;
	const sp = await searchParams;
	const org = await getOrgBySlug(orgSlug);
	const orgId = org?.id ?? "";

	const page = Math.max(parseInt((sp.page as string) || "1", 10), 1);
	const status = (sp.status as string) || undefined;
	const agentName = (sp.agent as string) || undefined;
	const provider = (sp.provider as string) || undefined;
	const search = (sp.search as string) || undefined;

	const [result, filterOptions] = orgId
		? await Promise.all([
				getOrgActivity(orgId, {
					limit: PAGE_SIZE,
					offset: (page - 1) * PAGE_SIZE,
					status,
					agentName,
					provider,
					search,
				}),
				getActivityFilterOptions(orgId),
			])
		: [
				{ activities: [], hasMore: false, total: 0 },
				{ agents: [], providers: [] },
			];

	return (
		<ActivityClient
			orgId={orgId}
			orgSlug={orgSlug}
			activities={result.activities}
			total={result.total}
			page={page}
			pageSize={PAGE_SIZE}
			filterOptions={filterOptions}
			currentFilters={{
				status: status ?? "",
				agent: agentName ?? "",
				provider: provider ?? "",
				search: search ?? "",
			}}
		/>
	);
}
