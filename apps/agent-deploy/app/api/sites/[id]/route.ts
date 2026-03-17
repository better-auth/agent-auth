import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { deleteSite, getSite, updateSite } from "@/lib/db";

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> }
) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}
	const { id } = await params;
	const site = getSite(id);
	if (!site || site.userId !== session.user.id) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}
	return NextResponse.json(site);
}

export async function PATCH(
	request: Request,
	{ params }: { params: Promise<{ id: string }> }
) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}
	const { id } = await params;
	const body = await request.json();
	const site = updateSite({
		id,
		userId: session.user.id,
		name: body.name,
		html: body.html,
		description: body.description,
	});
	if (!site) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}
	return NextResponse.json(site);
}

export async function DELETE(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> }
) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}
	const { id } = await params;
	const success = deleteSite(id, session.user.id);
	if (!success) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}
	return NextResponse.json({ success: true });
}
