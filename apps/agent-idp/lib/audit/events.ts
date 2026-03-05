export type ActorType = "user" | "agent" | "system";

export type AuditEventType =
	| "agent.created"
	| "agent.updated"
	| "agent.revoked"
	| "agent.reactivated"
	| "agent.key_rotated"
	| "agent.cleanup"
	| "host.created"
	| "host.enrolled"
	| "host.updated"
	| "host.revoked"
	| "host.reactivated"
	| "host.key_rotated"
	| "host.remote_created"
	| "host.token_regenerated"
	| "scope.requested"
	| "scope.approved"
	| "scope.denied"
	| "scope.granted"
	| "scope.added"
	| "scope.removed"
	| "ciba.authorized"
	| "ciba.approved"
	| "ciba.denied"
	| "connection.created"
	| "connection.deleted"
	| "connection.user_connected"
	| "settings.updated"
	| "user_preference.updated";

export interface AuditEvent {
	eventType: AuditEventType;
	orgId: string;
	actorId?: string;
	actorType?: ActorType;
	agentId?: string;
	hostId?: string;
	targetId?: string;
	targetType?: string;
	metadata?: Record<string, unknown>;
	ip?: string;
	userAgent?: string;
}

export interface ToolExecution {
	orgId: string;
	agentId: string;
	agentName?: string;
	userId?: string;
	tool: string;
	provider?: string;
	toolArgs?: Record<string, unknown>;
	toolOutput?: unknown;
	status: "success" | "error";
	durationMs?: number;
	error?: string;
	metadata?: Record<string, unknown>;
}
