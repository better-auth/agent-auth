"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AgentAuthLogo } from "@/components/icons/logo";

function DeviceCapabilitiesContent() {
  const params = useSearchParams();
  const userCode = params.get("user_code") ?? "";

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm space-y-8 text-center">
        <AgentAuthLogo className="h-6 w-auto mx-auto" />

        <div className="space-y-2">
          <h1 className="text-xl font-semibold tracking-tight">
            Authorize Agent
          </h1>
          <p className="text-sm text-foreground/45">
            An AI agent is requesting access to your Agent Deploy account.
          </p>
        </div>

        {userCode && (
          <div className="p-4 border border-foreground/[0.08] bg-foreground/[0.02]">
            <span className="text-[10px] font-mono text-foreground/35 tracking-wider uppercase">
              Verification Code
            </span>
            <p className="mt-2 text-2xl font-mono font-semibold tracking-[0.3em]">
              {userCode}
            </p>
          </div>
        )}

        <p className="text-[11px] font-mono text-foreground/30">
          Confirm this code matches what your AI agent is showing, then sign
          in to approve the requested capabilities.
        </p>
      </div>
    </div>
  );
}

export default function DeviceCapabilitiesPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh flex items-center justify-center">
          <div className="text-[11px] font-mono text-foreground/30 animate-pulse">
            Loading...
          </div>
        </div>
      }
    >
      <DeviceCapabilitiesContent />
    </Suspense>
  );
}
