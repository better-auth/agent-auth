import { headers } from "next/headers";
import { desc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { agentActivity } from "@/lib/db/schema";

export async function GET(req: Request) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const url = new URL(req.url);
	const limit = Math.min(
		Number.parseInt(url.searchParams.get("limit") ?? "50", 10),
		200,
	);

	let agentIds: string[] = [];
	try {
		const agentRes = await auth.api.listAgents({ headers: await headers() });
		const agents = Array.isArray(agentRes)
			? agentRes
			: ((agentRes as Record<string, unknown>)?.agents as
					| Array<{ id?: string }>
					| undefined) ?? [];
		agentIds = agents
			.map((agent) => agent?.id)
			.filter((id): id is string => typeof id === "string");
	} catch {
		agentIds = [];
	}

	if (agentIds.length === 0) {
		return Response.json([]);
	}

	const activities = db
		.select()
		.from(agentActivity)
		.orderBy(desc(agentActivity.createdAt))
		.all()
		.filter((activity) => agentIds.includes(activity.agentId))
		.slice(0, limit);

	return Response.json(activities);
}
