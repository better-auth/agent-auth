"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { signIn, useSession } from "@/lib/auth-client";

function GmailLogo({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			viewBox="0 0 75 75"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path
				d="M6.25 18.75v37.5c0 3.45 2.8 6.25 6.25 6.25h6.25V28.125L37.5 43.75l18.75-15.625V62.5H62.5c3.45 0 6.25-2.8 6.25-6.25v-37.5l-3.125 4.688L37.5 43.75l-28.125-20.313L6.25 18.75z"
				fill="#4285F4"
			/>
			<path
				d="M68.75 18.75v0L62.5 25l-25 18.75L18.75 28.125V62.5h-6.25c-3.45 0-6.25-2.8-6.25-6.25v-37.5"
				fill="#34A853"
				fillOpacity="0"
			/>
			<path
				d="M6.25 18.75c0-3.45 2.8-6.25 6.25-6.25h3.125L37.5 28.125 59.375 12.5H62.5c3.45 0 6.25 2.8 6.25 6.25l-6.25 6.25-25 18.75-18.75-15.625L6.25 18.75z"
				fill="#EA4335"
			/>
			<path
				d="M6.25 18.75v37.5c0 3.45 2.8 6.25 6.25 6.25h6.25V28.125L6.25 18.75z"
				fill="#C5221F"
			/>
			<path
				d="M68.75 18.75v37.5c0 3.45-2.8 6.25-6.25 6.25h-6.25V28.125L68.75 18.75z"
				fill="#1A73E8"
			/>
			<path
				d="M68.75 18.75l-6.25 6.25-25 18.75-18.75-15.625L6.25 18.75c0-3.45 2.8-6.25 6.25-6.25h3.125L37.5 28.125 59.375 12.5H62.5c3.45 0 6.25 2.8 6.25 6.25z"
				fill="#EA4335"
			/>
		</svg>
	);
}

function GoogleLogo({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			viewBox="0 0 24 24"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path
				d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
				fill="#4285F4"
			/>
			<path
				d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
				fill="#34A853"
			/>
			<path
				d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
				fill="#FBBC05"
			/>
			<path
				d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
				fill="#EA4335"
			/>
		</svg>
	);
}

function Spinner() {
	return (
		<svg
			className="h-5 w-5 animate-spin"
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
			providerId: "google",
			callbackURL: "/dashboard",
		});
	};

	if (isPending) {
		return (
			<div className="flex min-h-screen items-center justify-center text-muted">
				<Spinner />
			</div>
		);
	}

	return (
		<div className="flex min-h-screen flex-col items-center justify-center bg-white">
			<main className="flex w-full max-w-[420px] flex-col items-center px-8 py-12">
				<GmailLogo className="h-10 w-10" />

				<h1 className="mt-6 font-normal text-[24px] text-foreground">
					Gmail Proxy
				</h1>

				<p className="mt-2 text-center text-muted text-sm leading-relaxed">
					Proxy Gmail API access for AI agents through the Agent Auth Protocol.
					Sign in to connect your account.
				</p>

				<div className="mt-8 w-full">
					<button
						className="flex h-10 w-full cursor-pointer items-center justify-center gap-3 rounded-full border border-border bg-white font-medium text-foreground text-sm shadow-sm transition-shadow hover:shadow-md active:bg-surface disabled:pointer-events-none disabled:opacity-60"
						disabled={signingIn}
						onClick={handleSignIn}
					>
						{signingIn ? (
							<Spinner />
						) : (
							<>
								<GoogleLogo className="h-[18px] w-[18px]" />
								Sign in with Google
							</>
						)}
					</button>
				</div>

				<p className="mt-6 text-center text-muted text-xs leading-relaxed">
					Grants read, send, and management access to your Gmail messages,
					threads, labels, and drafts.
				</p>

				<div className="mt-10 flex items-center gap-5 font-medium text-[11px] text-muted uppercase tracking-wider">
					<span>OAuth 2.0</span>
					<span className="h-0.5 w-0.5 rounded-full bg-border" />
					<span>PKCE</span>
					<span className="h-0.5 w-0.5 rounded-full bg-border" />
					<span>OpenID Connect</span>
				</div>

				<div className="mt-10 flex items-center gap-2">
					<div className="h-1 w-1 rounded-full bg-gmail-red" />
					<div className="h-1 w-1 rounded-full bg-gmail-blue" />
					<div className="h-1 w-1 rounded-full bg-gmail-yellow" />
					<div className="h-1 w-1 rounded-full bg-gmail-green" />
				</div>
			</main>
		</div>
	);
}
