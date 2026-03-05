import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { seedDatabase } from "@/lib/db/seed";

export async function POST() {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	seedDatabase(session.user.id);

	return Response.json({ message: "Seed complete" });
}
