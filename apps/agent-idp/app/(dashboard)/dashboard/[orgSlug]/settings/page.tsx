import { redirect } from "next/navigation";
import { getOrgBySlug, getSession } from "@/lib/db/queries";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage({
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

	return (
		<div className="max-w-5xl mx-auto">
			<SettingsClient
				orgName={org?.name ?? ""}
				orgSlugValue={org?.slug ?? orgSlug}
				userName={session.user.name ?? ""}
				userEmail={session.user.email ?? ""}
				orgSlug={orgSlug}
				orgId={org?.id ?? ""}
			/>
		</div>
	);
}
