import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage({
	params,
}: {
	params: Promise<{ orgSlug: string }>;
}) {
	const { orgSlug } = await params;
	const reqHeaders = await headers();
	const session = await auth.api.getSession({ headers: reqHeaders });
	if (!session?.user) redirect("/sign-in");

	const orgs = await auth.api.listOrganizations({ headers: reqHeaders });
	const org = orgs?.find((o: any) => o.slug === orgSlug);

	const canUpdateSettings = await auth.api.hasPermission({
		headers: reqHeaders,
		body: { permissions: { settings: ["update"] } },
	});

	return (
		<div className="max-w-5xl mx-auto">
			<SettingsClient
				orgName={org?.name ?? ""}
				orgSlugValue={org?.slug ?? orgSlug}
				userName={session.user.name ?? ""}
				userEmail={session.user.email ?? ""}
				orgSlug={orgSlug}
				orgId={org?.id ?? ""}
				canUpdateSettings={canUpdateSettings?.success ?? false}
			/>
		</div>
	);
}
