import { auth } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/db";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

const ALLOWED_KEYS = [
	"freshSessionEnabled",
	"freshSessionWindow",
	"preferredApprovalMethod",
	"webauthnEnabled",
] as const;

export async function GET() {
	const session = await auth.api.getSession({
		headers: await headers(),
	});
	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	return NextResponse.json({
		freshSessionEnabled: getSetting("freshSessionEnabled") === "true",
		freshSessionWindow: parseInt(
			getSetting("freshSessionWindow") ?? "300",
			10,
		),
		preferredApprovalMethod:
			getSetting("preferredApprovalMethod") ?? "device_authorization",
		webauthnEnabled: getSetting("webauthnEnabled") === "true",
	});
}

export async function PUT(req: Request) {
	const session = await auth.api.getSession({
		headers: await headers(),
	});
	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const body = await req.json();

	for (const key of ALLOWED_KEYS) {
		if (key in body) {
			setSetting(key, String(body[key]));
		}
	}

	return NextResponse.json({ ok: true });
}
