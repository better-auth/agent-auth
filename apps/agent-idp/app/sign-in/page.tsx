import { Loader2 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { BetterAuthLogo } from "@/components/icons/logo";
import { HalftoneBackground } from "@/components/ui/halftone-background";
import { getSession, getUserOrg } from "@/lib/db/queries";

export default async function SignInPage() {
	const session = await getSession();
	if (session?.user) {
		const org = await getUserOrg(session.user.id);
		if (org) throw redirect(`/dashboard/${org.slug}`);
		throw redirect("/onboarding");
	}
	return (
		<div className="relative min-h-dvh flex flex-col items-center">
			<HalftoneBackground />
			<div className="relative z-10 w-full py-4 px-5 sm:px-6">
				<Link href="/" className="flex items-center gap-1">
					<BetterAuthLogo className="h-4 w-4" />
					<p className="select-none font-mono text-sm uppercase">
						BETTER-AUTH.
					</p>
				</Link>
			</div>
			<div className="relative z-10 grow w-full grid place-items-center">
				<Suspense
					fallback={
						<div className="w-full max-w-md z-10 max-md:px-4 py-14">
							<div className="bg-background border border-border/60 p-8">
								<div className="flex items-center justify-center py-8">
									<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
								</div>
							</div>
						</div>
					}
				>
					<AuthForm />
				</Suspense>
			</div>
		</div>
	);
}
