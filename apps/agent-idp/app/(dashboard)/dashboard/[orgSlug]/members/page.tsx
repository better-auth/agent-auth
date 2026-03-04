import { redirect } from "next/navigation";
import { getOrgBySlug, getOrgMembers, getSession } from "@/lib/db/queries";
import { MembersClient } from "./members-client";

export default async function MembersPage({
	params,
}: {
	params: Promise<{ orgSlug: string }>;
}) {
	const { orgSlug } = await params;
	const [session, org] = await Promise.all([
		getSession(),
		getOrgBySlug(orgSlug),
	]);
	if (!session?.user) redirect("/sign-in");
	if (!org) redirect("/dashboard");

	const initialMembers = await getOrgMembers(org.id);

	return (
		<div className="max-w-5xl mx-auto">
			<MembersClient
				initialMembers={initialMembers}
				currentUserId={session.user.id}
				orgId={org.id}
				orgSlug={orgSlug}
			/>
		</div>
	);
}
