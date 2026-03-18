"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { authClient } from "@/lib/auth-client";

function ConsentForm() {
  const searchParams = useSearchParams();
  const clientId = searchParams.get("client_id");
  const scope = searchParams.get("scope");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scopes = scope?.split(" ").filter(Boolean) ?? [];

  async function handleConsent(accept: boolean) {
    setLoading(true);
    setError(null);

    try {
      await authClient.oauth2.consent({
        accept,
        scope: accept ? scope ?? undefined : undefined,
      });
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">Authorize Access</h1>
          <p className="text-sm text-neutral-400">
            An application is requesting access to your account.
          </p>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 space-y-3">
          <div className="text-sm text-neutral-400">
            <span className="font-medium text-neutral-200">Client:</span>{" "}
            <code className="text-xs bg-neutral-800 rounded px-1.5 py-0.5">
              {clientId ?? "unknown"}
            </code>
          </div>

          {scopes.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-neutral-300">
                Requested permissions:
              </div>
              <ul className="space-y-1">
                {scopes.map((s) => (
                  <li
                    key={s}
                    className="flex items-center gap-2 text-sm text-neutral-400"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-neutral-600" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={() => handleConsent(false)}
            disabled={loading}
            className="flex-1 rounded-lg border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-800 disabled:opacity-50 transition-colors"
          >
            Deny
          </button>
          <button
            onClick={() => handleConsent(true)}
            disabled={loading}
            className="flex-1 rounded-lg bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50 transition-colors"
          >
            {loading ? "Loading..." : "Allow"}
          </button>
        </div>
      </div>
    </main>
  );
}

export default function ConsentPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center">
          <p className="text-neutral-500">Loading...</p>
        </main>
      }
    >
      <ConsentForm />
    </Suspense>
  );
}
