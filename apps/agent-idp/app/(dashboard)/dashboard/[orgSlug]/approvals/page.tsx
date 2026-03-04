import {
	getOrgBySlug,
	getOrgSecuritySettings,
	getSession,
} from "@/lib/db/queries";
import { ApprovalsClient } from "./approvals-client";

export default async function ApprovalsPage({
	params,
}: {
	params: Promise<{ orgSlug: string }>;
}) {
	const { orgSlug } = await params;
	const [session, org] = await Promise.all([
		getSession(),
		getOrgBySlug(orgSlug),
	]);

	const orgId = org?.id ?? "";
	const securitySettings = orgId
		? await getOrgSecuritySettings(orgId)
		: undefined;

	return (
		<div className="max-w-5xl mx-auto">
			<ApprovalsClient
				currentUserId={session?.user?.id ?? ""}
				orgId={orgId}
				userEmail={session?.user?.email}
				allowedReAuthMethods={securitySettings?.allowedReAuthMethods}
			/>
		</div>
	);
}
