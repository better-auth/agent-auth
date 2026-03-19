"use client";

import { signIn, useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function VercelLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 76 65"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
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
      providerId: "vercel-mcp",
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
        <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-white/3 blur-[120px]" />
      </div>

      <main className="relative z-10 flex w-full max-w-sm flex-col items-center gap-10 px-6">
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-3">
            <VercelLogo className="h-6 w-6 text-white" />
            <div className="h-5 w-px bg-border" />
            <span className="text-sm font-medium tracking-wide text-muted uppercase">
              Agent Auth
            </span>
          </div>

          <div className="flex flex-col items-center gap-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-white">Vercel Proxy</h1>
            <p className="max-w-xs text-sm leading-relaxed text-muted">
              Proxy Vercel API access for AI agents. Sign in to connect your Vercel account.
            </p>
          </div>
        </div>

        <div className="flex w-full flex-col gap-3">
          <button
            onClick={handleSignIn}
            disabled={signingIn}
            className="group flex h-11 w-full cursor-pointer items-center justify-center gap-2.5 rounded-lg bg-white text-sm font-medium text-black transition-all hover:bg-white/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
          >
            {signingIn ? (
              <Spinner />
            ) : (
              <>
                <VercelLogo className="h-3.5 w-3.5" />
                Sign in with Vercel
              </>
            )}
          </button>

          <p className="text-center text-xs text-muted/60">
            Grants access to your Vercel projects, deployments, and resources
          </p>
        </div>

        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-4 text-xs text-muted/50">
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
