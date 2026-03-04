/** Arbitrary key-value metadata attached to an agent. */
export type AgentMetadata = Record<string, string | number | boolean | null>;

/**
 * The session object returned when an agent authenticates.
 */
export interface AgentSession {
	agent: {
		id: string;
		name: string;
		mode: "delegated" | "autonomous";
		permissions: Array<{
			scope: string;
			referenceId: string | null;
			grantedBy: string | null;
			status: string;
		}>;
		hostId: string | null;
		createdAt: Date;
		activatedAt: Date | null;
		metadata: AgentMetadata | null;
	};
	user: {
		id: string;
		name: string;
		email: string;
		[key: string]: string | number | boolean | null | undefined;
	} | null;
}
