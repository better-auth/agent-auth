import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Sidebar from "@/components/dashboard/sidebar";
import { auth } from "@/lib/auth/auth";
import { getOrgBySlug, getSession } from "@/lib/db/queries";

export default async function OrgDashboardLayout({
	children,
	params,
}: {
	children: React.ReactNode;
	params: Promise<{ orgSlug: string }>;
}) {
	const { orgSlug } = await params;
	const [session, org] = await Promise.all([
		getSession(),
		getOrgBySlug(orgSlug),
	]);
	if (!session) throw redirect("/sign-in");
	if (!org) throw redirect("/onboarding");

	const orgs = await auth.api.listOrganizations({ headers: await headers() });
	const orgList = (orgs || []).map((o: any) => ({
		id: o.id,
		name: o.name,
		slug: o.slug,
	}));

	return (
		<div className="flex h-dvh">
			<Sidebar
				slug={orgSlug}
				orgId={org.id}
				orgs={orgList}
				session={{
					user: {
						name: session.user.name || "",
						email: session.user.email,
						image: session.user.image,
					},
				}}
			/>
			<main className="ml-[252px] flex-1 overflow-y-auto px-6 lg:px-8">
				{children}
			</main>
		</div>
	);
}
