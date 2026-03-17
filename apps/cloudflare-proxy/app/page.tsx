"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { signIn, useSession } from "@/lib/auth-client";

function CloudflareLogo({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			fill="none"
			viewBox="0 0 65 65"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path
				d="M44.214 40.877a1.418 1.418 0 0 0-.103-1.344c-.257-.386-.67-.617-1.12-.644L20.92 37.78a.47.47 0 0 1-.38-.228.493.493 0 0 1-.035-.45c.077-.184.245-.31.44-.335l22.39-1.12c1.948-.097 4.063-1.66 4.825-3.56l.967-2.413a.836.836 0 0 0 .047-.44C47.74 20.47 40.05 13.5 30.8 13.5c-8.406 0-15.548 5.737-17.62 13.51a7.86 7.86 0 0 0-5.45-1.554c-3.72.344-6.724 3.316-7.1 7.033a7.95 7.95 0 0 0 .443 3.562C.487 36.23 0 37.006 0 38.23c0 .36.04.71.116 1.05.102.452.5.773.965.773h42.163c.44 0 .838-.293.97-.71l-.001-.466Z"
				fill="currentColor"
			/>
			<path
				d="M52.058 25.092a.397.397 0 0 0-.393.05 10.27 10.27 0 0 0-3.168 4.05l-.967 2.414c-.762 1.9.012 3.462 1.722 3.56l3.753.188c.193.019.362.145.44.335a.493.493 0 0 1-.036.45.468.468 0 0 1-.38.228l-3.83.192c-1.947.097-3.28 1.66-2.962 3.464.18 1.018.556 1.95 1.09 2.77.19.293.55.437.9.37A12.456 12.456 0 0 0 58.5 30.875a12.409 12.409 0 0 0-6.048-5.63.396.396 0 0 0-.393-.152Z"
				fill="currentColor"
				opacity="0.7"
			/>
		</svg>
	);
}

function Spinner() {
	return (
		<svg
			className="h-4 w-4 animate-spin"
			fill="none"
			viewBox="0 0 24 24"
			xmlns="http://www.w3.org/2000/svg"
		>
			<circle
				className="opacity-25"
				cx="12"
				cy="12"
				r="10"
				stroke="currentColor"
				strokeWidth="4"
			/>
			<path
				className="opacity-75"
				d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
				fill="currentColor"
			/>
		</svg>
	);
}

export default function Home() {
	const { data: session, isPending } = useSession();
	const router = useRouter();
	const [signingIn, setSigningIn] = useState(false);

	useEffect(() => {
		if (session) {
			router.push("/dashboard");
		}
	}, [session, router]);

	const handleSignIn = async () => {
		setSigningIn(true);
		await signIn.oauth2({
			providerId: "cloudflare",
			callbackURL: "/dashboard",
		});
	};

	if (isPending) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<Spinner />
			</div>
		);
	}

	return (
		<div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden">
			<div className="pointer-events-none absolute inset-0">
				<div className="absolute top-0 left-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/3 blur-[120px]" />
			</div>

			<main className="relative z-10 flex w-full max-w-sm flex-col items-center gap-10 px-6">
				<div className="flex flex-col items-center gap-4">
					<div className="flex items-center gap-3">
						<CloudflareLogo className="h-6 w-8 text-white" />
						<div className="h-5 w-px bg-border" />
						<span className="font-medium text-muted text-sm uppercase tracking-wide">
							Agent Auth
						</span>
					</div>

					<div className="flex flex-col items-center gap-2 text-center">
						<h1 className="font-semibold text-2xl text-white tracking-tight">
							Cloudflare Proxy
						</h1>
						<p className="max-w-xs text-muted text-sm leading-relaxed">
							Proxy Cloudflare API access for AI agents. Sign in to connect your
							Cloudflare account.
						</p>
					</div>
				</div>

				<div className="flex w-full flex-col gap-3">
					<button
						className="group flex h-11 w-full cursor-pointer items-center justify-center gap-2.5 rounded-lg bg-white font-medium text-black text-sm transition-all hover:bg-white/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
						disabled={signingIn}
						onClick={handleSignIn}
					>
						{signingIn ? (
							<Spinner />
						) : (
							<>
								<CloudflareLogo className="h-3.5 w-5" />
								Sign in with Cloudflare
							</>
						)}
					</button>

					<p className="text-center text-muted/60 text-xs">
						Grants access to your Cloudflare Workers, DNS, R2, and other
						resources
					</p>
				</div>

				<div className="flex flex-col items-center gap-3">
					<div className="flex items-center gap-4 text-muted/50 text-xs">
						<span>PKCE</span>
						<span className="h-0.5 w-0.5 rounded-full bg-muted/30" />
						<span>OAuth 2.0</span>
						<span className="h-0.5 w-0.5 rounded-full bg-muted/30" />
						<span>OpenID Connect</span>
					</div>
				</div>
			</main>
		</div>
	);
}
