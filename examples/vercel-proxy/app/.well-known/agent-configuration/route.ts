import { auth } from "../../../lib/auth";
import { NextResponse } from "next/server";

export async function GET() {
	const configuration = await (
		auth.api as unknown as {
			getAgentConfiguration: () => Promise<Record<string, unknown>>;
		}
	).getAgentConfiguration();
	return NextResponse.json(configuration);
}