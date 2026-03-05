import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Sidebar } from "@/components/dashboard/sidebar";
import { seedDatabase } from "@/lib/db/seed";

export default async function DashboardLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const reqHeaders = await headers();
	const session = await auth.api.getSession({ headers: reqHeaders });
	if (!session?.user) {
		redirect("/");
	}

	seedDatabase(session.user.id);

	const deviceSessions: { session: { token: string }; user: { id: string; name: string; email: string; image?: string | null } }[] = [];

	return (
		<div className="min-h-screen bg-background">
			<Sidebar
				user={session.user}
				deviceSessions={deviceSessions}
			/>
			<main className="pl-60">
				<div className="mx-auto max-w-6xl px-8 py-8">{children}</div>
			</main>
		</div>
	);
}
