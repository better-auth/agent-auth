import { auth } from "@/lib/auth";
import {
	addProvider,
	listProviders,
	removeProvider,
} from "@/lib/mcp-providers";

export async function GET(request: Request) {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const providers = listProviders(session.user.id);
	return Response.json({ providers });
}

export async function POST(request: Request) {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const body = (await request.json()) as { name: string; endpoint: string };
	if (!body.name || !body.endpoint) {
		return Response.json(
			{ error: "name and endpoint are required" },
			{ status: 400 },
		);
	}

	try {
		new URL(body.endpoint);
	} catch {
		return Response.json(
			{ error: "endpoint must be a valid URL" },
			{ status: 400 },
		);
	}

	const provider = addProvider(session.user.id, body.name, body.endpoint);
	return Response.json({ provider });
}

export async function DELETE(request: Request) {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const body = (await request.json()) as { id: string };
	if (!body.id) {
		return Response.json({ error: "id is required" }, { status: 400 });
	}

	const removed = removeProvider(body.id, session.user.id);
	if (!removed) {
		return Response.json({ error: "Provider not found" }, { status: 404 });
	}

	return Response.json({ success: true });
}
