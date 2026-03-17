import { Suspense } from "react";
import DeviceCapabilities from "./device-capabilities";

export default async function DeviceCapabilitiesPage({
	searchParams,
}: {
	searchParams: Promise<{ agent_id?: string; code?: string }>;
}) {
	const { agent_id, code } = await searchParams;
	return (
		<Suspense
			fallback={
				<div className="flex min-h-screen items-center justify-center">
					<svg
						className="h-4 w-4 animate-spin text-muted"
						fill="none"
						viewBox="0 0 24 24"
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
				</div>
			}
		>
			<DeviceCapabilities agentId={agent_id} code={code} />
		</Suspense>
	);
}
