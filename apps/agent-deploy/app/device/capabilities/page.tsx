"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AgentAuthLogo } from "@/components/icons/logo";

function DeviceCapabilitiesContent() {
	const params = useSearchParams();
	const userCode = params.get("user_code") ?? "";

	return (
		<div className="flex min-h-dvh flex-col items-center justify-center px-5 py-12">
			<div className="w-full max-w-sm space-y-8 text-center">
				<AgentAuthLogo className="mx-auto h-6 w-auto" />

				<div className="space-y-2">
					<h1 className="font-semibold text-xl tracking-tight">
						Authorize Agent
					</h1>
					<p className="text-foreground/45 text-sm">
						An AI agent is requesting access to your Agent Deploy account.
					</p>
				</div>

				{userCode && (
					<div className="border border-foreground/[0.08] bg-foreground/[0.02] p-4">
						<span className="font-mono text-[10px] text-foreground/35 uppercase tracking-wider">
							Verification Code
						</span>
						<p className="mt-2 font-mono font-semibold text-2xl tracking-[0.3em]">
							{userCode}
						</p>
					</div>
				)}

				<p className="font-mono text-[11px] text-foreground/30">
					Confirm this code matches what your AI agent is showing, then sign in
					to approve the requested capabilities.
				</p>
			</div>
		</div>
	);
}

export default function DeviceCapabilitiesPage() {
	return (
		<Suspense
			fallback={
				<div className="flex min-h-dvh items-center justify-center">
					<div className="animate-pulse font-mono text-[11px] text-foreground/30">
						Loading...
					</div>
				</div>
			}
		>
			<DeviceCapabilitiesContent />
		</Suspense>
	);
}
