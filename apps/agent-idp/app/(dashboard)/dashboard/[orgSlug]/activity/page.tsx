import { getUnifiedActivity, getUnifiedFilterOptions } from "@/lib/audit";
import {
	getActivityFilterOptions,
	getOrgActivity,
	getOrgBySlug,
	getSession,
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
	const [org, session] = await Promise.all([
		getOrgBySlug(orgSlug),
		getSession(),
	]);
	const orgId = org?.id ?? "";
	const userId = session?.user?.id;

	const page = Math.max(parseInt((sp.page as string) || "1", 10), 1);
	const kind = (sp.kind as string) || "all";
	const status = (sp.status as string) || undefined;
	const eventType = (sp.eventType as string) || undefined;
	const agentName = (sp.agent as string) || undefined;
	const provider = (sp.provider as string) || undefined;
	const search = (sp.search as string) || undefined;

	if (!orgId) {
		return (
			<ActivityClient
				orgId=""
				orgSlug={orgSlug}
				activities={[]}
				total={0}
				page={1}
				pageSize={PAGE_SIZE}
				filterOptions={{ agents: [], providers: [], eventTypes: [] }}
				currentFilters={{
					kind: "all",
					status: "",
					eventType: "",
					agent: "",
					provider: "",
					search: "",
				}}
			/>
		);
	}

	const chResult = await getUnifiedActivity(orgId, {
		limit: PAGE_SIZE,
		offset: (page - 1) * PAGE_SIZE,
		kind: kind as "tool" | "audit" | "all",
		status,
		eventType,
		agentName,
		provider,
		search,
	});

	const chFilters = await getUnifiedFilterOptions(orgId);

	if (chResult && chFilters) {
		return (
			<ActivityClient
				orgId={orgId}
				orgSlug={orgSlug}
				activities={chResult.activities.map((a) => ({
					id: a.id,
					kind: a.kind,
					agentId: a.agentId ?? "",
					tool: a.tool ?? a.eventType ?? "",
					provider: a.provider ?? null,
					agentName: a.agentName ?? null,
					status: a.status ?? (a.kind === "audit" ? "info" : ""),
					durationMs: a.durationMs ?? null,
					error: a.error ?? null,
					createdAt: a.timestamp,
					eventType: a.eventType ?? null,
					actorId: a.actorId ?? null,
					actorType: a.actorType ?? null,
					metadata: a.metadata ?? null,
				}))}
				total={chResult.total}
				page={page}
				pageSize={PAGE_SIZE}
				filterOptions={chFilters}
				currentFilters={{
					kind: kind ?? "all",
					status: status ?? "",
					eventType: eventType ?? "",
					agent: agentName ?? "",
					provider: provider ?? "",
					search: search ?? "",
				}}
			/>
		);
	}

	const [result, filterOptions] = await Promise.all([
		getOrgActivity(orgId, {
			limit: PAGE_SIZE,
			offset: (page - 1) * PAGE_SIZE,
			status,
			agentName,
			provider,
			search,
			userId,
		}),
		getActivityFilterOptions(orgId),
	]);

	return (
		<ActivityClient
			orgId={orgId}
			orgSlug={orgSlug}
			activities={result.activities.map((a) => ({
				...a,
				kind: "tool" as const,
				eventType: null,
				actorId: null,
				actorType: null,
				metadata: null,
			}))}
			total={result.total}
			page={page}
			pageSize={PAGE_SIZE}
			filterOptions={{ ...filterOptions, eventTypes: [] }}
			currentFilters={{
				kind: "all",
				status: status ?? "",
				eventType: "",
				agent: agentName ?? "",
				provider: provider ?? "",
				search: search ?? "",
			}}
		/>
	);
}
