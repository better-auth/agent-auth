import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { getActivityFilterOptions, getOrgActivity } from "@/lib/db/queries";

export async function GET(request: NextRequest) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const sp = request.nextUrl.searchParams;
	const orgId = sp.get("orgId");
	const agentId = sp.get("agentId");

	if (!agentId && !orgId) {
		return NextResponse.json(
			{ error: "Missing agentId or orgId" },
			{ status: 400 },
		);
	}

	const limit = Math.min(
		Math.max(parseInt(sp.get("limit") || "50", 10), 1),
		200,
	);
	const offset = Math.max(parseInt(sp.get("offset") || "0", 10), 0);

	const status = sp.get("status") || undefined;
	const agentName = sp.get("agentName") || undefined;
	const provider = sp.get("provider") || undefined;
	const search = sp.get("search") || undefined;
	const includeFilters = sp.get("filters") === "1";

	const targetOrgId = orgId!;

	const [result, filterOptions] = await Promise.all([
		getOrgActivity(targetOrgId, {
			limit,
			offset,
			status,
			agentId: agentId || undefined,
			agentName,
			provider,
			search,
		}),
		includeFilters ? getActivityFilterOptions(targetOrgId) : null,
	]);

	return NextResponse.json({
		...result,
		...(filterOptions ? { filterOptions } : {}),
	});
}
