import { redirect } from "next/navigation";
import { ChatDialogProvider } from "@/components/chat-dialog";
import Sidebar from "@/components/dashboard/sidebar";
import {
	ensureActiveOrg,
	getDeviceSessions,
	getOrgBySlug,
	getOrgType,
	getSession,
} from "@/lib/db/queries";

export default async function OrgDashboardLayout({
	children,
	params,
}: {
	children: React.ReactNode;
	params: Promise<{ orgSlug: string }>;
}) {
	const { orgSlug } = await params;
	const [session, org, deviceSessions] = await Promise.all([
		getSession(),
		getOrgBySlug(orgSlug),
		getDeviceSessions(),
	]);
	if (!session) throw redirect("/sign-in");
	if (!org) throw redirect("/onboarding");

	if (session.session.activeOrganizationId !== org.id) {
		await ensureActiveOrg(session.session.token, org.id);
	}

	const orgType = getOrgType(org.metadata);

	return (
		<ChatDialogProvider orgSlug={orgSlug}>
			<div className="flex h-dvh">
				<Sidebar
					slug={orgSlug}
					orgId={org.id}
					orgName={org.name}
					orgType={orgType}
					session={{
						user: {
							name: session.user.name || "",
							email: session.user.email,
							image: session.user.image,
						},
					}}
					deviceSessions={deviceSessions as { session: { token: string }; user: { id: string; name: string; email: string; image?: string | null } }[]}
				/>
				<main className="ml-[252px] flex-1 overflow-y-auto px-6 lg:px-8">
					{children}
				</main>
			</div>
		</ChatDialogProvider>
	);
}
