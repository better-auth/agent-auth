import { NextResponse } from "next/server";

export async function GET() {
	return NextResponse.redirect(
		new URL("/api/auth/agent/discover", "http://localhost:4100"),
		307,
	);
}
