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
						className="animate-spin h-4 w-4 text-muted"
						viewBox="0 0 24 24"
						fill="none"
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
				</div>
			}
		>
			<DeviceCapabilities agentId={agent_id} code={code} />
		</Suspense>
	);
}
