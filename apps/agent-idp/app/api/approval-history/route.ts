import { headers } from "next/headers";
import { auth } from "@/lib/auth/auth";
import { getApprovalHistory, recordApproval } from "@/lib/db/queries";

export async function GET(req: Request) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const url = new URL(req.url);
	const orgId = url.searchParams.get("orgId");
	if (!orgId) {
		return Response.json({ error: "orgId required" }, { status: 400 });
	}

	const limit = Number(url.searchParams.get("limit") ?? "50");
	const offset = Number(url.searchParams.get("offset") ?? "0");

	const result = await getApprovalHistory(orgId, { limit, offset });
	return Response.json(result);
}

export async function POST(req: Request) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const body = (await req.json()) as {
		orgId: string;
		action: string;
		requestType: string;
		requestId?: string;
		agentId?: string;
		agentName?: string;
		clientId?: string;
		scopes?: string;
		bindingMessage?: string;
	};

	if (!body.orgId || !body.action || !body.requestType) {
		return Response.json(
			{ error: "orgId, action, and requestType are required" },
			{ status: 400 },
		);
	}

	const id = await recordApproval({
		...body,
		userId: session.user.id,
	});

	return Response.json({ id });
}
