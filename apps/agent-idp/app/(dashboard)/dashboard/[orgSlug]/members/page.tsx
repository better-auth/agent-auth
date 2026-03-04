import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { getOrgMembers } from "@/lib/db/queries";
import { MembersClient } from "./members-client";

export default async function MembersPage({
	params,
}: {
	params: Promise<{ orgSlug: string }>;
}) {
	const { orgSlug } = await params;
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user) redirect("/sign-in");

	const orgs = await auth.api.listOrganizations({ headers: await headers() });
	const org = orgs?.find((o: any) => o.slug === orgSlug);
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
