"use client";

import { signIn, useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function GitHubLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 98 96"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z"
      />
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
    await signIn.social({
      provider: "github",
      callbackURL: "/dashboard",
    });
  };

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-inset">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-inset">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/3 h-[700px] w-[700px] rounded-full bg-gh-green/4 blur-[160px]" />
      </div>

      <main className="relative z-10 flex w-full max-w-sm flex-col items-center gap-10 px-6">
        <div className="flex flex-col items-center gap-5">
          <GitHubLogo className="h-12 w-12 text-white" />

          <div className="flex flex-col items-center gap-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Sign in to GitHub Proxy
            </h1>
            <p className="max-w-xs text-sm leading-relaxed text-muted">
              Proxy GitHub API access for AI agents through the Agent Auth Protocol.
            </p>
          </div>
        </div>

        <div className="w-full rounded-xl border border-border bg-surface p-6">
          <div className="flex flex-col gap-4">
            <button
              onClick={handleSignIn}
              disabled={signingIn}
              className="group flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-gh-green text-sm font-medium text-gh-btn-text transition-colors hover:bg-gh-green-hover active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
            >
              {signingIn ? (
                <Spinner />
              ) : (
                "Sign in with GitHub"
              )}
            </button>

            <p className="text-center text-xs text-muted">
              Grants access to your repositories, issues, pull requests, and workflows
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs text-muted/50">
          <span>OAuth 2.0</span>
          <span className="h-0.5 w-0.5 rounded-full bg-muted/30" />
          <span>REST API v3</span>
          <span className="h-0.5 w-0.5 rounded-full bg-muted/30" />
          <span>Agent Auth Protocol</span>
        </div>
      </main>
    </div>
  );
}
