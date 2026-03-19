import { auth } from "../../../lib/auth";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const configuration = await auth.api.getAgentConfiguration();
  return NextResponse.json(configuration);
}
