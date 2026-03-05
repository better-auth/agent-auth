import Link from "next/link";
import { redirect } from "next/navigation";
import { BetterAuthLogo } from "@/components/icons/logo";
import { LandingShell } from "@/components/landing/landing-shell";
import { getSession, getUserOrg } from "@/lib/db/queries";

export default async function LandingPage() {
	const session = await getSession();
	if (session?.user) {
		const org = await getUserOrg(session.user.id);
		if (org) throw redirect(`/dashboard/${org.slug}`);
		throw redirect("/onboarding");
	}
	return (
		<div className="h-dvh flex flex-col">
			<nav className="shrink-0 flex items-center">
				<Link href="/" className="flex items-center gap-1 px-5 sm:px-6 py-3">
					<BetterAuthLogo className="h-4 w-4" />
					<p className="select-none font-mono text-sm uppercase">
						BETTER-AUTH.
					</p>
				</Link>
				<div className="ml-auto flex items-center">
					<Link
						href="/sign-in"
						className="flex items-center gap-1.5 px-5 py-3 bg-foreground text-background hover:opacity-90 transition-opacity"
					>
						<span className="font-mono text-xs uppercase tracking-wider">
							sign-in
						</span>
					</Link>
				</div>
			</nav>
			<LandingShell />
		</div>
	);
}
