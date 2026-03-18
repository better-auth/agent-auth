import { auth } from "@/lib/auth";
import { getSettingAsync, setSettingAsync } from "@/lib/db";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

const ALLOWED_KEYS = [
	"freshSessionEnabled",
	"freshSessionWindow",
	"preferredApprovalMethod",
] as const;

export async function GET() {
	const session = await auth.api.getSession({
		headers: await headers(),
	});
	if (!session) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const [freshSessionEnabled, freshSessionWindow, preferredApprovalMethod] =
		await Promise.all([
			getSettingAsync("freshSessionEnabled"),
			getSettingAsync("freshSessionWindow"),
			getSettingAsync("preferredApprovalMethod"),
		]);

	return NextResponse.json({
		freshSessionEnabled: freshSessionEnabled === "true",
		freshSessionWindow: parseInt(freshSessionWindow ?? "300", 10),
		preferredApprovalMethod:
			preferredApprovalMethod ?? "device_authorization",
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
			await setSettingAsync(key, String(body[key]));
		}
	}

	return NextResponse.json({ ok: true });
}
