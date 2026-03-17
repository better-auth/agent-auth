import { type NextRequest, NextResponse } from "next/server";

export function GET(req: NextRequest) {
	const url = new URL(req.url);
	const target = new URL(
		"/api/auth/oauth2/callback/cloudflare",
		"https://e1f0-2a09-bac5-638d-1232-00-1d0-dd.ngrok-free.app",
	);
	target.search = url.search;
	return NextResponse.redirect(target);
}
