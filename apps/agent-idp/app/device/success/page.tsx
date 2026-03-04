import { headers } from "next/headers";
import Link from "next/link";
import { auth } from "@/lib/auth/auth";

export default async function SuccessPage() {
	let dashboardHref = "/";
	try {
		const session = await auth.api.getSession({ headers: await headers() });
		if (session?.user) {
			const orgs = await auth.api.listOrganizations({
				headers: await headers(),
			});
			if (orgs && orgs.length > 0) {
				dashboardHref = `/dashboard/${(orgs[0] as any).slug}`;
			}
		}
	} catch {
		// Fall back to root
	}

	return (
		<div className="flex min-h-dvh items-center justify-center p-4">
			<div className="w-full max-w-md space-y-4 rounded-xl border border-border bg-card p-6 text-center shadow-sm">
				<div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
					<svg
						className="h-6 w-6 text-success"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						strokeWidth={2}
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							d="M5 13l4 4L19 7"
						/>
					</svg>
				</div>

				<div>
					<h1 className="text-2xl font-bold tracking-tight">Device Approved</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						The device has been authorized to access your account. You can
						return to your device.
					</p>
				</div>

				<Link
					href={dashboardHref}
					className="inline-block w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
				>
					Return to Dashboard
				</Link>
			</div>
		</div>
	);
}
