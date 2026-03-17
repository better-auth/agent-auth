import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function GET() {
	const configuration = await auth.api.getAgentConfiguration();
	return NextResponse.json(configuration);
}
